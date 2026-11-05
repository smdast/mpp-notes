import {noteFingerprint,packFolderNote,packDriveNote} from "./syncCodec";
import {FolderRepository} from "./folderSync/repository";
import {DriveSession} from "./drive/client";
import type {SyncJob} from "./syncWork";
import {readSyncMetadata} from "./storage";

const scope=self as unknown as {
  onmessage:((event:MessageEvent<{id:number;job:SyncJob}>)=>void)|null;
  postMessage:(value:unknown,transfer?:Transferable[])=>void;
};
let drive:{token:string;expires:number;session:DriveSession}|undefined;
scope.onmessage=async ({data:{id,job}})=>{
  try {
    let result;
    if(job.kind==="read-folder")result=await FolderRepository.readFrom(job.directory,job.name);
    else if(job.kind==="read-drive"){
      if(!drive||drive.token!==job.token||drive.expires!==job.expires)drive={token:job.token,expires:job.expires,session:new DriveSession(job.token,job.expires)};
      result=await drive.session.read(job.name);
    }
    else {
      const note=job.locator?await readSyncMetadata(job.locator.id,job.locator.version):job.note;
      if(!note)throw new Error("同期するノートが見つかりません。");
      result=job.kind==="fingerprint"?await noteFingerprint(note,job.pdfDigest):job.kind==="pack-drive"?packDriveNote(note,job.pdf):packFolderNote(note,job.pdf);
    }
    scope.postMessage({id,result},result instanceof Uint8Array?[result.buffer as ArrayBuffer]:[]);
  }catch(error){scope.postMessage({id,error:{name:error instanceof Error?error.name:"Error",message:error instanceof Error?error.message:"同期データを処理できません。"}});}
};
