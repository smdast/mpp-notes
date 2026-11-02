import {useEffect, useRef, type RefObject} from "react";
export function useDismiss(open:boolean, refs:RefObject<HTMLElement|null>[], close:()=>void, consumeCanvas=false){
 const latest=useRef({refs,close});latest.current={refs,close};
 useEffect(()=>{
  if(!open)return;
  const down=(e:PointerEvent)=>{
   if(latest.current.refs.some(r=>r.current&&e.composedPath().includes(r.current)))return;
   latest.current.close();
   if(consumeCanvas&&e.target instanceof Element&&e.target.closest(".viewport")){e.preventDefault();e.stopPropagation();}
  };
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape")latest.current.close();};
  document.addEventListener("pointerdown",down,true);document.addEventListener("keydown",key);
  return()=>{document.removeEventListener("pointerdown",down,true);document.removeEventListener("keydown",key);};
 },[open,consumeCanvas]);
}
