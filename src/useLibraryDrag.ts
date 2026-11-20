import {useEffect,useRef} from "react";
import {libraryMoveTarget,type LibraryItem} from "./libraryMove";
import type {Note} from "./model";

export function useLibraryDrag({enabled,notes,folders,onMove,onError}:{
  enabled:boolean;notes:Note[];folders:string[];
  onMove:(item:LibraryItem,target:string)=>void;onError:(message:string)=>void;
}){
  const latest=useRef({notes,folders,onMove,onError});
  latest.current={notes,folders,onMove,onError};
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!enabled||!root.current)return;
    const container=root.current;
    let item:LibraryItem|undefined,source:HTMLElement|undefined,target:HTMLElement|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined,ghost:HTMLElement|undefined;
    let pointer:{id:number;x:number;y:number;startX:number;startY:number}|undefined;
    let frame=0,suppressClick=false;
    const clearTarget=()=>{target?.classList.remove("library-drop-target");target=undefined;};
    const stop=()=>{
      clearTimeout(timer);timer=undefined;cancelAnimationFrame(frame);frame=0;
      clearTarget();source?.classList.remove("library-drag-source");source=undefined;
      ghost?.remove();ghost=undefined;item=undefined;pointer=undefined;
    };
    const destinationAt=(element:Element|null)=>element?.closest<HTMLElement>("[data-library-target]");
    const hover=(element:Element|null)=>{
      const next=destinationAt(element);
      if(next===target)return;
      clearTarget();
      if(!item||!next)return;
      try{
        if(libraryMoveTarget(item,next.dataset.libraryTarget!,latest.current.notes,latest.current.folders)!==undefined){
          target=next;next.classList.add("library-drop-target");
        }
      }catch{}
    };
    const start=(element:HTMLElement)=>{
      source=element;
      item={kind:element.dataset.libraryKind as LibraryItem["kind"],id:element.dataset.libraryId!};
      element.classList.add("library-drag-source");
    };
    const drop=(element:Element|null)=>{
      const destination=destinationAt(element)?.dataset.libraryTarget;
      if(!item||destination===undefined)return;
      try{
        const current=latest.current;
        if(libraryMoveTarget(item,destination,current.notes,current.folders)!==undefined)current.onMove(item,destination);
      }catch(error){latest.current.onError(error instanceof Error?error.message:"移動できません。");}
    };
    const dragStart=(event:DragEvent)=>{
      const element=event.target instanceof Element?event.target.closest<HTMLElement>("[data-library-kind]"):null;
      if(!element||!event.dataTransfer)return;
      if(pointer&&item){event.preventDefault();return;}
      stop();start(element);
      event.dataTransfer.effectAllowed="move";
      event.dataTransfer.setData("application/x-mpp-library",JSON.stringify(item));
    };
    const dragOver=(event:DragEvent)=>{
      if(!item||!(event.target instanceof Element))return;
      hover(event.target);
      if(destinationAt(event.target)){
        event.preventDefault();
        if(event.dataTransfer)event.dataTransfer.dropEffect=target?"move":"none";
      }
    };
    const nativeDrop=(event:DragEvent)=>{
      if(!item)return;
      event.preventDefault();event.stopPropagation();
      drop(event.target instanceof Element?event.target:null);stop();
    };
    const tick=()=>{
      if(!pointer||!ghost)return;
      const {x,y}=pointer;
      ghost.style.transform=`translate3d(${x+14}px,${y+14}px,0)`;
      const element=document.elementFromPoint(x,y);
      hover(element);
      const scroll=element?.closest<HTMLElement>(".folder-list,.library-content");
      if(scroll){
        const bounds=scroll.getBoundingClientRect();
        if(y<bounds.top+44)scroll.scrollTop-=10;
        else if(y>bounds.bottom-44)scroll.scrollTop+=10;
      }
      frame=requestAnimationFrame(tick);
    };
    const pointerDown=(event:PointerEvent)=>{
      suppressClick=false;
      if(event.pointerType==="mouse"||event.button!==0)return;
      if(!(event.target instanceof Element)||event.target.closest(".library-note-menu,input,select,[data-library-action]"))return;
      const element=event.target.closest<HTMLElement>("[data-library-kind]");if(!element)return;
      stop();
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
      timer=setTimeout(()=>{
        if(!pointer)return;
        start(element);suppressClick=true;
        ghost=document.createElement("div");ghost.className="library-drag-ghost";
        ghost.textContent=element.dataset.libraryLabel??element.textContent;
        document.body.append(ghost);
        frame=requestAnimationFrame(tick);
        element.setPointerCapture(pointer.id);
      },450);
    };
    const pointerMove=(event:PointerEvent)=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      pointer.x=event.clientX;pointer.y=event.clientY;
      if(!item&&Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)>8)stop();
      if(item){event.preventDefault();event.stopPropagation();}
    };
    const pointerEnd=(event:PointerEvent)=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      if(item){
        event.preventDefault();event.stopPropagation();
        if(event.type==="pointerup")drop(document.elementFromPoint(event.clientX,event.clientY));
      }
      stop();
    };
    const touchMove=(event:TouchEvent)=>{if(item&&pointer)event.preventDefault();};
    const click=(event:MouseEvent)=>{
      if(!suppressClick)return;
      suppressClick=false;event.preventDefault();event.stopPropagation();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")stop();};
    container.addEventListener("dragstart",dragStart);
    container.addEventListener("dragover",dragOver);
    container.addEventListener("drop",nativeDrop);
    container.addEventListener("dragend",stop);
    container.addEventListener("pointerdown",pointerDown);
    container.addEventListener("click",click,true);
    document.addEventListener("pointermove",pointerMove,{passive:false});
    document.addEventListener("pointerup",pointerEnd);
    document.addEventListener("pointercancel",pointerEnd);
    document.addEventListener("touchmove",touchMove,{passive:false});
    document.addEventListener("keydown",key);
    window.addEventListener("blur",stop);
    return()=>{
      stop();
      container.removeEventListener("dragstart",dragStart);
      container.removeEventListener("dragover",dragOver);
      container.removeEventListener("drop",nativeDrop);
      container.removeEventListener("dragend",stop);
      container.removeEventListener("pointerdown",pointerDown);
      container.removeEventListener("click",click,true);
      document.removeEventListener("pointermove",pointerMove);
      document.removeEventListener("pointerup",pointerEnd);
      document.removeEventListener("pointercancel",pointerEnd);
      document.removeEventListener("touchmove",touchMove);
      document.removeEventListener("keydown",key);
      window.removeEventListener("blur",stop);
    };
  },[enabled]);
  return root;
}
