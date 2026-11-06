import {useRef,useState} from "react";
import {Share2,FileDown,FileText} from "lucide-react";
import {useDismiss} from "./useDismiss";
export function ShareMenu({disabled,onPdf,onExport}:{disabled:boolean;onPdf:()=>void;onExport:()=>void}){
  const [open,setOpen]=useState(false),anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  useDismiss(open,[anchor,panel],()=>setOpen(false),true);
  return <div className="share-menu"><button ref={anchor} className="export-button" aria-label="共有" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)}><Share2 size={16}/><span>共有</span></button>
    {open&&<div ref={panel} className="share-dropdown" role="menu" aria-label="共有方法"><button role="menuitem" onClick={()=>{setOpen(false);onPdf();}}><FileText size={17}/><span>PDF書き出し<small>手書きを固定して共有</small></span></button><button role="menuitem" onClick={()=>{setOpen(false);onExport();}}><FileDown size={17}/><span>ノートをエクスポート<small>編集を続けられる .mppnote</small></span></button></div>}
  </div>;
}
