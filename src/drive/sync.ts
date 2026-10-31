import { uid, type Note } from "../model";
import { normalizeFolders } from "../folders";
export type Payload =
  | { kind: "note"; note: Note }
  | { kind: "folders"; folders: string[] };
export type Revision = {
  format: "mpp-sync";
  version: 1;
  id: string;
  entity: string;
  parents: string[];
  kind: "note" | "folders" | "delete";
  fileId?: string;
  device: string;
  time: number;
};
export type Known = { heads: string[]; fingerprint: string };
export type SyncState = {
  version: 1;
  device: string;
  known: Record<string, Known>;
};
export type LibrarySnapshot = { notes: Note[]; folders: string[] };
export type Repository = {
  list: () => Promise<Revision[]>;
  read: (fileId: string) => Promise<Payload>;
  write: (payload: Payload) => Promise<string>;
  event: (revision: Revision) => Promise<void>;
};
export const newSyncState = (): SyncState => ({
  version: 1,
  device: uid(),
  known: {},
});
export class SyncRetry extends Error {
  constructor() {
    super("編集中の変更を保護しました。次回の同期で再試行します。");
  }
}
export const hash = async (value: string | Uint8Array) => {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
const noteHash = new WeakMap<Note, Promise<string>>(),
  pdfHash = new WeakMap<Uint8Array, Promise<string>>();
export async function fingerprint(payload: Payload): Promise<string> {
  if (payload.kind === "folders")
    return hash(
      JSON.stringify(
        normalizeFolders(payload.folders).sort((a, b) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      ),
    );
  const n = payload.note;
  let result = noteHash.get(n);
  if (!result) {
    result = (async () => {
      let pdfDigest: string | undefined;
      if (n.pdf) {
        let promise = pdfHash.get(n.pdf);
        if (!promise) {
          promise = hash(n.pdf);
          pdfHash.set(n.pdf, promise);
        }
        pdfDigest = await promise;
      }
      return hash(JSON.stringify(canonical({ ...n, pdf: pdfDigest })));
    })();
    noteHash.set(n, result);
  }
  return result;
}
export function heads(events: Revision[]) {
  const all = new Map(events.map((e) => [e.id, e]));
  const parents = new Set(events.flatMap((e) => e.parents));
  return [...all.values()]
    .filter((e) => !parents.has(e.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function validRevision(value: unknown): value is Revision {
  if (!value || typeof value !== "object") return false;
  const r = value as Revision;
  return (
    r.format === "mpp-sync" &&
    r.version === 1 &&
    typeof r.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(r.id) &&
    typeof r.entity === "string" &&
    r.entity.length > 0 &&
    r.entity.length < 180 &&
    Array.isArray(r.parents) &&
    r.parents.length <= 2000 &&
    r.parents.every((p) => typeof p === "string" && p !== r.id) &&
    ["note", "folders", "delete"].includes(r.kind) &&
    typeof r.device === "string" &&
    Number.isFinite(r.time) &&
    (r.kind === "delete" || typeof r.fileId === "string")
  );
}
const deterministicId = async (value: string) => {
  const h = await hash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
export async function synchronize({
  repository,
  state,
  getLocal,
  persistState,
  apply,
}: {
  repository: Repository;
  state: SyncState;
  getLocal: () => LibrarySnapshot;
  persistState: (s: SyncState) => Promise<void>;
  apply: (
    snapshot: LibrarySnapshot,
    state: SyncState,
    expected: LibrarySnapshot,
  ) => Promise<boolean>;
}) {
  const snapshot = getLocal(),
    startNotes = snapshot.notes,
    startFolders = snapshot.folders;
  const next: SyncState = structuredClone(state);
  let events = await repository.list();
  const byId = new Map(events.map((e) => [e.id, e]));
  let conflicts = 0;
  const cache = new Map<string, Payload>();
  const read = async (e: Revision) => {
    if (!e.fileId) throw new Error("同期データが不足しています。");
    let payload = cache.get(e.id);
    if (!payload) {
      payload = await repository.read(e.fileId);
      cache.set(e.id, payload);
    }
    if (
      payload.kind === "note" &&
      (e.kind !== "note" || payload.note.id !== e.entity)
    )
      throw new Error("同期データのIDが一致しません。");
    if (payload.kind === "folders" && e.kind !== "folders")
      throw new Error("同期データの種類が一致しません。");
    return payload;
  };
  const append = async (revision: Revision, payload?: Payload) => {
    if (byId.has(revision.id)) return byId.get(revision.id)!;
    if (payload) {
      revision.fileId = await repository.write(payload);
      cache.set(revision.id, payload);
    }
    await repository.event(revision);
    byId.set(revision.id, revision);
    events.push(revision);
    return revision;
  };
  const grouped = (entity: string) =>
    heads(events.filter((e) => e.entity === entity));
  const local = new Map<string, Payload>(
    snapshot.notes.map((note) => [note.id, { kind: "note", note }]),
  );
  local.set("__folders__", { kind: "folders", folders: snapshot.folders });
  for (const entity of new Set([...local.keys(), ...Object.keys(next.known)])) {
    const payload = local.get(entity),
      base = next.known[entity],
      fp = payload ? await fingerprint(payload) : "-";
    const remote = grouped(entity);
    if (base?.fingerprint === fp && base.heads.every((id) => byId.has(id)))
      continue;
    if (!payload && fp === "-" && !remote.length) continue;
    if (
      !base &&
      payload &&
      remote.length === 1 &&
      remote[0].kind !== "delete" &&
      (await fingerprint(await read(remote[0]))) === fp
    ) {
      next.known[entity] = { heads: [remote[0].id], fingerprint: fp };
      continue;
    }
    if (
      !base &&
      entity === "__folders__" &&
      snapshot.folders.length === 0 &&
      remote.length
    )
      continue;
    if (!payload && !base) continue;
    const revision: Revision = {
      format: "mpp-sync",
      version: 1,
      id: uid(),
      entity,
      parents: base?.heads || [],
      kind: payload?.kind || "delete",
      device: next.device,
      time: Date.now(),
    };
    await append(revision, payload);
    next.known[entity] = { heads: [revision.id], fingerprint: fp };
    await persistState(next);
  }
  // Include changes made by another device during upload. Immutable events avoid lost overwrites.
  const fresh = await repository.list();
  for (const event of fresh)
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
      events.push(event);
    }
  const resultNotes = new Map<string, Note>(),
    resultFolders = new Set<string>();
  for (const entity of [...new Set(events.map((e) => e.entity))].sort()) {
    let current = grouped(entity);
    if (!current.length)
      throw new Error(
        "同期履歴を読み取れません。端末内のノートは保持しました。",
      );
    if (current.length > 1) {
      const live = current.filter((e) => e.kind !== "delete"),
        parentIds = current.map((e) => e.id).sort(),
        stamp = Math.max(...current.map((e) => e.time));
      if (entity === "__folders__") {
        const folders: string[] = [];
        for (const event of live) {
          const value = await read(event);
          if (value.kind === "folders") folders.push(...value.folders);
        }
        const payload: Payload = {
          kind: "folders",
          folders: normalizeFolders(folders),
        };
        const revision: Revision = {
          format: "mpp-sync",
          version: 1,
          id: await deterministicId("merge-folders:" + parentIds.join(",")),
          entity,
          parents: parentIds,
          kind: "folders",
          device: "merge",
          time: stamp,
        };
        current = [await append(revision, payload)];
      } else if (live.length) {
        const deleted = current.some((e) => e.kind === "delete"),
          primary = deleted ? undefined : live[0];
        for (const event of deleted ? live : live.slice(1)) {
          const value = await read(event);
          if (value.kind !== "note") throw new Error("同期データが無効です。");
          const id = await deterministicId(
            "conflict:" + entity + ":" + event.id,
          );
          const pages = await Promise.all(
            value.note.pages.map(async (page) => ({
              ...page,
              id: await deterministicId("page:" + id + ":" + page.id),
            })),
          );
          const copy: Note = {
            ...value.note,
            id,
            pages,
            title: value.note.title.slice(0, 288) + "（競合コピー）",
          };
          const payload: Payload = { kind: "note", note: copy };
          const revision: Revision = {
            format: "mpp-sync",
            version: 1,
            id: await deterministicId("copy:" + entity + ":" + event.id),
            entity: id,
            parents: [],
            kind: "note",
            device: "merge",
            time: stamp,
          };
          await append(revision, payload);
          resultNotes.set(id, copy);
          next.known[id] = {
            heads: [revision.id],
            fingerprint: await fingerprint(payload),
          };
          conflicts++;
        }
        const payload = primary ? await read(primary) : undefined;
        const resolution: Revision = {
          format: "mpp-sync",
          version: 1,
          id: await deterministicId("merge-note:" + parentIds.join(",")),
          entity,
          parents: parentIds,
          kind: deleted ? "delete" : "note",
          device: "merge",
          time: stamp,
        };
        current = [await append(resolution, payload)];
      } else {
        const revision: Revision = {
          format: "mpp-sync",
          version: 1,
          id: await deterministicId("merge-delete:" + parentIds.join(",")),
          entity,
          parents: parentIds,
          kind: "delete",
          device: "merge",
          time: stamp,
        };
        current = [await append(revision)];
      }
    }
    const event = current[0];
    if (event.kind === "delete") {
      next.known[entity] = { heads: [event.id], fingerprint: "-" };
      continue;
    }
    const payload = await read(event);
    next.known[entity] = {
      heads: [event.id],
      fingerprint: await fingerprint(payload),
    };
    if (payload.kind === "folders")
      payload.folders.forEach((f) => resultFolders.add(f));
    else resultNotes.set(payload.note.id, payload.note);
  }
  const notes = [...resultNotes.values()],
    folders = normalizeFolders([
      ...resultFolders,
      ...notes.flatMap((n) => (n.folder ? [n.folder] : [])),
    ]);
  if (next.known.__folders__)
    next.known.__folders__.fingerprint = await fingerprint({
      kind: "folders",
      folders,
    });
  const current = getLocal();
  if (current.notes !== startNotes || current.folders !== startFolders)
    throw new SyncRetry();
  const changed =
    notes.length !== startNotes.length ||
    (await fingerprint({ kind: "folders", folders })) !==
      (await fingerprint({ kind: "folders", folders: startFolders })) ||
    (
      await Promise.all(
        notes.map(async (n) => {
          const old = startNotes.find((o) => o.id === n.id);
          return (
            !old ||
            (await fingerprint({ kind: "note", note: n })) !==
              (await fingerprint({ kind: "note", note: old }))
          );
        }),
      )
    ).some(Boolean);
  if (changed) {
    if (!(await apply({ notes, folders }, next, snapshot)))
      throw new SyncRetry();
  } else await persistState(next);
  return { state: next, conflicts, changed };
}
