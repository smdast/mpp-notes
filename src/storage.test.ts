import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {defaultPreferences, readPreferences} from "./preferences";
import { newNote } from "./model";
import { saveNote, loadNotes, deleteNote, saveMany, savePreferences, loadPreferences } from "./storage";
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

it("restores eraser modes and fine pen widths from a new database connection",async()=>{
 for(const eraserMode of ["area","stroke"] as const){
  const prefs=defaultPreferences();prefs.eraserMode=eraserMode;prefs.pens.pen1.width=.2;prefs.pens.pen2.width=13.8;
  await savePreferences(prefs);
  const restored=readPreferences(await loadPreferences());
  expect(restored.eraserMode).toBe(eraserMode);expect(restored.pens.pen1.width).toBe(.2);expect(restored.pens.pen2.width).toBe(13.8);
 }
 expect(readPreferences({eraserMode:"invalid"}).eraserMode).toBe("stroke");
 expect(readPreferences({}).eraserMode).toBe("stroke");
});
