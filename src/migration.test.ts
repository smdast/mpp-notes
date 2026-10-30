import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { newNote } from "./model";
import { loadFolders, loadNotes, saveSnapshot, saveFolders } from "./storage";
it("upgrades the old schema without losing notes and supports folder renaming atomically", async () => {
  const old = newNote("既存のノート");
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open("mpp-notes-v1", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("notes", { keyPath: "id" });
      r.result.createObjectStore("pdfs");
    };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put(old);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    r.onerror = () => reject(r.error);
  });
  expect((await loadNotes())[0].id).toBe(old.id);
  await saveFolders(["旧名", "空"]);
  expect(await loadFolders()).toEqual(["旧名", "空"]);
  await saveSnapshot([{ ...old, folder: "新名" }], ["新名", "空"]);
  expect((await loadNotes())[0].folder).toBe("新名");
  expect(await loadFolders()).toEqual(["新名", "空"]);
  await saveSnapshot([{ ...old, folder: undefined }], []);
  expect((await loadNotes())[0].title).toBe(old.title);
  expect(await loadFolders()).toEqual([]);
});
