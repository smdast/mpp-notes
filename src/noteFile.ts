import {zipSync,unzipSync,strToU8,strFromU8} from "fflate";
import {readBackupBundle} from "./backup";
import {uid,type Note} from "./model";
import packageInfo from "../package.json";
export const NOTE_EXTENSION=".mppnote";
export const NOTE_MIME="application/x-mpp-note";
const MAX=250*1024*1024;
export const noteFilename=(title:string,extension=NOTE_EXTENSION)=>(title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").trim()||"無題のノート")+extension;
export function makeNoteFile(note:Note){
  const {pdf,...metadata}=note;
  const files:Record<string,Uint8Array>={
    "note-file.json":strToU8(JSON.stringify({format:"mpp-note",version:1,appVersion:packageInfo.version})),
    "manifest.json":strToU8(JSON.stringify({format:"mpp-notes",version:1,folders:[],notes:[{...metadata,pdfFile:pdf?`pdf/${note.id}.pdf`:undefined}]})),
  };
  if(pdf)files[`pdf/${note.id}.pdf`]=pdf;
  const total=Object.values(files).reduce((sum,bytes)=>sum+bytes.length,0);
  if(total>MAX)throw new Error("ノートファイルのサイズ上限（250 MB）を超えています。");
  return zipSync(files);
}
export function readNoteFile(bytes:Uint8Array):Note{
  try{
    if(bytes.length>MAX)throw new Error();let total=0;
    const files=unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;if(total>MAX)throw new Error();return entry.name==="note-file.json";}});
    const header=JSON.parse(strFromU8(files["note-file.json"]));
    if(header?.format!=="mpp-note"||header.version!==1)throw new Error();
    const {notes}=readBackupBundle(bytes,true);
    if(notes.length!==1)throw new Error();
    const note=notes[0];
    return {...note,id:uid(),pages:note.pages.map(page=>({...page,id:uid(),strokes:page.strokes.map(stroke=>({...stroke,id:uid()}))}))};
  }catch{throw new Error("ノートファイル（.mppnote）が無効、未対応の形式、またはサイズ上限（250 MB）を超えています。ZIPバックアップは設定の「バックアップと復元」から取り込んでください。");}
}
