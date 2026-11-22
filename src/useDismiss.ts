import {useEffect, useRef, type RefObject} from "react";
export function useDismiss(open:boolean, refs:RefObject<HTMLElement|null>[], close:()=>void, consumeCanvas=false){
 const latest=useRef({refs,close});latest.current={refs,close};
 useEffect(()=>{
  if(!open)return;
  const down=(e:PointerEvent)=>{
   if(document.querySelector("dialog[open]"))return;
   if(latest.current.refs.some(r=>r.current&&e.composedPath().includes(r.current)))return;
   // Selector options are portalled outside the parent popover. Keep the parent
   // alive until the related listbox has committed the chosen folder.
   const listbox=e.composedPath().find(node=>node instanceof HTMLElement&&node.getAttribute("role")==="listbox") as HTMLElement|undefined;
   if(listbox?.id&&latest.current.refs.some(ref=>Array.from(ref.current?.querySelectorAll("[aria-controls]")??[]).some(control=>control.getAttribute("aria-controls")?.split(" ").includes(listbox.id))))return;
   latest.current.close();
   if(consumeCanvas&&e.target instanceof Element&&e.target.closest(".viewport")){e.preventDefault();e.stopPropagation();}
  };
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!e.defaultPrevented&&!document.querySelector("dialog[open]"))latest.current.close();};
  document.addEventListener("pointerdown",down,true);document.addEventListener("keydown",key);
  return()=>{document.removeEventListener("pointerdown",down,true);document.removeEventListener("keydown",key);};
 },[open,consumeCanvas]);
}
