import type {Page} from "./model";
import {MIN_ZOOM,MAX_ZOOM,PAGE_START,PAGE_LABEL,PAGE_GAP,type ScrollDirection} from "./scrolling";
export type NoteView={version:1;pageId:string;index:number;zoom:number;x:number;y:number;direction?:ScrollDirection};
type ViewPage=Pick<Page,"id"|"height"|"width">;
type ViewStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const prefix="mpp-notes:view:1:",memory=new Map<string,NoteView>();
function storage():ViewStorage|undefined{try{return globalThis.localStorage;}catch{return;}}
export function validNoteView(value:unknown):value is NoteView{
  if(!value||typeof value!=="object")return false;const v=value as NoteView;
  return v.version===1&&(v.direction===undefined||v.direction==="horizontal"||v.direction==="vertical")&&typeof v.pageId==="string"&&v.pageId.length>0&&v.pageId.length<=200&&Number.isInteger(v.index)&&v.index>=0&&v.index<100000&&Number.isFinite(v.zoom)&&v.zoom>=MIN_ZOOM&&v.zoom<=MAX_ZOOM&&Number.isFinite(v.x)&&Math.abs(v.x)<10000000&&Number.isFinite(v.y)&&Math.abs(v.y)<10000000;
}
export function readNoteView(id:string,target=storage()):NoteView|undefined{
  const cached=memory.get(id);if(cached)return cached;
  try{const raw=target?.getItem(prefix+id);if(raw){const value=JSON.parse(raw);if(validNoteView(value)){memory.set(id,value);return value;}}}catch{}return;
}
export function saveNoteView(id:string,value:NoteView,target=storage()){
  if(!validNoteView(value))return false;memory.set(id,value);
  try{if(!target)return false;target.setItem(prefix+id,JSON.stringify(value));return true;}catch{return false;}
}
export function forgetNoteView(id:string,target=storage()){memory.delete(id);try{target?.removeItem(prefix+id);}catch{}}
export function captureNoteView(pages:ViewPage[],zoom:number,left:number,top:number,viewportWidth:number,direction:ScrollDirection="vertical",viewportHeight=0):NoteView|undefined{
  if(!pages.length||viewportWidth<=0)return;
  const horizontal=direction==="horizontal",label=horizontal?0:PAGE_LABEL;
  const offset=horizontal?left:top;
  const extent=horizontal?"width":"height";
  let start=PAGE_START,index=0;
  for(;index<pages.length-1;index++){
    const next=start+label+pages[index][extent]*zoom+PAGE_GAP;
    // The leading gutter can already be showing the next page after a sidebar jump.
    if(offset<next-PAGE_GAP)break;
    start=next;
  }
  const cross=horizontal?viewportHeight:viewportWidth;
  const centre=crossCentre(pages,zoom,cross,horizontal);
  return {version:1,pageId:pages[index].id,index,zoom,
    x:((horizontal?top:left)+cross/2-centre)/zoom,y:(offset-start-label)/zoom,
    ...(horizontal?{direction}:{})};
}
export function restoreNoteView(pages:ViewPage[],view:NoteView,viewportWidth:number,direction:ScrollDirection="vertical",viewportHeight=0){
  if(!pages.length)return {pageId:"",left:0,top:0};
  const found=pages.findIndex(p=>p.id===view.pageId),index=found<0?Math.min(view.index,pages.length-1):found;
  const horizontal=direction==="horizontal",label=horizontal?0:PAGE_LABEL;
  const extent=horizontal?"width":"height";
  const start=PAGE_START+pages.slice(0,index).reduce((sum,p)=>sum+label+p[extent]*view.zoom+PAGE_GAP,0)+label;
  const sameDirection=(view.direction??"vertical")===direction;
  const offset=found<0?0:sameDirection?Math.max(-(PAGE_GAP+label)/view.zoom,Math.min(pages[index][extent]+PAGE_GAP/view.zoom,view.y)):-label/view.zoom;
  const cross=horizontal?viewportHeight:viewportWidth;
  const centre=crossCentre(pages,view.zoom,cross,horizontal);
  const primary=Math.max(0,start+offset*view.zoom);
  const secondary=sameDirection?Math.max(0,centre+view.x*view.zoom-cross/2):0;
  return {pageId:pages[index].id,left:horizontal?primary:secondary,top:horizontal?secondary:primary};
}
function crossCentre(pages:ViewPage[],zoom:number,viewport:number,horizontal:boolean){
  const extent=horizontal?"height":"width",label=horizontal?PAGE_LABEL:0;
  return Math.max(viewport,Math.max(...pages.map(p=>p[extent]))*zoom+96+label)/2+label/2;
}
