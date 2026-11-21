import {useState} from "react";
import {Button} from "@astryxdesign/core/Button";
import {TextInput} from "@astryxdesign/core/TextInput";
import {Slider} from "@astryxdesign/core/Slider";
import {VStack} from "@astryxdesign/core/VStack";
import {HStack} from "@astryxdesign/core/HStack";
import {AppDialog} from "./AppDialog";
export function ColorDialog({value,onChange,onClose}:{value:string;onChange:(color:string)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(value);const valid=/^#[0-9a-f]{6}$/i.test(draft);
 const channels=[1,3,5].map(i=>parseInt((valid?draft:value).slice(i,i+2),16)||0);
 function channel(index:number,n:number){const next=[...channels];next[index]=n;setDraft("#"+next.map(v=>v.toString(16).padStart(2,"0")).join(""));}
 return <AppDialog title="カスタム色" onClose={onClose} width={380}>
  <svg width="100%" height="56" role="img" aria-label="選択する色のプレビュー"><rect width="100%" height="56" rx="8" fill={valid?draft:value} stroke="var(--color-border-emphasized)"/></svg>
  <TextInput label="カラーコード" value={draft} onChange={setDraft} placeholder="#247967" status={!valid?{type:"error",message:"#と6桁の16進数で入力してください"}:undefined} hasAutoFocus/>
  <VStack gap={3}>{["赤 (R)","緑 (G)","青 (B)"].map((label,i)=><Slider key={label} containerClassName="notes-slider" label={label} min={0} max={255} step={1} value={channels[i]} onChange={(n:number)=>channel(i,n)} valueDisplay="text"/>)}</VStack>
  <HStack gap={2} hAlign="end"><Button label="キャンセル" onClick={onClose}/><Button label="適用" variant="primary" isDisabled={!valid} onClick={()=>{onChange(draft.toLowerCase());onClose();}}/></HStack>
 </AppDialog>;
}
export function CustomColor({value,onChange,label="カスタム"}:{value:string;onChange:(color:string)=>void;label?:string}){
 const [open,setOpen]=useState(false);
 return <><Button label={label} icon={<svg width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="4" fill={value} stroke="var(--color-border-emphasized)"/></svg>} onClick={()=>setOpen(true)}/>{open&&<ColorDialog value={value} onChange={onChange} onClose={()=>setOpen(false)}/>}</>;
}
