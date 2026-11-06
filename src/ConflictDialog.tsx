import {useEffect,useRef,useState} from "react";
import {AlertTriangle,Trash2,Check} from "lucide-react";
import type {NoteConflict,ConflictChoice} from "./drive/conflicts";
import {formatUpdated,isoUpdated} from "./formatTime";
import {NoteCover} from "./NoteCover";
export function ConflictDialog({conflict,dark,onChoose,onDefer}:{conflict:NoteConflict;dark:boolean;onChoose:(choice:ConflictChoice)=>void;onDefer:()=>void}){
  const [selected,setSelected]=useState(`keep:${conflict.suggested}`),panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;panel.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onDefer();}
      if(event.key!=="Tab")return;
      const items=[...panel.current?.querySelectorAll<HTMLElement>('button,input:not(:disabled),a[href]')||[]].filter(e=>e.offsetParent!==null),first=items[0],last=items.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",key,true);return()=>{document.removeEventListener("keydown",key,true);previous?.focus();};
  },[]);
  return <div className="modal-backdrop sync-conflict-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onDefer();}}><div className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title" ref={panel} tabIndex={-1}>
    <header><AlertTriangle size={22}/><h2 id="conflict-title">同期の競合を確認</h2></header><p>同じノートに異なる変更があります。残す内容を選んでください。最終更新時刻が新しい方を選択しています。</p>
    <div className="conflict-variants">{conflict.variants.map((variant,index)=><label className={"conflict-variant "+(selected===`keep:${variant.id}`?"selected":"")} key={variant.id}><div className="conflict-option-heading"><input type="radio" name="conflict-choice" value={`keep:${variant.id}`} checked={selected===`keep:${variant.id}`} onChange={()=>setSelected(`keep:${variant.id}`)}/><strong>{variant.local?"この端末の変更":`ほかの端末の変更${conflict.variants.filter(v=>!v.local).length>1?` ${index+1}`:""}`}</strong>{variant.id===conflict.suggested&&<span className="newest-badge"><Check size={12}/>新しい更新</span>}</div>
      {variant.note?<><div className="conflict-preview"><NoteCover note={{...variant.note,coverImage:undefined}} dark={dark}/></div><b>{variant.note.title}</b><small>{variant.note.pages.length} ページ · 1ページ目のプレビュー</small></>:<><div className="conflict-preview deleted"><Trash2 size={28}/><b>ノートを削除</b></div><b>削除する変更</b></>}
      <time dateTime={isoUpdated(variant.updated)}>最終更新：{formatUpdated(variant.updated)}</time>
    </label>)}</div>
    <label className="keep-both-option"><input type="radio" name="conflict-choice" checked={selected==="both"} onChange={()=>setSelected("both")}/>両方残す（別のノートとして保存）</label>
    <footer><button onClick={onDefer}>後で確認</button><button className="primary" onClick={()=>onChoose(selected==="both"?{mode:"both"}:{mode:"keep",revisionId:selected.slice(5)})}>選択した内容を残す</button></footer>
  </div></div>;
}
