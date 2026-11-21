import {AppDialog} from "./AppDialog";
import {ActionButton} from "./ActionButton";
import {useState} from "react";
import {AlertTriangle,Trash2,Check} from "lucide-react";
import type {NoteConflict,ConflictChoice} from "./drive/conflicts";
import {formatUpdated,isoUpdated} from "./formatTime";
import {NoteCover} from "./NoteCover";
export function ConflictDialog({conflict,dark,onChoose,onDefer}:{conflict:NoteConflict;dark:boolean;onChoose:(choice:ConflictChoice)=>void;onDefer:()=>void}){
  const [selected,setSelected]=useState(`keep:${conflict.suggested}`);
  return <AppDialog title="同期の競合を確認" onClose={onDefer} width={780}>
    <p>同じノートに異なる変更があります。残す内容を選んでください。最終更新時刻が新しい方を選択しています。</p>
    <div className="conflict-variants">{conflict.variants.map((variant,index)=><label className={"conflict-variant "+(selected===`keep:${variant.id}`?"selected":"")} key={variant.id}><div className="conflict-option-heading"><input type="radio" name="conflict-choice" value={`keep:${variant.id}`} checked={selected===`keep:${variant.id}`} onChange={()=>setSelected(`keep:${variant.id}`)}/><strong>{variant.local?"この端末の変更":`ほかの端末の変更${conflict.variants.filter(v=>!v.local).length>1?` ${index+1}`:""}`}</strong>{variant.id===conflict.suggested&&<span className="newest-badge"><Check size={12}/>新しい更新</span>}</div>
      {variant.note?<><div className="conflict-preview"><NoteCover note={{...variant.note,coverImage:undefined}} dark={dark}/></div><b>{variant.note.title}</b><small>{variant.note.pages.length} ページ · 1ページ目のプレビュー</small></>:<><div className="conflict-preview deleted"><Trash2 size={28}/><b>ノートを削除</b></div><b>削除する変更</b></>}
      <time dateTime={isoUpdated(variant.updated)}>最終更新：{formatUpdated(variant.updated)}</time>
    </label>)}</div>
    <label className="keep-both-option"><input type="radio" name="conflict-choice" checked={selected==="both"} onChange={()=>setSelected("both")}/>両方残す（別のノートとして保存）</label>
    <footer><ActionButton onClick={onDefer}>後で確認</ActionButton><ActionButton className="primary" onClick={()=>onChoose(selected==="both"?{mode:"both"}:{mode:"keep",revisionId:selected.slice(5)})}>選択した内容を残す</ActionButton></footer>
  </AppDialog>;
}
