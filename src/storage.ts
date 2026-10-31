import type { Note } from "./model";
const DB = "mpp-notes-v1";
export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("notes"))
        r.result.createObjectStore("notes", { keyPath: "id" });
      if (!r.result.objectStoreNames.contains("pdfs"))
        r.result.createObjectStore("pdfs");
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
function put(tx: IDBTransaction, note: Note, add = false) {
  const { pdf, ...metadata } = note;
  const store = tx.objectStore("notes");
  if (add) store.add(metadata);
  else store.put(metadata);
  if (pdf) {
    const assets = tx.objectStore("pdfs");
    const r = assets.getKey(note.id);
    r.onsuccess = () => {
      if (r.result === undefined) assets.put(pdf, note.id);
    };
  }
}
export async function loadNotes(): Promise<Note[]> {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs"], "readonly");
  let notes: Note[] = [];
  const request = tx.objectStore("notes").getAll();
  request.onsuccess = () => {
    notes = request.result;
    for (const note of notes) {
      const r = tx.objectStore("pdfs").get(note.id);
      r.onsuccess = () => {
        if (r.result) note.pdf = r.result;
      };
    }
  };
  await completion(db, tx);
  return notes;
}
export async function saveNote(note: Note) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs"], "readwrite");
  put(tx, note);
  await completion(db, tx);
}
export async function deleteNote(id: string) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs"], "readwrite");
  tx.objectStore("notes").delete(id);
  tx.objectStore("pdfs").delete(id);
  await completion(db, tx);
}
export async function saveMany(notes: Note[], folders?: string[]) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "settings"], "readwrite");
  notes.forEach((n) => put(tx, n, true));
  if (folders) tx.objectStore("settings").put(folders, "folders");
  await completion(db, tx);
}
export async function saveSnapshot(notes: Note[], folders?: string[]) {
  const db = await openDB();
  const tx = db.transaction(["notes", "pdfs", "settings"], "readwrite");
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
