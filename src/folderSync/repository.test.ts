import {it, expect} from "vitest";
import {strToU8} from "fflate";
import {PDFDocument} from "pdf-lib";
import {newNote, type Note} from "../model";
import {newSyncState, synchronize, hash, type LibrarySnapshot, type Revision} from "../drive/sync";
import {FolderRepository, SYNC_DIRECTORY} from "./repository";
import {FolderPending, writeFile, folderError, type SyncDirectory, type SyncFile} from "./files";

class MemoryFile implements SyncFile {
  kind = "file" as const;
  bytes: Uint8Array = new Uint8Array();failClose = false;aborted = false;
  constructor(readonly name: string) {}
  async getFile() {return new File([new Uint8Array(this.bytes).buffer], this.name);}
  async createWritable() {
    let pending: Uint8Array | undefined;
    return {
      write: async (data: Blob) => {pending = new Uint8Array(await data.arrayBuffer());},
      close: async () => {if (this.failClose) throw new DOMException("容量不足", "QuotaExceededError");if (pending) this.bytes = pending;},
      abort: async () => {this.aborted = true;},
    };
  }
}
class MemoryDirectory implements SyncDirectory {
  kind = "directory" as const;
  entries = new Map<string, MemoryDirectory | MemoryFile>();
  permission: PermissionState = "granted";
  constructor(readonly name = "Cloud") {}
  async queryPermission() {return this.permission;}
  async requestPermission() {return this.permission;}
  async isSameEntry(other: SyncDirectory) {return this === other;}
  private check() {if (this.permission !== "granted") throw new DOMException("Denied", "NotAllowedError");}
  async getDirectoryHandle(name: string, options?: {create?: boolean}): Promise<MemoryDirectory> {
    this.check();let entry = this.entries.get(name);
    if (!entry && options?.create) {entry = new MemoryDirectory(name);this.entries.set(name, entry);}
    if (!entry) throw new DOMException("Missing", "NotFoundError");
    if (entry.kind !== "directory") throw new Error("Not a directory");return entry;
  }
  async getFileHandle(name: string, options?: {create?: boolean}): Promise<MemoryFile> {
    this.check();let entry = this.entries.get(name);
    if (!entry && options?.create) {entry = new MemoryFile(name);this.entries.set(name, entry);}
    if (!entry) throw new DOMException("Missing", "NotFoundError");
    if (entry.kind !== "file") throw new Error("Not a file");return entry;
  }
  async *values() {this.check();yield* this.entries.values();}
}
async function device(folder: MemoryDirectory, notes: Note[] = [], folders: string[] = []) {
  const repo = await FolderRepository.open(folder);
  const client = {repo, local: {notes, folders} as LibrarySnapshot, state: newSyncState(), async run() {
    await repo.verifyKnown(client.state);
    const result = await synchronize({repository: repo, state: client.state, getLocal: () => client.local,
      persistState: async state => {client.state = structuredClone(state);},
      apply: async (local, state, expected) => {if (client.local !== expected) return false;client.local = local;client.state = structuredClone(state);return true;},
    });client.state = result.state;return result;
  }};return client;
}
it("uses an application-owned directory and exchanges notes, nested folders, deletion and conflicts between devices", async () => {
  const folder = new MemoryDirectory(), untouched = await folder.getFileHandle("my-document.txt", {create: true});untouched.bytes = strToU8("keep");
  const n = newNote("元のノート"), a = await device(folder, [n], ["学校", "学校/数学"]), b = await device(folder);
  await a.run();await b.run();expect(b.local.notes[0].id).toBe(n.id);expect(b.local.folders).toContain("学校/数学");
  const root = await folder.getDirectoryHandle(SYNC_DIRECTORY);const files = root.entries.size;
  expect((await a.run()).changed).toBe(false);expect(root.entries.size).toBe(files);
  a.local = {...a.local, notes: [{...a.local.notes[0], title: "端末A"}]};
  b.local = {...b.local, notes: [{...b.local.notes[0], title: "端末B"}]};
  await a.run();expect((await b.run()).conflicts).toBe(1);await a.run();
  expect(a.local.notes.map(n => n.title).sort()).toEqual(b.local.notes.map(n => n.title).sort());expect(a.local.notes).toHaveLength(2);
  const removed = a.local.notes[0].id;a.local = {...a.local, notes: a.local.notes.filter(n => n.id !== removed)};
  await a.run();await b.run();expect(b.local.notes.some(n => n.id === removed)).toBe(false);
  expect(untouched.bytes).toEqual(strToU8("keep"));expect(folder.entries.size).toBe(2);
});
it("deduplicates original PDFs across note revisions and restores ink, images, covers and paper", async () => {
  const doc = await PDFDocument.create();doc.addPage([300, 400]);const pdf = await doc.save();
  const folder = new MemoryDirectory(), n = newNote("PDF");n.pdf = pdf;n.pages[0].pdfIndex = 0;
  const png = "data:image/png;base64,iVBORw0KGgo=";n.coverImage = png;n.pages[0].backgroundImage = png;n.pages[0].paperColor = "#1e2822";
  n.pages[0].strokes = [{id: "line", tool: "pen", color: "#ffffff", width: 2, points: [{x: 10, y: 20, p: .5}]}];
  const repo = await FolderRepository.open(folder), first = await repo.write({kind: "note", note: n});
  await repo.write({kind: "note", note: {...n, title: "更新"}});
  const root = await folder.getDirectoryHandle(SYNC_DIRECTORY);
  expect([...root.entries.keys()].filter(name => name.startsWith("pdf-"))).toHaveLength(1);
  const read = await (await FolderRepository.open(folder)).read(first);expect(read.kind).toBe("note");
  if (read.kind === "note") {expect(read.note.pdf).toEqual(pdf);expect(read.note.pages[0].strokes).toEqual(n.pages[0].strokes);expect(read.note.coverImage).toBe(png);expect(read.note.pages[0].backgroundImage).toBe(png);expect(read.note.pages[0].paperColor).toBe("#1e2822");}
});
it("waits for missing payloads and parent revisions without changing the local library", async () => {
  const folder = new MemoryDirectory(), a = await device(folder, [newNote("保存済み")]);await a.run();
  const root = await folder.getDirectoryHandle(SYNC_DIRECTORY), b = await device(folder), before = b.local;
  const payloadName = [...root.entries.keys()].find(name => name.startsWith("note-"))!, payload = root.entries.get(payloadName)!;
  root.entries.delete(payloadName);await expect(b.run()).rejects.toBeInstanceOf(FolderPending);expect(b.local).toBe(before);
  root.entries.set(payloadName, payload);await b.run();expect(b.local.notes[0].title).toBe("保存済み");
  a.local = {...a.local, notes: [{...a.local.notes[0], title: "新しい編集"}]};await a.run();
  const events = await a.repo.list(), parent = events.find(e => events.some(child => child.parents.includes(e.id)))!;
  const name = [...root.entries.keys()].find(name => name.startsWith(`event-${parent.id}-`))!, event = root.entries.get(name)!;
  root.entries.delete(name);const local = b.local;await expect(b.run()).rejects.toBeInstanceOf(FolderPending);expect(b.local).toBe(local);
  root.entries.set(name, event);await b.run();expect(b.local.notes[0].title).toBe("新しい編集");
});
it("does not republish an empty or rolled-back directory over previously synchronized data", async () => {
  const folder = new MemoryDirectory(), a = await device(folder, [newNote()]);await a.run();
  const root = await folder.getDirectoryHandle(SYNC_DIRECTORY), before = a.local;
  for (const name of root.entries.keys()) if (name.startsWith("event-")) root.entries.delete(name);
  await expect(a.run()).rejects.toThrow("前回の同期履歴");expect(a.local).toBe(before);
  expect([...root.entries.keys()].some(name => name.startsWith("event-"))).toBe(false);
});
it("rejects corrupted archives and path traversal references without overwriting local files", async () => {
  const folder = new MemoryDirectory(), repo = await FolderRepository.open(folder), name = await repo.write({kind: "note", note: newNote()});
  const root = await folder.getDirectoryHandle(SYNC_DIRECTORY), file = await root.getFileHandle(name);file.bytes[0] ^= 1;
  await expect(repo.read(name)).rejects.toBeInstanceOf(FolderPending);
  await expect(repo.read("../secret.zip")).rejects.toThrow("参照が無効");
  const revision: Revision = {format: "mpp-sync", version: 1, id: "malicious", entity: "note", parents: [], kind: "note", fileId: "../secret.zip", device: "test", time: 1};
  await repo.event(revision);await expect(repo.list()).rejects.toBeInstanceOf(FolderPending);
  expect([...root.entries.keys()].some(name => name.includes(".."))).toBe(false);
});
it("keeps committed bytes on write failure and never publishes a revision before its payload closes", async () => {
  const root = new MemoryDirectory(), file = await root.getFileHandle("existing", {create: true});file.bytes = strToU8("old");file.failClose = true;
  await expect(writeFile(root, "existing", strToU8("new"))).rejects.toThrow();expect(file.bytes).toEqual(strToU8("old"));expect(file.aborted).toBe(true);
  const folder = new MemoryDirectory(), repo = await FolderRepository.open(folder), sync = await folder.getDirectoryHandle(SYNC_DIRECTORY);
  const original = sync.getFileHandle.bind(sync);
  sync.getFileHandle = async (name, options) => {const file = await original(name, options);if (name.startsWith("note-")) file.failClose = true;return file;};
  const local = {notes: [newNote()], folders: []};
  await expect(synchronize({repository: repo, state: newSyncState(), getLocal: () => local, persistState: async () => {}, apply: async () => true})).rejects.toThrow();
  expect([...sync.entries.keys()].some(name => name.startsWith("event-"))).toBe(false);
});
it("rejects incompatible markers, defers markers still arriving and handles denied permissions", async () => {
  const folder = new MemoryDirectory(), root = await folder.getDirectoryHandle(SYNC_DIRECTORY, {create: true});
  await writeFile(root, "mpp-notes-sync.json", strToU8(JSON.stringify({format: "mpp-notes-folder-sync", version: 99})));
  await expect(FolderRepository.open(folder)).rejects.toThrow("対応していません");
  root.entries.delete("mpp-notes-sync.json");await writeFile(root, `folders-${await hash("test")}.json`, strToU8("test"));
  await expect(FolderRepository.open(folder)).rejects.toBeInstanceOf(FolderPending);expect(root.entries.has("mpp-notes-sync.json")).toBe(false);
  folder.permission = "denied";await expect(FolderRepository.open(folder)).rejects.toMatchObject({name: "NotAllowedError"});
  expect(folderError(new DOMException("Denied", "NotAllowedError"))).toContain("アクセスを許可して再開");expect(folderError(new DOMException("Full", "QuotaExceededError"))).toContain("空き容量");
});
it("recovers a newly created empty marker after an interrupted first save without replacing existing history", async () => {
  const folder=new MemoryDirectory(),root=await folder.getDirectoryHandle(SYNC_DIRECTORY,{create:true});
  await root.getFileHandle("mpp-notes-sync.json",{create:true});
  await expect(FolderRepository.open(folder)).resolves.toBeInstanceOf(FolderRepository);
  expect((await (await root.getFileHandle("mpp-notes-sync.json")).getFile()).size).toBeGreaterThan(0);
});
