import {expect,it} from "vitest";
import {newNote} from "./model";
import {normalizeFolders} from "./folders";
import {libraryMoveTarget,moveLibraryItem} from "./libraryMove";

const folders=normalizeFolders(["A/子/孫","B/子","C"]);
const note={...newNote("ノート"),folder:"A/子/孫"};
it("moves a subtree and its notes together while rejecting cycles and name collisions",()=>{
  expect(()=>moveLibraryItem({kind:"folder",id:"A"},"A/子",[note],folders)).toThrow("配下");
  expect(()=>moveLibraryItem({kind:"folder",id:"A/子"},"B",[note],folders)).toThrow("同じ名前");
  const moved=moveLibraryItem({kind:"folder",id:"A/子"},"C",[note],folders);
  expect(moved.folders).toContain("C/子/孫");
  expect(moved.folders).not.toContain("A/子");
  expect(moved.notes[0].folder).toBe("C/子/孫");
  expect(moved.notes[0].pages).toBe(note.pages);
  expect(note.folder).toBe("A/子/孫");
});
it("supports root drops and preserves identities for no-op moves",()=>{
  const moved=moveLibraryItem({kind:"note",id:note.id},"*",[note],folders);
  expect(moved.notes[0].folder).toBeUndefined();
  expect(moved.notes[0].id).toBe(note.id);
  const roots=moveLibraryItem({kind:"folder",id:"A/子"},"*",[note],folders);
  expect(roots.folders).toContain("子/孫");
  expect(roots.notes[0].folder).toBe("子/孫");
  expect(libraryMoveTarget({kind:"note",id:note.id},"A/子/孫",[note],folders)).toBeUndefined();
  expect(libraryMoveTarget({kind:"folder",id:"A/子"},"A",[note],folders)).toBeUndefined();
});
it("rejects missing destinations and descendants that would exceed the nesting limit",()=>{
  expect(()=>moveLibraryItem({kind:"note",id:note.id},"missing",[note],folders)).toThrow("見つかりません");
  const deep=Array.from({length:20},(_,i)=>"階層"+i).join("/");
  expect(()=>moveLibraryItem({kind:"folder",id:"A"},deep,[note],normalizeFolders([...folders,deep]))).toThrow("20階層");
});
