import "fake-indexeddb/auto";
import {it,expect,vi,afterEach} from "vitest";
import {newNote} from "./model";
import {saveNote,loadNotes,openDB,storedNoteVersion,readSyncMetadata} from "./storage";
import {fingerprint} from "./drive/sync";
import {packFolderNote,noteFingerprint} from "./syncCodec";
import {packInBackground,cancelSyncWork,SyncWorkInterrupted,readFolderInBackground} from "./syncWork";
import {readBackupBundle} from "./backup";
import {FolderPending,type SyncDirectory} from "./folderSync/files";

class TestWorker {
  static instances:TestWorker[]=[];
  onmessage?: (event:{data:unknown})=>void;
  onerror?: (event:{preventDefault:()=>void})=>void;
  jobs:{id:number;job:Record<string,unknown>}[]=[];
  terminated=false;
  constructor(){TestWorker.instances.push(this);}
  postMessage(job:{id:number;job:Record<string,unknown>}){this.jobs.push(job);}
  terminate(){this.terminated=true;}
  reply(result:unknown){this.onmessage?.({data:{id:this.jobs.at(-1)!.id,result}});}
}
function browser(){vi.stubGlobal("window",{});vi.stubGlobal("Worker",TestWorker);TestWorker.instances=[];}
afterEach(()=>{cancelSyncWork(true);vi.unstubAllGlobals();});
it("reads exact committed metadata inside the worker and keeps local version stamps out of backups",async()=>{
  const note=newNote("保存済み"),original=structuredClone(note);await saveNote(note);
  const version=storedNoteVersion(note)!;expect(version).toBeTruthy();expect(note).toEqual(original);
  expect(await readSyncMetadata(note.id,version)).toEqual(note);
  const loaded=(await loadNotes()).find(n=>n.id===note.id)!;expect(storedNoteVersion(loaded)).toBe(version);expect(loaded).toEqual(note);
  const next={...note,title:"次の編集"};await saveNote(next);
  await expect(readSyncMetadata(note.id,version)).rejects.toMatchObject({name:"SyncWorkInterrupted"});
  const archive=packFolderNote(next);const restored=readBackupBundle(archive,true).notes[0];expect(restored).toEqual(next);expect(JSON.stringify(restored)).not.toContain("__mppStorageVersion");
});
it("posts only a saved-note locator instead of cloning all stroke points or the PDF on the UI thread",async()=>{
  const note=newNote();note.pdf=new Uint8Array([1,2,3]);await saveNote(note);browser();
  const packed=packInBackground(note,{name:"pdf-test.pdf",digest:"test"});
  const worker=TestWorker.instances[0],job=worker.jobs[0].job;
  expect(job).toMatchObject({kind:"pack",locator:{id:note.id,version:storedNoteVersion(note)}});expect(job).not.toHaveProperty("note");
  worker.reply(new Uint8Array([4,5]));await expect(packed).resolves.toEqual(new Uint8Array([4,5]));
});
it("cancels outstanding worker jobs on input and retries the same note without a poisoned fingerprint cache",async()=>{
  browser();const note=newNote();const first=fingerprint({kind:"note",note});
  cancelSyncWork();await expect(first).rejects.toBeInstanceOf(SyncWorkInterrupted);expect(TestWorker.instances[0].terminated).toBe(true);
  const again=fingerprint({kind:"note",note});expect(TestWorker.instances).toHaveLength(2);
  const expected=await noteFingerprint(note);TestWorker.instances[1].reply(expected);await expect(again).resolves.toBe(expected);
});
it("preserves incomplete-folder errors across worker messages so partial cloud files remain retryable",async()=>{
  browser();const reading=readFolderInBackground({} as SyncDirectory,"note-fixture.zip");
  const worker=TestWorker.instances[0];worker.onmessage?.({data:{id:worker.jobs[0].id,error:{name:"FolderPending",message:"同期完了待ち"}}});
  await expect(reading).rejects.toBeInstanceOf(FolderPending);
});
it("keeps older unstamped notes readable and uses the compatible worker input on their first sync",async()=>{
  const note=newNote("以前のノート"),db=await openDB(),tx=db.transaction("notes","readwrite");tx.objectStore("notes").put(note);
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);});
  const loaded=(await loadNotes()).find(n=>n.id===note.id)!;expect(loaded).toEqual(note);expect(storedNoteVersion(loaded)).toBeUndefined();
  browser();const packed=packInBackground(loaded),worker=TestWorker.instances[0];
  expect(worker.jobs[0].job.note).toEqual(note);expect(worker.jobs[0].job).not.toHaveProperty("locator");
  worker.reply(packFolderNote(note));expect(readBackupBundle(await packed,true).notes[0]).toEqual(note);
});
it("ignores a late error from a cancelled worker after a fresh retry has started",async()=>{
  browser();const first=packInBackground(newNote()),old=TestWorker.instances[0];cancelSyncWork();await expect(first).rejects.toBeInstanceOf(SyncWorkInterrupted);
  const again=packInBackground(newNote()),current=TestWorker.instances[1];old.onerror?.({preventDefault:()=>{}});
  expect(current.terminated).toBe(false);current.reply(new Uint8Array([7]));await expect(again).resolves.toEqual(new Uint8Array([7]));
});
