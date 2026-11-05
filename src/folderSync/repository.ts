import {unzipSync, strToU8, strFromU8} from "fflate";
import {readBackupBundle} from "../backup";
import {canUseSyncWorker,packInBackground,readFolderInBackground} from "../syncWork";
import type {PdfReference} from "../syncCodec";
import {hash, validRevision, type Payload, type Repository, type Revision, type SyncState} from "../drive/sync";
import {FolderPending, readFile, writeFile, notFound, type SyncDirectory} from "./files";

export const SYNC_DIRECTORY = "MPP Notes Sync";
const MARKER = "mpp-notes-sync.json";
const FORMAT = {format: "mpp-notes-folder-sync", version: 1};
const MAX = 250 * 1024 * 1024;
const payloadName = /^(note-[a-f0-9]{64}\.zip|folders-[a-f0-9]{64}\.json|pdf-[a-f0-9]{64}\.pdf)$/;
const eventName = /^event-[a-zA-Z0-9_-]{1,128}-[a-f0-9]{64}\.json$/;
const cache = new WeakMap<Uint8Array, Promise<string>>();
const pdfDigest = (bytes: Uint8Array) => {let value = cache.get(bytes);if (!value) {value = hash(bytes);cache.set(bytes, value);}return value;};

export class FolderRepository implements Repository {
  private events = new Map<string, Revision>();
  private verified = new Set<string>();
  private pdfs = new Map<string, Uint8Array>();
  private stopped = false;
  private checkpoint:()=>Promise<void>=async()=>{};
  setCheckpoint(checkpoint:()=>Promise<void>){this.checkpoint=checkpoint;}
  static readFrom(directory:SyncDirectory,name:string){return new FolderRepository(directory).read(name);}
  private constructor(readonly directory: SyncDirectory) {}
  static async open(selected: SyncDirectory) {
    const directory = selected.name === SYNC_DIRECTORY ? selected : await selected.getDirectoryHandle(SYNC_DIRECTORY, {create: true});
    let marker: Uint8Array | undefined;
    try {const file=await (await directory.getFileHandle(MARKER)).getFile();if(file.size>4096)throw new Error("同期フォルダーの識別ファイルが無効です。");marker = new Uint8Array(await file.arrayBuffer());}
    catch (error) {if (!notFound(error)) throw error;}
    if (marker?.length) {
      let value;try {value = JSON.parse(strFromU8(marker));} catch {throw new FolderPending("同期フォルダーの情報を読み取れません。PCの同期完了を確認してください。");}
      if (value?.format !== FORMAT.format || value.version !== 1) throw new Error("このフォルダーの同期形式には対応していません。別のフォルダーを選んでください。");
    } else {
      for await (const entry of directory.values()) {
        if (eventName.test(entry.name) || payloadName.test(entry.name)) throw new FolderPending("同期フォルダーの識別ファイルがまだ届いていません。PCの同期完了を待って再試行してください。");
      }
      await writeFile(directory, MARKER, strToU8(JSON.stringify(FORMAT)));
    }
    return new FolderRepository(directory);
  }
  stop() {this.stopped = true;}
  private check() {if (this.stopped) throw new Error("フォルダー同期を停止しました。");}
  private async bytes(name: string, max = MAX) {
    await this.checkpoint();
    this.check();
    if (!payloadName.test(name)) throw new Error("同期ファイルの参照が無効です。");
    const bytes = await readFile(this.directory, name, max);
    const digest = name.split("-")[1].split(".")[0];
    if (await hash(bytes) !== digest) throw new FolderPending("同期ファイルの内容を確認できません。PCの同期完了後に再試行します。改善しない場合は保存先のファイルを確認してください。");
    return bytes;
  }
  private async store(kind: "note" | "folders" | "pdf", bytes: Uint8Array, digest?: string) {
    await this.checkpoint();
    this.check();if (bytes.length > MAX) throw new Error("同期ファイルがサイズ上限（250 MB）を超えています。");
    const name = `${kind}-${digest || await hash(bytes)}.${kind === "note" ? "zip" : kind === "pdf" ? "pdf" : "json"}`;
    if (this.verified.has(name)) return name;
    let exists = false;
    try {const file = await (await this.directory.getFileHandle(name)).getFile();exists = file.size > 0;if (exists && await hash(new Uint8Array(await file.arrayBuffer())) !== name.split("-")[1].split(".")[0]) throw new FolderPending("同名の同期ファイルを確認できません。上書きせず停止しました。");}
    catch (error) {if (!notFound(error)) throw error;}
    if (!exists) {await this.checkpoint();this.check();await writeFile(this.directory, name, bytes);}
    this.verified.add(name);return name;
  }
  async write(payload: Payload) {
    await this.checkpoint();
    if (payload.kind === "folders") return this.store("folders", strToU8(JSON.stringify(payload)));
    const {pdf} = payload.note;
    let reference:PdfReference|undefined;
    if (pdf) {
      const digest = await pdfDigest(pdf), name = await this.store("pdf", pdf, digest);
      reference={name,digest};
    }
    await this.checkpoint();
    const bytes=await packInBackground(payload.note,reference);
    await this.checkpoint();return this.store("note",bytes);
  }
  async event(revision: Revision) {
    await this.checkpoint();
    this.check();if (!validRevision(revision)) throw new Error("同期履歴が無効です。");
    const bytes = strToU8(JSON.stringify(revision));
    const name = `event-${revision.id}-${await hash(bytes)}.json`;
    // Unique immutable files prevent cloud clients from overwriting other edits.
    if (!this.events.has(name)) await writeFile(this.directory, name, bytes);
    this.events.set(name, revision);
  }
  async list() {
    this.check();const names: string[] = [], available = new Set<string>();
    for await (const entry of this.directory.values()) {
      if((names.length+available.size)%128===0)await this.checkpoint();
      if (entry.kind !== "file") continue;
      if (eventName.test(entry.name)) names.push(entry.name);
      if (payloadName.test(entry.name)) available.add(entry.name);
    }
    if (names.length > 50000) throw new Error("同期履歴が多すぎます。新しい保存先への切り替えをご検討ください。");
    const events: Revision[] = [];
    for (const name of names.sort()) {
      if(events.length%128===0)await this.checkpoint();
      let revision = this.events.get(name);
      if (!revision) {
        const bytes = await readFile(this.directory, name, 1024 * 1024);
        if (!name.endsWith(`-${await hash(bytes)}.json`)) throw new FolderPending("同期履歴の到着を待っています。PCの同期完了後に再試行します。");
        let value;try {value = JSON.parse(strFromU8(bytes));} catch {throw new FolderPending("同期履歴を読み取れません。端末内のノートは保持しています。");}
        if (!validRevision(value) || name !== `event-${value.id}-${await hash(bytes)}.json`) throw new Error("未対応または無効な同期履歴があります。");
        revision = value;this.events.set(name, revision);
      }
      if (revision.kind !== "delete" && (!revision.fileId || !payloadName.test(revision.fileId) || !available.has(revision.fileId))) throw new FolderPending();
      events.push(revision);
    }
    const ids = new Set(events.map(e => e.id));
    if (events.some(e => e.parents.some(id => !ids.has(id)))) throw new FolderPending("同期履歴がまだ揃っていません。端末内のノートは保持して再試行します。");
    return events;
  }
  async verifyKnown(state: SyncState) {
    const ids = new Set((await this.list()).map(e => e.id));
    if (Object.values(state.known).some(value => value.heads.some(id => !ids.has(id)))) throw new FolderPending("前回の同期履歴が見つかりません。保存先とPCの同期状況を確認してください。端末内のノートは保持しています。");
  }
  async read(name: string): Promise<Payload> {
    await this.checkpoint();
    if(canUseSyncWorker()&&name.startsWith("note-")){
      const payload=await readFolderInBackground(this.directory,name);await this.checkpoint();return payload;
    }
    const bytes = await this.bytes(name);
    if (name.startsWith("folders-")) {
      let value;try {value = JSON.parse(strFromU8(bytes));} catch {throw new Error("フォルダーの同期データが無効です。");}
      if (value?.kind !== "folders" || !Array.isArray(value.folders) || value.folders.length > 20000 || value.folders.some((f: unknown) => typeof f !== "string" || f.length > 2019 || f === "*")) throw new Error("フォルダーの同期データが無効です。");
      return value;
    }
    if (!name.startsWith("note-")) throw new Error("同期ノートの参照が無効です。");
    let expanded = 0;
    const files = unzipSync(bytes, {filter: file => {expanded += file.originalSize;if (expanded > MAX) throw new Error("同期ファイルがサイズ上限を超えています。");return true;}});
    let attachments: Record<string, Uint8Array> | undefined;
    if (files["folder-pdf.json"]) {
      const reference = JSON.parse(strFromU8(files["folder-pdf.json"]));
      if (typeof reference.name !== "string" || !/^pdf-[a-f0-9]{64}\.pdf$/.test(reference.name) || reference.name !== `pdf-${reference.digest}.pdf`) throw new Error("同期PDFの参照が無効です。");
      let pdf = this.pdfs.get(reference.name);
      if (!pdf) {pdf = await this.bytes(reference.name, 100 * 1024 * 1024);if (this.pdfs.size >= 2) this.pdfs.delete(this.pdfs.keys().next().value!);this.pdfs.set(reference.name, pdf);}
      const manifest = JSON.parse(strFromU8(files["manifest.json"])), path = manifest.notes?.[0]?.pdfFile;
      if (typeof path !== "string") throw new Error("同期PDFの情報が不足しています。");
      attachments = {[path]: pdf};
    }
    const result = readBackupBundle(bytes, true, attachments);
    if (result.notes.length !== 1) throw new Error("同期ノートの形式が無効です。");
    return {kind: "note", note: result.notes[0]};
  }
}
