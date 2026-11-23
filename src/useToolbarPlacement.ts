import {useEffect,useLayoutEffect,useRef,type RefObject,type PointerEvent,type KeyboardEvent} from "react";
import {clampToolbarPosition,type ToolbarPlacement} from "./toolbarPlacement";
type Point={x:number;y:number};
type Drag={id:number;target:HTMLElement;client:Point;origin:Point;point:Point};
export function useToolbarPlacement(root:RefObject<HTMLDivElement|null>,placement:ToolbarPlacement,onChange:(placement:ToolbarPlacement)=>void,onMove:()=>void){
 const live=useRef({placement,onChange,onMove});live.current={placement,onChange,onMove};
 const position=useRef<Point>({x:placement.x,y:placement.y}),drag=useRef<Drag|null>(null),frame=useRef(0);
 function clamp(point:Point){const r=root.current?.getBoundingClientRect();return clampToolbarPosition(point,{width:r?.width||0,height:r?.height||0},{width:window.innerWidth,height:window.innerHeight});}
 function paint(point:Point){position.current=point;if(root.current){root.current.style.left=`${point.x}px`;root.current.style.top=`${point.y}px`;}}
 function store(point:Point){const p=live.current.placement;if(point.x!==p.x||point.y!==p.y)live.current.onChange({...p,...point});}
 function finish(cancelled:boolean){
  const d=drag.current;if(!d)return;
  drag.current=null;cancelAnimationFrame(frame.current);frame.current=0;
  root.current?.removeAttribute("data-dragging");
  paint(clamp(cancelled?d.origin:d.point));
  if(d.target.hasPointerCapture(d.id))d.target.releasePointerCapture(d.id);
  if(!cancelled)store(position.current);
 }
 useLayoutEffect(()=>{
  if(drag.current)return;
  if(placement.mode==="floating")paint(clamp(placement));
  else{root.current?.style.removeProperty("left");root.current?.style.removeProperty("top");}
 },[placement.mode,placement.x,placement.y]);
 useEffect(()=>{
  const resize=()=>{if(drag.current)finish(true);if(live.current.placement.mode==="floating")paint(clamp(live.current.placement));};
  const blur=()=>finish(true),escape=(e:globalThis.KeyboardEvent)=>{if(e.key==="Escape"&&drag.current){e.preventDefault();e.stopPropagation();finish(true);}};
  const observer=new ResizeObserver(resize);if(root.current)observer.observe(root.current);
  window.addEventListener("resize",resize);window.visualViewport?.addEventListener("resize",resize);window.addEventListener("blur",blur);window.addEventListener("keydown",escape,true);
  return()=>{cancelAnimationFrame(frame.current);drag.current=null;observer.disconnect();window.removeEventListener("resize",resize);window.visualViewport?.removeEventListener("resize",resize);window.removeEventListener("blur",blur);window.removeEventListener("keydown",escape,true);};
 },[root]);
 return {
  toggle(){live.current.onMove();const p=live.current.placement;live.current.onChange({...p,...(p.mode==="floating"?position.current:{}),mode:p.mode==="floating"?"docked":"floating"});},
  handle:{
   onPointerDown(e:PointerEvent<HTMLButtonElement>){
    if(e.button!==0||!e.isPrimary||drag.current||live.current.placement.mode!=="floating")return;
    e.preventDefault();e.stopPropagation();live.current.onMove();
    const origin={...position.current};drag.current={id:e.pointerId,target:e.currentTarget,client:{x:e.clientX,y:e.clientY},origin,point:origin};
    e.currentTarget.setPointerCapture(e.pointerId);root.current?.setAttribute("data-dragging","true");
   },
   onPointerMove(e:PointerEvent<HTMLButtonElement>){
    const d=drag.current;if(!d||d.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();
    d.point=clamp({x:d.origin.x+e.clientX-d.client.x,y:d.origin.y+e.clientY-d.client.y});
    if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(drag.current)paint(drag.current.point);});
   },
   onPointerUp(e:PointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();d.point=clamp({x:d.origin.x+e.clientX-d.client.x,y:d.origin.y+e.clientY-d.client.y});finish(false);},
   onPointerCancel(e:PointerEvent<HTMLButtonElement>){if(drag.current?.id===e.pointerId)finish(true);},
   onLostPointerCapture(e:PointerEvent<HTMLButtonElement>){if(drag.current?.id===e.pointerId)finish(true);},
   onKeyDown(e:KeyboardEvent<HTMLButtonElement>){
    if(drag.current)return;
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;
    e.preventDefault();e.stopPropagation();live.current.onMove();const step=e.shiftKey?24:8;
    const p=clamp({x:position.current.x+delta[0]*step,y:position.current.y+delta[1]*step});paint(p);store(p);
   },
  },
 };
}
