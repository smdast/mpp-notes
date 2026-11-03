import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent as PE} from "react";
import {createPortal} from "react-dom";
import {MoreVertical,Plus,Copy,Trash2,FilePenLine,ArrowUp,ArrowDown,PanelLeftClose,PanelLeftOpen} from "lucide-react";
import type {Page} from "./model";
import {PagePreview} from "./PagePreview";
import {pdfjs,pdfOptions} from "./pdf";
import type {PDFDocumentProxy} from "pdfjs-dist";
import {PageTemplateDialog} from "./PageTemplateDialog";
import {ScrollMotion} from "./motion";
import {PAGE_HOLD_MS,PAGE_HOLD_SLOP,pageGridSlot,pageDropTarget} from "./pageDrag";
type Props={pdf?:Uint8Array;collapsed:boolean;onCollapse:(collapsed:boolean)=>void;pages:Page[];active:string;dark:boolean;onSelect:(id:string)=>void;onAdd:()=>void;onInsert:(id:string,after:boolean)=>void;onDuplicate:(id:string)=>void;onDelete:(id:string)=>void;onReorder:(from:string,to:string,after:boolean)=>void;onTemplate:(id:string,patch:Partial<Page>)=>void;onApply:(id:string)=>void;onError:(s:string)=>void};
type Drag={id:string;slot:number;src:string;width:number;height:number};
type Gesture={id:string;pointer:number;type:string;x:number;y:number;startX:number;startY:number;lastY:number;time:number;velocity:number;started:boolean;scrolling:boolean;offsetX:number;offsetY:number;width:number;height:number;slot:number;src:string};
export function PageSidebar(props:Props){
 const [pdfDocument,setPDFDocument]=useState<PDFDocumentProxy>();
 useEffect(()=>{
  if(!props.pdf||props.collapsed){setPDFDocument(undefined);return;}
  let disposed=false;const task=pdfjs.getDocument({...pdfOptions(),data:props.pdf.slice()});
  void task.promise.then(doc=>{if(!disposed)setPDFDocument(doc);}).catch(()=>{if(!disposed)props.onError("PDFのページプレビューを表示できません。");});
  return()=>{disposed=true;setPDFDocument(undefined);void task.destroy();};
 },[props.pdf,props.collapsed]);
 const list=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null),ghost=useRef<HTMLDivElement>(null);
 const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null),[templateId,setTemplateId]=useState<string|null>(null),[drag,setDrag]=useState<Drag|null>(null);
 const gesture=useRef<Gesture|null>(null),frame=useRef(0),hold=useRef(0),motion=useRef<ScrollMotion|null>(null);
 const callbacks=useRef(props);callbacks.current=props;
 const menuRef=useRef(menu);menuRef.current=menu;
 const anchor=useRef<HTMLButtonElement|null>(null),layout=useRef(new Map<string,DOMRect>());
 function cancel(){
  clearTimeout(hold.current);cancelAnimationFrame(frame.current);const g=gesture.current;gesture.current=null;setDrag(null);
  if(g&&list.current?.hasPointerCapture(g.pointer))list.current.releasePointerCapture(g.pointer);
 }
 useEffect(()=>{if(list.current)motion.current=new ScrollMotion(list.current);return()=>{clearTimeout(hold.current);cancelAnimationFrame(frame.current);gesture.current=null;motion.current?.destroy();};},[]);
 useEffect(()=>{if(gesture.current)cancel();},[props.pages]);
 useEffect(()=>{if(menu)popup.current?.querySelector<HTMLButtonElement>("button")?.focus();},[menu?.id]);
 useEffect(()=>{
  const close=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest(".page-context-menu,.page-more"))setMenu(null);};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){cancel();if(menuRef.current){setMenu(null);anchor.current?.focus();}}};
  const reset=()=>{cancel();setMenu(null);if(/\/settings\/?$/.test(location.pathname))setTemplateId(null);};
  document.addEventListener("pointerdown",close,true);window.addEventListener("keydown",key);window.addEventListener("resize",reset);window.addEventListener("popstate",reset);window.addEventListener("blur",cancel);
  return()=>{document.removeEventListener("pointerdown",close,true);window.removeEventListener("keydown",key);window.removeEventListener("resize",reset);window.removeEventListener("popstate",reset);window.removeEventListener("blur",cancel);};
 },[]);
 useLayoutEffect(()=>{
  const next=new Map<string,DOMRect>();
  for(const el of list.current?.querySelectorAll<HTMLElement>("[data-side-page]")||[]){
   el.getAnimations().forEach(a=>a.cancel());const r=el.getBoundingClientRect(),id=el.dataset.sidePage!;next.set(id,r);
   const old=layout.current.get(id);
   if(drag&&old&&!matchMedia("(prefers-reduced-motion: reduce)").matches){const dx=old.left-r.left,dy=old.top-r.top;if(Math.hypot(dx,dy)>1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"translate(0,0)"}],{duration:140,easing:"ease-out"});}
  }
  layout.current=next;
 },[drag?.slot,drag?.id,props.pages,props.collapsed]);
 function updateSlot(g:Gesture){
  const v=list.current;if(!v)return;
  const r=v.getBoundingClientRect();
  if(g.x<r.left||g.x>r.right)return;
  const slot=pageGridSlot(g.x,g.y,r.left+4,r.top+4-v.scrollTop,g.width,g.height,8,12,callbacks.current.pages.length);
  if(slot!==g.slot){g.slot=slot;setDrag(d=>d?{...d,slot}:d);}
 }
 function tick(){
  const g=gesture.current,v=list.current;if(!g?.started||!v)return;
  const r=v.getBoundingClientRect();
  if(g.y<r.top+36)v.scrollTop-=Math.min(14,(r.top+36-g.y)/3);
  else if(g.y>r.bottom-36)v.scrollTop+=Math.min(14,(g.y-r.bottom+36)/3);
  if(ghost.current)ghost.current.style.transform=`translate3d(${g.x-g.offsetX}px,${g.y-g.offsetY}px,0)`;
  updateSlot(g);frame.current=requestAnimationFrame(tick);
 }
 function down(e:PE,id:string){
  if(e.button!==0||!e.isPrimary||gesture.current)return;
  e.preventDefault();motion.current?.stop();
  const r=e.currentTarget.getBoundingClientRect();
  const g:Gesture={id,pointer:e.pointerId,type:e.pointerType,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,lastY:e.clientY,time:e.timeStamp,velocity:0,started:false,scrolling:false,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,width:r.width,height:r.height,slot:props.pages.findIndex(p=>p.id===id),src:e.currentTarget.querySelector<HTMLImageElement>("img")?.src||""};
  gesture.current=g;list.current?.setPointerCapture(e.pointerId);
  hold.current=window.setTimeout(()=>{
   if(gesture.current!==g||g.scrolling)return;
   g.started=true;setMenu(null);setDrag({id,slot:g.slot,src:g.src,width:g.width,height:g.height});frame.current=requestAnimationFrame(tick);
  },PAGE_HOLD_MS);
 }
 function move(e:PE){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;e.preventDefault();
  g.x=e.clientX;g.y=e.clientY;
  if(!g.started){
   if(Math.hypot(g.x-g.startX,g.y-g.startY)>PAGE_HOLD_SLOP){clearTimeout(hold.current);g.scrolling=true;}
   if(g.scrolling&&g.type!=="mouse"&&list.current){const dy=g.lastY-g.y;list.current.scrollTop+=dy;g.velocity=g.velocity*.4+(dy/Math.max(1,e.timeStamp-g.time))*.6;}
   g.lastY=g.y;g.time=e.timeStamp;
  }
 }
 function end(e:PE,cancelled=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  clearTimeout(hold.current);cancelAnimationFrame(frame.current);
  if(g.started&&!cancelled){
   g.x=e.clientX;g.y=e.clientY;updateSlot(g);const r=list.current?.getBoundingClientRect();
   if(r&&g.x>=r.left&&g.x<=r.right&&g.y>=r.top&&g.y<=r.bottom){const target=pageDropTarget(callbacks.current.pages,g.id,g.slot);if(target)callbacks.current.onReorder(g.id,target.id,target.after);}
  }else if(!cancelled&&!g.scrolling)callbacks.current.onSelect(g.id);
  if(!cancelled&&g.scrolling&&g.type!=="mouse"&&e.timeStamp-g.time<90)motion.current?.fling(0,g.velocity);
  gesture.current=null;setDrag(null);
  if(list.current?.hasPointerCapture(e.pointerId))list.current.releasePointerCapture(e.pointerId);
 }
 function open(e:React.MouseEvent<HTMLButtonElement>,id:string){anchor.current=e.currentTarget;const r=e.currentTarget.getBoundingClientRect();props.onSelect(id);setMenu({id,x:Math.min(innerWidth-180,Math.max(8,r.right+8)),y:Math.max(8,Math.min(innerHeight-235,r.top))});}
 const templatePage=props.pages.find(p=>p.id===templateId),selected=props.pages.find(p=>p.id===menu?.id);
 const tiles:(Page|null)[]=drag?props.pages.filter(p=>p.id!==drag.id):props.pages;
 if(drag)tiles.splice(drag.slot,0,null);
 return <aside className={"page-strip "+(props.collapsed?"pages-collapsed":"")} aria-label="ページ一覧">
 <div className="page-strip-header">{!props.collapsed&&<span className="page-strip-heading">ページ <small>{props.pages.length}</small></span>}<button className="page-strip-toggle" aria-label={props.collapsed?"ページ一覧を開く":"ページ一覧をたたむ"} title={props.collapsed?"ページ一覧を開く":"ページ一覧をたたむ"} aria-expanded={!props.collapsed} aria-controls="page-preview-list" onClick={()=>{cancel();setMenu(null);setTemplateId(null);props.onCollapse(!props.collapsed);}}>{props.collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button></div>
 <div id="page-preview-list" hidden={props.collapsed} ref={list} className={"page-list page-grid "+(drag?"sorting":"")} onScroll={()=>setMenu(null)} onContextMenu={e=>{if(gesture.current)e.preventDefault();}} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>end(e,true)} onPointerDownCapture={e=>{if(gesture.current&&gesture.current.pointer!==e.pointerId)cancel();}}>
 {tiles.map(p=>{
  if(!p)return <div key="drop-slot" className="page-drop-cell" aria-label="移動先"><span className="page-drop-slot" aria-hidden="true"/></div>;
  const i=props.pages.indexOf(p);
  return <div key={p.id} data-side-page={p.id} className="page-item">
  <button className={"page-thumb "+(props.active===p.id?"current":"")} aria-label={`ページ ${i+1}`} aria-current={props.active===p.id?"page":undefined} title="長押しで並び替え・Alt＋矢印キーで移動" onClick={e=>{if(e.detail===0)props.onSelect(p.id);}} onPointerDown={e=>down(e,p.id)} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{
   if(!e.altKey)return;const delta=e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:e.key==="ArrowUp"?-2:e.key==="ArrowDown"?2:0,target=props.pages[i+delta];
   if(delta&&target){e.preventDefault();props.onReorder(p.id,target.id,delta>0);}
  }}>
  {!props.collapsed&&<PagePreview page={p} dark={props.dark} pdfDocument={pdfDocument} number={i+1}/>}<small>{i+1}</small></button>
  <button className="page-more" aria-label={`ページ ${i+1} のメニュー`} aria-expanded={menu?.id===p.id} onClick={e=>open(e,p.id)}><MoreVertical size={16}/></button>
  </div>;
 })}
 <div className="page-add-cell"><button className="page-add-tile" aria-label="ページを追加" onClick={props.onAdd}><Plus size={24}/><span>ページを追加</span></button></div>
 </div>
 {drag&&createPortal(<><div ref={ghost} className="page-drag-ghost" style={{width:drag.width,height:drag.height,transform:`translate3d(${(gesture.current?.x||0)-(gesture.current?.offsetX||0)}px,${(gesture.current?.y||0)-(gesture.current?.offsetY||0)}px,0)`}} aria-hidden="true">{drag.src?<img src={drag.src} alt="" draggable={false}/>:<span className="page-ghost-empty"/>}</div><span className="page-drag-status" role="status">ページを移動中です。空白の位置で離して移動、Escapeで中止します。</span></>,document.body)}
 {menu&&selected&&createPortal(<div ref={popup} className="page-context-menu" role="dialog" aria-label="ページの操作" style={{left:Math.max(8,menu.x),top:menu.y}}>
 <header><b>ページ {props.pages.indexOf(selected)+1}</b><button aria-label="ページメニューを閉じる" onClick={()=>setMenu(null)}>×</button></header>
 <button onClick={()=>{props.onInsert(selected.id,false);setMenu(null);}}><ArrowUp size={15}/>前にページを挿入</button><button onClick={()=>{props.onInsert(selected.id,true);setMenu(null);}}><ArrowDown size={15}/>後にページを挿入</button><button onClick={()=>{props.onDuplicate(selected.id);setMenu(null);}}><Copy size={15}/>ページを複製</button><button disabled={selected.pdfIndex!==undefined} title={selected.pdfIndex!==undefined?"元PDFの背景は保持します":undefined} onClick={()=>{setTemplateId(selected.id);setMenu(null);}}><FilePenLine size={15}/>テンプレートを変更</button><button disabled={props.pages.length===1} onClick={()=>{props.onDelete(selected.id);setMenu(null);}}><Trash2 size={15}/>ページを削除</button>
 </div>,document.body)}
 {templatePage&&createPortal(<PageTemplateDialog key={templatePage.id} page={templatePage} number={props.pages.indexOf(templatePage)+1} dark={props.dark}
   onChange={patch=>props.onTemplate(templatePage.id,patch)} onApply={()=>props.onApply(templatePage.id)}
   onClose={()=>{setTemplateId(null);anchor.current?.focus();}}/>,document.body)}
 </aside>;
}
