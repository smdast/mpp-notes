import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { newNote } from "./model";
import { saveNote, loadNotes, deleteNote, saveMany } from "./storage";
it("saves changes and the original PDF, restores and deletes", async () => {
  const n = { ...newNote("保存テスト"), pdf: new Uint8Array([1, 2, 3]) };
  await saveNote(n);
  n.title = "変更後";
  await saveNote(n);
  const all = await loadNotes();
  expect(all.find((x) => x.id === n.id)?.title).toBe("変更後");
  expect(all.find((x) => x.id === n.id)?.pdf).toEqual(n.pdf);
  await deleteNote(n.id);
  expect((await loadNotes()).some((x) => x.id === n.id)).toBe(false);
});
it("rolls back all imported notes when a transaction fails", async () => {
  const a = newNote("A");
  await expect(saveMany([a, a])).rejects.toBeTruthy();
  expect((await loadNotes()).some((x) => x.id === a.id)).toBe(false);
});
