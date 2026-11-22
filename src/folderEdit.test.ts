import {it,expect} from "vitest";
import {folderEditPath,relocateFolder} from "./folders";
import {newNote} from "./model";
it("renames a nested folder while preserving descendants and note placement",()=>{
 const folders=["仕事","仕事/旧名","仕事/旧名/子"],note={...newNote(),folder:"仕事/旧名/子"};
 const path=folderEditPath(folders," 新名 ","仕事","仕事/旧名");
 const result=relocateFolder(folders,[note],"仕事/旧名",path);
 expect(result.folders).toContain("仕事/新名/子");expect(result.notes[0].folder).toBe("仕事/新名/子");expect(result.notes[0].id).toBe(note.id);
});
it("rejects collisions, invalid names, deep paths and self-descendants before changing folders",()=>{
 expect(()=>folderEditPath(["仕事","仕事/既存"],"既存","仕事")).toThrow("同じ名前");
 for(const name of ["","*","a/b","a".repeat(101)])expect(()=>folderEditPath([],name,"")).toThrow();
 expect(()=>folderEditPath([],"追加",Array(20).fill("親").join("/"))).toThrow("20階層");
 expect(()=>folderEditPath(["仕事","仕事/子"],"別名","仕事/子","仕事")).toThrow("自分の配下");
 expect(folderEditPath(["仕事"],"仕事","","仕事")).toBe("仕事");
});
it("deleting a folder keeps its notes and moves them to its parent",()=>{
 const note={...newNote(),folder:"仕事/旧名/子"};
 const result=relocateFolder(["仕事","仕事/旧名","仕事/旧名/子"],[note],"仕事/旧名");
 expect(result.folders).toEqual(["仕事"]);expect(result.notes).toHaveLength(1);expect(result.notes[0].id).toBe(note.id);expect(result.notes[0].folder).toBe("仕事");
});
