import {useState} from "react";
import {Folder,FolderPlus} from "lucide-react";
import {Button} from "@astryxdesign/core/Button";
import {TextInput} from "@astryxdesign/core/TextInput";
import {Selector} from "@astryxdesign/core/Selector";
import {VStack} from "@astryxdesign/core/VStack";
import {HStack} from "@astryxdesign/core/HStack";
import {folderName,isWithin,folderEditPath} from "./folders";
import {displayPath} from "./Breadcrumb";
import {FolderMenu} from "./FolderMenu";
import {AppDialog} from "./AppDialog";
import type {Note} from "./model";
type Props={folders:string[];notes:Note[];selected:string;onSelect:(folder:string)=>void;onCreate:(name:string)=>void;onRename:(from:string,to:string)=>void;onDelete:(name:string)=>void};
export function FolderNav({folders,notes,selected,onSelect,onCreate,onRename,onDelete}:Props){
 const [edit,setEdit]=useState<{name:string;parent:string}|null>(null),[error,setError]=useState("");
 return <VStack className="folder-nav" gap={2}>
 <HStack className="folder-heading" hAlign="between"><span>フォルダー</span><Button label="フォルダーを作成" icon={<FolderPlus size={20}/>} isIconOnly variant="ghost" onClick={()=>{setEdit({name:"",parent:selected==="*"?"":selected});setError("");}}/></HStack>
 <VStack className="folder-list" gap={1}>{[{id:"*",name:"すべてのノート"},{id:"",name:"未分類"},...folders.map(id=>({id,name:folderName(id)}))].map(f=><HStack key={f.id} className={"folder-row "+(selected===f.id?"selected":"")} gap={0} data-library-target={f.id}>
 <button draggable={!!f.id&&f.id!=="*"} data-library-kind={f.id&&f.id!=="*"?"folder":undefined} data-library-id={f.id} data-library-label={f.name} data-library-target={f.id} title={f.id==="*"?f.name:displayPath(f.id)||"未分類"} style={{paddingLeft:12+Math.min(5,f.id.split("/").length-1)*12}} className="folder-button" aria-current={selected===f.id?"location":undefined} onClick={()=>onSelect(f.id)}>
 <Folder size={19}/><span>{f.name}</span><small>{notes.filter(n=>f.id==="*"||(f.id===""?!n.folder:!!n.folder&&isWithin(n.folder,f.id))).length}</small>
 </button>{f.id&&f.id!=="*"&&<FolderMenu folder={f.id} folders={folders} onRename={onRename} onDelete={onDelete}/>}
 </HStack>)}</VStack>
 {edit&&<AppDialog title="フォルダーを作成" onClose={()=>setEdit(null)}><VStack as="form" gap={4} onSubmit={e=>{e.preventDefault();try{onCreate(folderEditPath(folders,edit.name,edit.parent));setEdit(null);setError("");}catch(error){setError((error as Error).message);}}}>
 <Selector label="親フォルダー" value={edit.parent} onChange={v=>{if(v!==null)setEdit({...edit,parent:v});}} options={[{value:"",label:"最上位"},...folders.map(f=>({value:f,label:displayPath(f)}))]}/>
 <TextInput label="フォルダー名" value={edit.name} onChange={name=>setEdit({...edit,name})} hasAutoFocus isRequired status={error?{type:"error",message:error}:undefined}/>
 <HStack gap={2} hAlign="end"><Button label="キャンセル" onClick={()=>setEdit(null)}/><Button label="作成" type="submit" variant="primary" isDisabled={!edit.name.trim()}/></HStack>
 </VStack></AppDialog>}
 </VStack>;
}
