import type {Note} from "./model";
import type {Payload} from "./drive/sync";
import {noteFingerprint,packFolderNote,packDriveNote,type PdfReference,type DrivePdfReference} from "./syncCodec";
import {FolderPending,type SyncDirectory} from "./folderSync/files";
import {storedNoteVersion} from "./storage";

export class SyncWorkInterrupted extends Error {
  constructor(){super("入力を優先するため同期を延期しました。");this.name="SyncWorkInterrupted";}
}
type Source={note?:Omit<Note,"pdf">;locator?:{id:string;version:string}};
export type SyncJob=
  | ({kind:"fingerprint";pdfDigest?:string}&Source)
  | ({kind:"pack";pdf?:PdfReference}&Source)
  | ({kind:"pack-drive";pdf?:DrivePdfReference}&Source)
  | {kind:"read-folder";directory:SyncDirectory;name:string}
  | {kind:"read-drive";token:string;expires:number;name:string};
type Pending={resolve:(value:unknown)=>void;reject:(error:Error)=>void};
let worker:Worker|undefined,sequence=0;
const pending=new Map<number,Pending>();
export const canUseSyncWorker=()=>typeof window!=="undefined"&&typeof Worker!=="undefined";
export function cancelSyncWork(force=false){
  if(!force&&!pending.size)return;
  worker?.terminate();worker=undefined;
  for(const job of pending.values())job.reject(new SyncWorkInterrupted());
  pending.clear();
}
function task<T>(job:SyncJob):Promise<T>{
  if(!worker){
    worker=new Worker(new URL("./syncWork.worker.ts",import.meta.url),{type:"module"});
    const created=worker;
    worker.onmessage=e=>{
      const {id,result,error}=e.data,value=pending.get(id);if(!value)return;pending.delete(id);
      if(error){const failure=error.name==="SyncWorkInterrupted"?new SyncWorkInterrupted():error.name==="FolderPending"?new FolderPending(error.message):new Error(error.message);failure.name=error.name;value.reject(failure);}
      else value.resolve(result);
    };
    worker.onerror=e=>{e.preventDefault();if(worker!==created)return;created.terminate();worker=undefined;for(const job of pending.values())job.reject(new Error("同期用の処理に失敗しました。次回の同期で再試行します。"));pending.clear();};
  }
  const target=worker,id=++sequence;
  return new Promise<T>((resolve,reject)=>{
    pending.set(id,{resolve:value=>resolve(value as T),reject});
    try{target.postMessage({id,job});}catch(error){pending.delete(id);reject(error);}
  });
}
export function fingerprintInBackground(note:Omit<Note,"pdf">,pdfDigest?:string){
  const {pdf:_,...metadata}=note as Note;
  return canUseSyncWorker()?task<string>({kind:"fingerprint",...source(note),pdfDigest}):noteFingerprint(metadata,pdfDigest);
}
export async function packInBackground(note:Omit<Note,"pdf">,pdf?:PdfReference){
  const {pdf:_,...metadata}=note as Note;
  return canUseSyncWorker()?task<Uint8Array>({kind:"pack",...source(note),pdf}):packFolderNote(metadata,pdf);
}
export async function packDriveInBackground(note:Note,pdf?:DrivePdfReference){
  const {pdf:_,...metadata}=note;
  return canUseSyncWorker()?task<Uint8Array>({kind:"pack-drive",...source(note),pdf}):packDriveNote(metadata,pdf);
}
function source(note:Note):Source{
  const version=storedNoteVersion(note);
  if(version)return {locator:{id:note.id,version}};
  const {pdf:_,...metadata}=note;return {note:metadata};
}
export function readFolderInBackground(directory:SyncDirectory,name:string){return task<Payload>({kind:"read-folder",directory,name});}
export function readDriveInBackground(token:string,expires:number,name:string){return task<Payload>({kind:"read-drive",token,expires,name});}
