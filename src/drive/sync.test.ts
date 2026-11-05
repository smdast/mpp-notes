import { it, expect } from "vitest";
import { makeBackup, readBackupBundle } from "../backup";
import { newNote, type Note } from "../model";
import {
  newSyncState,
  synchronize,
  SyncRetry,
  type Repository,
  type Revision,
  type Payload,
  type SyncState,
  type LibrarySnapshot,
} from "./sync";
class MemoryDrive implements Repository {
  reads=0;
  events: Revision[] = [];
  payloads = new Map<string, Payload>();
  afterWrite?: () => void;
  async list() {
    return structuredClone(this.events);
  }
  async read(id: string) {
    this.reads++;
    const value = this.payloads.get(id);
    if (!value) throw new Error("Missing");
    return value.kind === "note"
      ? {
          kind: "note" as const,
          note: readBackupBundle(makeBackup([value.note]), true).notes[0],
        }
      : structuredClone(value);
  }
  async write(payload: Payload) {
    const id = crypto.randomUUID();
    this.payloads.set(id, structuredClone(payload));
    this.afterWrite?.();
    this.afterWrite = undefined;
    return id;
  }
  async event(event: Revision) {
    this.events.push(structuredClone(event));
  }
}
it("keeps timestamps stable and avoids no-op sync edits after archive round trips", async () => {
  const repo = new MemoryDrive(),
    note = newNote("変更なし");
  const a = client(repo, [note]),
    b = client(repo);
  await a.run();
  await b.run();
  repo.reads=0;
  const count = repo.events.length;
  expect(b.local.notes[0].updated).toBe(note.updated);
  expect((await b.run()).changed).toBe(false);
  expect((await a.run()).changed).toBe(false);
  expect(repo.events).toHaveLength(count);
  expect(repo.reads).toBe(0);
});
it("defers before publishing a new revision if writing resumes while preparing its payload",async()=>{
  const repo=new MemoryDrive(),a=client(repo,[newNote("最初")]);await a.run();const count=repo.events.length;
  a.local={...a.local,notes:[{...a.local.notes[0],title:"保持する変更"}]};let writing=false,applied=false;
  repo.afterWrite=()=>{writing=true;};
  await expect(synchronize({repository:repo,state:a.state,getLocal:()=>a.local,persistState:async state=>{a.state=state;},apply:async()=>{applied=true;return true;},checkpoint:async()=>{if(writing)throw new SyncRetry();}})).rejects.toBeInstanceOf(SyncRetry);
  expect(repo.events).toHaveLength(count);expect(applied).toBe(false);expect(a.local.notes[0].title).toBe("保持する変更");
  await a.run();expect(a.local.notes).toHaveLength(1);expect(repo.events).toHaveLength(count+1);
});
function client(repo: MemoryDrive, notes: Note[] = [], folders: string[] = []) {
  const c = {
    state: newSyncState(),
    local: { notes, folders } as LibrarySnapshot,
    async run() {
      const result = await synchronize({
        repository: repo,
        state: c.state,
        getLocal: () => c.local,
        persistState: async (state) => {
          c.state = structuredClone(state);
        },
        apply: async (next, state, expected) => {
          if (
            c.local.notes !== expected.notes ||
            c.local.folders !== expected.folders
          )
            return false;
          c.local = next;
          c.state = structuredClone(state);
          return true;
        },
      });
      c.state = result.state;
      return result;
    },
  };
  return c;
}
it("automatically exchanges edits, nested folders and deletion between two devices", async () => {
  const repo = new MemoryDrive(),
    n = newNote("最初");
  const a = client(repo, [n], ["学校", "学校/数学"]),
    b = client(repo);
  await a.run();
  await b.run();
  expect(b.local.notes[0].id).toBe(n.id);
  expect(b.local.folders).toContain("学校/数学");
  a.local = { ...a.local, notes: [{ ...a.local.notes[0], title: "更新済み" }] };
  await a.run();
  await b.run();
  expect(b.local.notes[0].title).toBe("更新済み");
  a.local = { ...a.local, notes: [] };
  await a.run();
  await b.run();
  expect(b.local.notes).toEqual([]);
});
it("preserves both concurrent edits and creates each conflict copy only once", async () => {
  const repo = new MemoryDrive(),
    n = newNote("元");
  const a = client(repo, [n]),
    b = client(repo);
  await a.run();
  await b.run();
  a.local = {
    ...a.local,
    notes: [{ ...a.local.notes[0], title: "端末Aの編集" }],
  };
  b.local = {
    ...b.local,
    notes: [{ ...b.local.notes[0], title: "端末Bの編集" }],
  };
  await a.run();
  const result = await b.run();
  expect(result.conflicts).toBe(1);
  expect(b.local.notes).toHaveLength(2);
  expect(b.local.notes.some((n) => n.title.includes("端末A"))).toBe(true);
  expect(b.local.notes.some((n) => n.title.includes("端末B"))).toBe(true);
  expect(
    new Set(b.local.notes.flatMap((n) => n.pages.map((p) => p.id))).size,
  ).toBe(2);
  await a.run();
  await b.run();
  expect(a.local.notes).toHaveLength(2);
  expect(b.local.notes).toHaveLength(2);
  const c = client(repo);
  await c.run();
  expect(c.local.notes).toHaveLength(2);
});
it("keeps an edited copy when deletion conflicts with an offline edit", async () => {
  const repo = new MemoryDrive(),
    n = newNote("元");
  const a = client(repo, [n]),
    b = client(repo);
  await a.run();
  await b.run();
  a.local = { ...a.local, notes: [] };
  b.local = {
    ...b.local,
    notes: [{ ...b.local.notes[0], title: "失いたくない編集" }],
  };
  await a.run();
  await b.run();
  expect(b.local.notes).toHaveLength(1);
  expect(b.local.notes[0].title).toContain("競合コピー");
  expect(b.local.notes[0].id).not.toBe(n.id);
  await a.run();
  expect(a.local.notes[0].title).toContain("失いたくない編集");
});
it("does not overwrite local changes made while a sync request was in flight", async () => {
  const repo = new MemoryDrive(),
    n = newNote("最初");
  const a = client(repo, [n]);
  await a.run();
  a.local = { ...a.local, notes: [{ ...n, title: "送信中" }] };
  repo.afterWrite = () => {
    a.local = { ...a.local, notes: [{ ...n, title: "さらに編集" }] };
  };
  await expect(a.run()).rejects.toBeInstanceOf(SyncRetry);
  expect(a.local.notes[0].title).toBe("さらに編集");
  await a.run();
  expect(a.local.notes).toHaveLength(1);
  const b = client(repo);
  await b.run();
  expect(b.local.notes[0].title).toBe("さらに編集");
});
it("reuploads local data if the Drive history has been removed", async () => {
  const repo = new MemoryDrive(),
    n = newNote("端末に残す");
  const a = client(repo, [n]);
  await a.run();
  repo.events = [];
  await a.run();
  expect(a.local.notes[0].title).toBe("端末に残す");
  const b = client(repo);
  await b.run();
  expect(b.local.notes[0].title).toBe("端末に残す");
});
