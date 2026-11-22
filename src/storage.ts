import type { Note } from "./model";
const DB = "mpp-notes-v1";
const diskVersions=new WeakMap<Note,string>();
type StoredNote=Omit<Note,"pages">&{pages?:Note["pages"];__mppPageIds?:string[];__mppStorageVersion?:string};
export const storedNoteVersion=(note:Note)=>diskVersions.get(note);
// Legacy notes keep their embedded pages until the next successful save. This
// avoids a large, destructive rewrite during the database version upgrade.
function restoreNote(tx:IDBTransaction,stored:StoredNote,missing:string[]):Note{
  const {__mppStorageVersion:version,__mppPageIds:ids,pages,...metadata}=stored;
  const note:Note={...metadata,pages:ids?new Array(ids.length):pages||[]};
  if(version)diskVersions.set(note,version);
  ids?.forEach((id,index)=>{
    const request=tx.objectStore("pages").get([note.id,id]);
    request.onsuccess=()=>{
      if(!request.result){missing.push(id);return;}
      const {noteId:_,...page}=request.result;note.pages[index]=page;
    };
  });
  return note;
}
function verifyPages(missing:string[]){if(missing.length)throw new Error("保存済みのページを読み込めませんでした。再読み込みしてください。");}
export async function readSyncMetadata(id:string,version:string):Promise<Omit<Note,"pdf">>{
  const db=await openDB(),tx=db.transaction(["notes","pages"],"readonly"),request=tx.objectStore("notes").get(id);
  const missing:string[]=[];let note:Note|undefined;
  request.onsuccess=()=>{const stored=request.result as StoredNote|undefined;if(stored?.__mppStorageVersion===version)note=restoreNote(tx,stored,missing);};
  await completion(db,tx);
  if(!note){const error=new Error("保存済みのノートが変更されたため同期を延期しました。");error.name="SyncWorkInterrupted";throw error;}
  verifyPages(missing);const {pdf:_,...metadata}=note;return metadata;
}
export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 3);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("notes"))
        r.result.createObjectStore("notes", { keyPath: "id" });
      if (!r.result.objectStoreNames.contains("pdfs"))
        r.result.createObjectStore("pdfs");
      if (!r.result.objectStoreNames.contains("pages")) {
        const pages=r.result.createObjectStore("pages",{keyPath:["noteId","id"]});
        pages.createIndex("noteId","noteId");
      }
      if (!r.result.objectStoreNames.contains("settings"))
        r.result.createObjectStore("settings");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error("別のタブを閉じてから再読み込みしてください。"));
  });
}
function completion(db: IDBDatabase, tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("保存に失敗しました"));
    };
  });
}
function put(tx: IDBTransaction, note: Note, add = false, previous?:Note) {
  const { pdf, pages, ...metadata } = note;
  const version=crypto.randomUUID(),store=tx.objectStore("notes"),pageStore=tx.objectStore("pages");
  tx.addEventListener("complete",()=>diskVersions.set(note,version),{once:true});
  const request=store.get(note.id);
  request.onsuccess=()=>{
    const old=request.result as StoredNote|undefined;
    // Delta writes are valid only against the exact committed base. A stale
    // caller or an unstamped legacy note falls back to a complete page save.
    const base=previous&&previous.id===note.id&&diskVersions.has(previous)&&old?.__mppPageIds&&
      old.__mppStorageVersion===diskVersions.get(previous)?new Map(previous.pages.map(p=>[p.id,p])):undefined;
    const ids=pages.map(p=>p.id),keep=new Set(ids);
    const stored={...metadata,__mppPageIds:ids,__mppStorageVersion:version};
    if(add)store.add(stored);else store.put(stored);
    for(const page of pages)if(base?.get(page.id)!==page)pageStore.put({noteId:note.id,...page});
    for(const id of old?.__mppPageIds||[])if(!keep.has(id))pageStore.delete([note.id,id]);
  };
  if (pdf) {
    const assets = tx.objectStore("pdfs"),r=assets.getKey(note.id);
    r.onsuccess = () => {if(r.result===undefined)assets.put(pdf,note.id);};
  }
}
export async function loadNotes(): Promise<Note[]> {
  const db = await openDB(),tx=db.transaction(["notes","pdfs","pages"],"readonly");
  const missing:string[]=[];let notes:Note[]=[];
  const request=tx.objectStore("notes").getAll();
  request.onsuccess=()=>{
    notes=request.result.map((stored:StoredNote)=>restoreNote(tx,stored,missing));
    for(const note of notes){const r=tx.objectStore("pdfs").get(note.id);r.onsuccess=()=>{if(r.result)note.pdf=r.result;};}
  };
  await completion(db,tx);verifyPages(missing);return notes;
}
// previous must be the immutable model that this edit was based on. Ordinary
// callers may omit it and continue saving in-place changes as before.
export async function saveNote(note: Note,previous?:Note) {
  const db=await openDB(),tx=db.transaction(["notes","pdfs","pages"],"readwrite");
  put(tx,note,false,previous);await completion(db,tx);
}
export async function deleteNote(id: string) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "pages"], "readwrite");
  const keys=tx.objectStore("pages").index("noteId").getAllKeys(id);
  keys.onsuccess=()=>keys.result.forEach(key=>tx.objectStore("pages").delete(key));
  tx.objectStore("notes").delete(id);
  tx.objectStore("pdfs").delete(id);
  await completion(db, tx);
}
export async function saveMany(notes: Note[], folders?: string[]) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "settings", "pages"], "readwrite");
  notes.forEach((n) => put(tx, n, true));
  if (folders) tx.objectStore("settings").put(folders, "folders");
  await completion(db, tx);
}
export async function saveSnapshot(notes: Note[], folders?: string[]) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "settings", "pages"], "readwrite");
  tx.objectStore("pages").clear();
  tx.objectStore("notes").clear();
  tx.objectStore("pdfs").clear();
  notes.forEach((n) => put(tx, n));
  if (folders) tx.objectStore("settings").put(folders, "folders");
  await completion(db, tx);
}
export function storageMessage(e: unknown) {
  return e instanceof DOMException && e.name === "QuotaExceededError"
    ? "端末の保存容量が不足しています。バックアップを書き出してから不要なノートを削除してください。"
    : "端末への保存に失敗しました。バックアップを書き出し、空き容量やブラウザーの保存設定を確認してください。";
}
export async function loadFolders(): Promise<string[]> {
  const db = await openDB();
  const tx = db.transaction("settings", "readonly");
  const r = tx.objectStore("settings").get("folders");
  await completion(db, tx);
  return Array.isArray(r.result) ? r.result : [];
}
export async function saveFolders(folders: string[]) {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(folders, "folders");
  await completion(db, tx);
}
import type { Preferences } from "./preferences";
export async function loadPreferences(): Promise<unknown> {
  const db = await openDB();
  const tx = db.transaction("settings", "readonly");
  const request = tx.objectStore("settings").get("preferences");
  await completion(db, tx);
  return request.result;
}
export async function savePreferences(value: Preferences) {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(value, "preferences");
  await completion(db, tx);
}
export async function loadSetting<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction("settings", "readonly");
  const request = tx.objectStore("settings").get(key);
  await completion(db, tx);
  return request.result;
}
export async function saveSetting(key: string, value: unknown) {
  const db = await openDB();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(value, key);
  await completion(db, tx);
}
export async function saveSyncSnapshot(
  notes: Note[],
  folders: string[],
  key: string,
  state: unknown,
) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "settings", "pages"], "readwrite");
  tx.objectStore("pages").clear();
  tx.objectStore("notes").clear();
  tx.objectStore("pdfs").clear();
  notes.forEach((n) => put(tx, n));
  tx.objectStore("settings").put(folders, "folders");
  tx.objectStore("settings").put(state, key);
  await completion(db, tx);
}
