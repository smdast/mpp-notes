import "fake-indexeddb/auto";
import {it,expect} from "vitest";
import {newNote,newPage} from "./model";
import {loadNotes,saveNote,openDB,readSyncMetadata,storedNoteVersion} from "./storage";
it("opens version 2 embedded pages and converts them atomically on the first edit",async()=>{
 const old={...newNote("旧形式"),pages:[newPage(),newPage()],pdf:new Uint8Array([1,2,3])};
 await new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open("mpp-notes-v1",2);
  r.onupgradeneeded=()=>{r.result.createObjectStore("notes",{keyPath:"id"});r.result.createObjectStore("pdfs");r.result.createObjectStore("settings");};
  r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(["notes","pdfs"],"readwrite");const {pdf,...meta}=old;tx.objectStore("notes").put({...meta,__mppStorageVersion:"legacy-version"});tx.objectStore("pdfs").put(pdf,old.id);tx.oncomplete=()=>{db.close();resolve();};};
 });
 const loaded=(await loadNotes())[0];expect(loaded).toEqual(old);expect(storedNoteVersion(loaded)).toBe("legacy-version");
 const changed={...loaded,pages:loaded.pages.map((p,i)=>i===1?{...p,paper:"ruled" as const}:p)};
 await saveNote(changed,loaded);expect((await loadNotes())[0]).toEqual(changed);
 const {pdf:_,...metadata}=changed;expect(await readSyncMetadata(changed.id,storedNoteVersion(changed)!)).toEqual(metadata);
 const db=await openDB(),tx=db.transaction("notes","readonly"),request=tx.objectStore("notes").get(old.id);
 await new Promise<void>(resolve=>{tx.oncomplete=()=>{db.close();resolve();};});expect(request.result.pages).toBeUndefined();expect(request.result.__mppPageIds).toEqual(changed.pages.map(p=>p.id));
});
it("reports a missing page instead of returning a partial note that could overwrite data",async()=>{
 const note=newNote();await saveNote(note);const db=await openDB(),tx=db.transaction("pages","readwrite");tx.objectStore("pages").delete([note.id,note.pages[0].id]);
 await new Promise<void>(resolve=>{tx.oncomplete=()=>{db.close();resolve();};});await expect(loadNotes()).rejects.toThrow("保存済みのページ");
});
