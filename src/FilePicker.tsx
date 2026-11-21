import {useState} from "react";
import {FileInput} from "@astryxdesign/core/FileInput";
import {Button} from "@astryxdesign/core/Button";
import {AppDialog} from "./AppDialog";
export function FilePicker({label,accept,onSelect,disabled=false}:{label:string;accept:string;onSelect:(file:File)=>void;disabled?:boolean}){
 return <FileInput label={label} accept={accept} placeholder="ファイルを選択" description="ファイルを選択するか、ここへドロップしてください。" mode="dropzone" value={null} isDisabled={disabled} onChange={files=>{const file=Array.isArray(files)?files[0]:files;if(file)onSelect(file);}}/>;
}
export function FilePickerDialog({label,accept,onSelect,onClose}:{label:string;accept:string;onSelect:(file:File)=>void;onClose:()=>void}){
 return <AppDialog title={label} onClose={onClose}><FilePicker label={label} accept={accept} onSelect={file=>{onClose();onSelect(file);}}/></AppDialog>;
}
export function FilePickerButton({label,accept,onSelect}:{label:string;accept:string;onSelect:(file:File)=>void}){
 const [open,setOpen]=useState(false);
 return <><Button label={label} onClick={()=>setOpen(true)}/>{open&&<FilePickerDialog label={label} accept={accept} onSelect={onSelect} onClose={()=>setOpen(false)}/>}</>;
}
