import {useState} from "react";
import {DropdownMenu,DropdownMenuItem} from "@astryxdesign/core/DropdownMenu";
import {Button} from "@astryxdesign/core/Button";
import {TextInput} from "@astryxdesign/core/TextInput";
import {Selector} from "@astryxdesign/core/Selector";
import {VStack} from "@astryxdesign/core/VStack";
import {HStack} from "@astryxdesign/core/HStack";
import {MoreVertical,Pencil,Trash2} from "lucide-react";
import {AppDialog} from "./AppDialog";
import {displayPath} from "./Breadcrumb";
import {folderName,parentFolder,isWithin,folderEditPath} from "./folders";
export function FolderMenu({folder,folders,onRename,onDelete}:{folder:string;folders:string[];onRename:(from:string,to:string)=>void;onDelete:(folder:string)=>void}){
 const [action,setAction]=useState<"rename"|"delete"|null>(null),[name,setName]=useState(""),[parent,setParent]=useState(""),[error,setError]=useState("");
 return <><DropdownMenu button={{label:displayPath(folder)+" の操作",icon:<MoreVertical size={18}/>,isIconOnly:true,variant:"ghost",className:"folder-more"}} alignment="end" hasChevron={false} menuWidth={172}>
  <DropdownMenuItem label="名前変更" icon={<Pencil size={16}/>} onClick={()=>{setName(folderName(folder));setParent(parentFolder(folder));setError("");setAction("rename");}}/>
  <DropdownMenuItem label="削除" icon={<Trash2 size={16}/>} variant="destructive" onClick={()=>setAction("delete")}/>
 </DropdownMenu>
 {action==="rename"&&<AppDialog title="フォルダー名を変更" onClose={()=>setAction(null)}><VStack as="form" gap={4} onSubmit={e=>{e.preventDefault();try{const path=folderEditPath(folders,name,parent,folder);onRename(folder,path);setAction(null);}catch(error){setError((error as Error).message);}}}>
  <Selector label="親フォルダー" value={parent} onChange={v=>{if(v!==null)setParent(v);}} options={[{value:"",label:"最上位"},...folders.filter(f=>!isWithin(f,folder)).map(f=>({value:f,label:displayPath(f)}))]}/>
  <TextInput label="フォルダー名" value={name} onChange={setName} hasAutoFocus isRequired status={error?{type:"error",message:error}:undefined}/>
  <HStack gap={2} hAlign="end"><Button label="キャンセル" onClick={()=>setAction(null)}/><Button type="submit" label="保存" variant="primary" isDisabled={!name.trim()}/></HStack>
 </VStack></AppDialog>}
 {action==="delete"&&<AppDialog title={`「${folderName(folder)}」を削除しますか？`} onClose={()=>setAction(null)}><p>このフォルダーと配下のフォルダーを削除します。ノートは削除せず、一つ上のフォルダー（最上位なら未分類）へ移します。</p><HStack gap={2} hAlign="end"><Button label="キャンセル" onClick={()=>setAction(null)}/><Button label="削除する" variant="destructive" onClick={()=>{setAction(null);onDelete(folder);}}/></HStack></AppDialog>}
 </>;
}
