import {useEffect,useRef,useState} from "react";
import type {Page} from "./model";
import {pagePaperColor} from "./paper";
import {imageStroke} from "./images";
type Props={page:Page;number:number;dark:boolean;onChange:(patch:Partial<Page>)=>void;onApply:()=>void;onClose:()=>void};
export function PageTemplateDialog({page,number,dark,onChange,onApply,onClose}:Props){
 const panel=useRef<HTMLElement>(null),alive=useRef(true),request=useRef(0);
 const [error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{alive.current=true;panel.current?.querySelector<HTMLElement>("button,select,input")?.focus();return()=>{alive.current=false;};},[]);
 return <div className="modal-backdrop page-template-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}} onKeyDown={e=>{
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();}
  if(e.key==="Tab"){
   const fields=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[]);
   const first=fields[0],last=fields.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
 }}>
 <section ref={panel} className="modal page-template-dialog" role="dialog" aria-modal="true" aria-labelledby="page-template-title">
 <header><h2 id="page-template-title">ページ {number} のテンプレート</h2><button aria-label="テンプレート設定を閉じる" onClick={onClose}>×</button></header>
 <p>変更はこのページに自動保存されます。</p>
 <label>用紙<select aria-label="ページの用紙パターン" value={page.paper} onChange={e=>onChange({paper:e.target.value as Page["paper"]})}><option value="blank">白紙</option><option value="ruled">罫線</option><option value="grid">方眼</option></select></label>
 <label>用紙色<input type="color" aria-label="ページの用紙色" value={pagePaperColor(page,dark)} onChange={e=>onChange({paperColor:e.target.value})}/></label>
 <label>背景画像<input disabled={loading} type="file" aria-label="ページの背景画像" accept="image/*" onChange={e=>{
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  const epoch=++request.current;setError("");setLoading(true);
  void imageStroke(file,page).then(s=>{if(alive.current&&request.current===epoch)onChange({backgroundImage:s.image});}).catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setLoading(false);});
 }}/></label>
 {page.backgroundImage&&<button disabled={loading} onClick={()=>onChange({backgroundImage:undefined})}>背景画像を解除</button>}
 {loading&&<p role="status">画像を読み込み中…</p>}{error&&<p role="alert">{error}</p>}
 <p>「全ページに適用」で、同じノートの用紙を揃えます。PDFの背景は保持します。</p>
 <div className="modal-actions"><button disabled={loading} onClick={onApply}>全ページに適用</button><button className="primary" onClick={onClose}>閉じる</button></div>
 </section></div>;
}
