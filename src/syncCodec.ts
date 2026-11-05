import {zipSync, strToU8} from "fflate";
import type {Note} from "./model";

export async function hash(value:string|Uint8Array) {
  const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
  const digest=await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v)]));
  return value;
}
export function noteFingerprint(note:Omit<Note,"pdf">,pdfDigest?:string) {
  return hash(JSON.stringify(canonical({...note,pdf:pdfDigest})));
}
export type PdfReference={name:string;digest:string};
export type DrivePdfReference={fileId:string;digest:string};
export function packFolderNote(note:Omit<Note,"pdf">,pdf?:PdfReference) {
  return packNote(note,pdf,"folder-pdf.json");
}
export function packDriveNote(note:Omit<Note,"pdf">,pdf?:DrivePdfReference){return packNote(note,pdf,"remote-pdf.json");}
function packNote(note:Omit<Note,"pdf">,pdf:PdfReference|DrivePdfReference|undefined,pdfKey:string){
  const files:Record<string,Uint8Array>={
    "manifest.json":strToU8(JSON.stringify({format:"mpp-notes",version:1,folders:[],notes:[{...note,pdfFile:pdf?`pdf/${note.id}.pdf`:undefined}]})),
  };
  if(pdf)files[pdfKey]=strToU8(JSON.stringify(pdf));
  // Construct the archive once; the previous path compressed, expanded, then
  // compressed the same note again before each folder write.
  return zipSync(files,{mtime:new Date(1980,0,1)});
}
