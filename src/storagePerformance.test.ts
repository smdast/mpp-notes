import "fake-indexeddb/auto";
import {it,expect,vi} from "vitest";
import {newNote,newPage,type Note} from "./model";
import {saveNote,loadNotes,openDB,storedNoteVersion,readSyncMetadata,saveMany,deleteNote} from "./storage";
const ink=(id:string)=>({id,tool:"pen" as const,color:"#123456",width:2,points:Array.from({length:100},(_,i)=>({x:i,y:20,p:.5}))});
const changed=(note:Note,index:number)=>({...note,updated:note.updated+1,pages:note.pages.map((p,i)=>i===index?{...p,strokes:[...p.strokes,ink("added")]}:p)});
it("writes one edited page in a 200-page note, keeps order and sync snapshots intact",async()=>{
 const note={...newNote("大きなノート"),pages:Array.from({length:200},(_,i)=>({...newPage(),strokes:[ink(String(i))]}))};
 await saveNote(note);const next=changed(note,120),spy=vi.spyOn(IDBObjectStore.prototype,"put");
 try{
  await saveNote(next,note);
  const records=spy.mock.calls.map(([record])=>record);
  expect(records.filter(r=>r.noteId===note.id)).toHaveLength(1);
  expect(records.find(r=>r.id===note.id)).not.toHaveProperty("pages");
 }finally{spy.mockRestore();}
 const loaded=(await loadNotes()).find(n=>n.id===note.id)!;expect(loaded).toEqual(next);
 expect(await readSyncMetadata(note.id,storedNoteVersion(next)!)).toEqual(next);
 const reordered={...next,pages:[next.pages[120],...next.pages.slice(0,120),...next.pages.slice(121)]};
 await saveNote(reordered,next);expect((await loadNotes()).find(n=>n.id===note.id)).toEqual(reordered);
 const removed={...reordered,pages:reordered.pages.slice(1)};await saveNote(removed,reordered);
 const db=await openDB(),tx=db.transaction("pages","readonly"),r=tx.objectStore("pages").get([note.id,next.pages[120].id]);
 await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);});expect(r.result).toBeUndefined();
});
it("falls back to full pages when the committed base differs and preserves ordinary in-place saves",async()=>{
 const note={...newNote(),pages:[newPage(),newPage()]};await saveNote(note);const newer=changed(note,1);await saveNote(newer,note);
 const stale=changed(note,0);await saveNote(stale,note);expect((await loadNotes()).find(n=>n.id===note.id)).toEqual(stale);
 stale.pages[1].strokes.push(ink("in-place"));await saveNote(stale);expect((await loadNotes()).find(n=>n.id===note.id)).toEqual(stale);
});
it("rolls back page writes and storage versions together on an import failure",async()=>{
 const note=newNote(),version=storedNoteVersion(note);await expect(saveMany([note,note])).rejects.toBeTruthy();
 expect(storedNoteVersion(note)).toBe(version);expect((await loadNotes()).some(n=>n.id===note.id)).toBe(false);
 const db=await openDB(),tx=db.transaction("pages","readonly"),r=tx.objectStore("pages").index("noteId").getAllKeys(note.id);
 await new Promise<void>(resolve=>{tx.oncomplete=()=>{db.close();resolve();};});expect(r.result).toEqual([]);
});
it("removes the page records when a note is deleted",async()=>{
 const note=newNote();await saveNote(note);await deleteNote(note.id);
 const db=await openDB(),tx=db.transaction("pages","readonly"),r=tx.objectStore("pages").index("noteId").getAllKeys(note.id);
 await new Promise<void>(resolve=>{tx.oncomplete=()=>{db.close();resolve();};});expect(r.result).toEqual([]);
});
