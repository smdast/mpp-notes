import {useEffect,useRef,useState,type PointerEvent as PE} from "react";
import {createPortal} from "react-dom";
import {MoreVertical,GripVertical,Plus,Copy,Trash2,FilePenLine,ArrowUp,ArrowDown} from "lucide-react";
import type {Page} from "./model";
import {pagePaperColor} from "./paper";
import {imageStroke} from "./images";
type Props={pages:Page[];active:string;dark:boolean;onSelect:(id:string)=>void;onAdd:()=>void;onInsert:(id:string,after:boolean)=>void;onDuplicate:(id:string)=>void;onDelete:(id:string)=>void;onReorder:(from:string,to:string,after:boolean)=>void;onTemplate:(id:string,patch:Partial<Page>)=>void;onApply:(id:string)=>void;onError:(s:string)=>void};
export function PageSidebar(props:Props){
 const list=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null);
 const [menu,setMenu]=useState<{id:string;x:number;y:number;template:boolean}|null>(null);
 const [drag,setDrag]=useState<string|null>(null),[drop,setDrop]=useState<{id:string;after:boolean}|null>(null);
 const gesture=useRef<{id:string;pointer:number;x:number;y:number;startX:number;startY:number;started:boolean}|null>(null),frame=useRef(0),suppress=useRef(false);
 const callbacks=useRef(props);callbacks.current=props;
 const dropRef=useRef(drop);dropRef.current=drop;
 const menuRef=useRef(menu);menuRef.current=menu;
 const anchor=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{if(menu)popup.current?.querySelector<HTMLButtonElement>("button")?.focus();},[menu?.id,menu?.template]);
 const selected=props.pages.find(p=>p.id===menu?.id);
 useEffect(()=>{const close=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest(".page-context-menu,.page-more"))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&menuRef.current){setMenu(null);anchor.current?.focus();}};document.addEventListener("pointerdown",close);window.addEventListener("keydown",key);const reset=()=>setMenu(null);window.addEventListener("resize",reset);window.addEventListener("popstate",reset);return()=>{document.removeEventListener("pointerdown",close);window.removeEventListener("keydown",key);window.removeEventListener("resize",reset);window.removeEventListener("popstate",reset);cancelAnimationFrame(frame.current);};},[]);
 function locate(){
  const g=gesture.current;if(!g?.started)return;
  const rect=list.current?.getBoundingClientRect();
  if(rect&&list.current){if(g.y<rect.top+32)list.current.scrollTop-=10;else if(g.y>rect.bottom-32)list.current.scrollTop+=10;}
  const item=document.elementFromPoint(g.x,g.y)?.closest<HTMLElement>("[data-side-page]");
  if(item){const r=item.getBoundingClientRect(),value={id:item.dataset.sidePage!,after:g.y>r.top+r.height/2};dropRef.current=value;setDrop(old=>old?.id===value.id&&old.after===value.after?old:value);}
  frame.current=requestAnimationFrame(locate);
 }
 function down(e:PE,id:string,handle=false){
  if(e.button!==0||(e.pointerType==="touch"&&!handle))return;
  gesture.current={id,pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,started:false};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:PE){const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;g.x=e.clientX;g.y=e.clientY;
  if(!g.started&&Math.hypot(g.x-g.startX,g.y-g.startY)>7){g.started=true;suppress.current=true;setMenu(null);setDrag(g.id);frame.current=requestAnimationFrame(locate);}
  if(g.started)e.preventDefault();
 }
 function end(e:PE,cancel=false){const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;cancelAnimationFrame(frame.current);
  const item=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>("[data-side-page]");
  const target=item?{id:item.dataset.sidePage!,after:e.clientY>item.getBoundingClientRect().top+item.getBoundingClientRect().height/2}:null;if(g.started&&!cancel&&target)callbacks.current.onReorder(g.id,target.id,target.after);
  setDrag(null);setDrop(null);dropRef.current=null;setTimeout(()=>{suppress.current=false;},0);
 }
 function open(e:React.MouseEvent<HTMLButtonElement>,id:string){anchor.current=e.currentTarget;const r=e.currentTarget.getBoundingClientRect();props.onSelect(id);setMenu({id,x:Math.min(innerWidth-290,Math.max(8,r.right+8)),y:Math.max(8,Math.min(innerHeight-380,r.top)),template:false});}
 return <aside className="page-strip" aria-label="ページ一覧"><span className="page-strip-heading">ページ <small>{props.pages.length}</small></span><div ref={list} className="page-list" onScroll={()=>setMenu(null)}>
 {props.pages.map((p,i)=><div key={p.id} data-side-page={p.id} className={"page-item "+(drag===p.id?"dragging ":"")+(drop?.id===p.id?(drop.after?"drop-after":"drop-before"):"")}>
 <button className={"page-thumb "+(props.active===p.id?"current":"")} aria-label={`ページ ${i+1}`} aria-current={props.active===p.id?"page":undefined} onClick={()=>{if(!suppress.current)props.onSelect(p.id);}} onPointerDown={e=>down(e,p.id)} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>end(e,true)}>
 <span style={{backgroundColor:pagePaperColor(p,props.dark)}} className={"mini-paper "+(p.pdfIndex!==undefined?"pdf-paper":p.paper)}><span>{p.pdfIndex!==undefined?`PDF ${p.pdfIndex+1}`:String(i+1).padStart(2,"0")}</span><span className="mini-ink">{p.strokes.length?"〰":""}</span></span><small>{i+1}</small></button>
 <button className="page-more" aria-label={`ページ ${i+1} のメニュー`} aria-expanded={menu?.id===p.id} onClick={e=>open(e,p.id)}><MoreVertical size={16}/></button>
 <button className="page-drag-handle" aria-label={`ページ ${i+1} を並び替え`} title="ドラッグで並び替え・上下キーで移動" onPointerDown={e=>down(e,p.id,true)} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>end(e,true)} onKeyDown={e=>{const target=props.pages[i+(e.key==="ArrowUp"?-1:e.key==="ArrowDown"?1:0)];if(target&&target!==p){e.preventDefault();props.onReorder(p.id,target.id,e.key==="ArrowDown");}}}><GripVertical size={12}/></button>
 </div>)}
 </div><button className="add-page" title="ページ追加" onClick={props.onAdd}><Plus size={18}/></button>
 {menu&&selected&&createPortal(<div ref={popup} className="page-context-menu" role="dialog" aria-label="ページの操作" style={{left:Math.max(8,menu.x),top:menu.y}}>
 <header><b>ページ {props.pages.indexOf(selected)+1}</b><button aria-label="ページメニューを閉じる" onClick={()=>setMenu(null)}>×</button></header>
 {!menu.template?<><button onClick={()=>{props.onInsert(selected.id,false);setMenu(null);}}><ArrowUp size={15}/>前にページを挿入</button><button onClick={()=>{props.onInsert(selected.id,true);setMenu(null);}}><ArrowDown size={15}/>後にページを挿入</button><button onClick={()=>{props.onDuplicate(selected.id);setMenu(null);}}><Copy size={15}/>ページを複製</button><button disabled={selected.pdfIndex!==undefined} title={selected.pdfIndex!==undefined?"元PDFの背景は保持します":undefined} onClick={()=>setMenu({...menu,template:true})}><FilePenLine size={15}/>テンプレートを変更</button><button disabled={props.pages.length===1} onClick={()=>{props.onDelete(selected.id);setMenu(null);}}><Trash2 size={15}/>ページを削除</button></>:<>
 <label>用紙<select aria-label="ページの用紙パターン" value={selected.paper} onChange={e=>props.onTemplate(selected.id,{paper:e.target.value as Page["paper"]})}><option value="blank">白紙</option><option value="ruled">罫線</option><option value="grid">方眼</option></select></label>
 <label>用紙色<input type="color" aria-label="ページの用紙色" value={pagePaperColor(selected,props.dark)} onChange={e=>props.onTemplate(selected.id,{paperColor:e.target.value})}/></label>
 <label>背景画像<input type="file" aria-label="ページの背景画像" accept="image/*" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void imageStroke(f,selected).then(s=>callbacks.current.onTemplate(selected.id,{backgroundImage:s.image})).catch(e=>callbacks.current.onError(e.message));}}/></label>
 {selected.backgroundImage&&<button onClick={()=>props.onTemplate(selected.id,{backgroundImage:undefined})}>背景画像を解除</button>}
 <button onClick={()=>props.onApply(selected.id)}>全ページに適用</button><p>PDFの背景は保持します。</p><button onClick={()=>setMenu({...menu,template:false})}>← ページ操作に戻る</button>
 </>}
 </div>,document.body)}
 </aside>;
}
