import type {Page} from "./model";
import {MIN_ZOOM,MAX_ZOOM} from "./scrolling";
export type NoteView={version:1;pageId:string;index:number;zoom:number;x:number;y:number};
type ViewPage=Pick<Page,"id"|"height"|"width">;
type ViewStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const prefix="mpp-notes:view:1:",memory=new Map<string,NoteView>();
function storage():ViewStorage|undefined{try{return globalThis.localStorage;}catch{return;}}
export function validNoteView(value:unknown):value is NoteView{
  if(!value||typeof value!=="object")return false;const v=value as NoteView;
  return v.version===1&&typeof v.pageId==="string"&&v.pageId.length>0&&v.pageId.length<=200&&Number.isInteger(v.index)&&v.index>=0&&v.index<100000&&Number.isFinite(v.zoom)&&v.zoom>=MIN_ZOOM&&v.zoom<=MAX_ZOOM&&Number.isFinite(v.x)&&Math.abs(v.x)<10000000&&Number.isFinite(v.y)&&Math.abs(v.y)<10000000;
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
export function captureNoteView(pages:ViewPage[],zoom:number,left:number,top:number,viewportWidth:number):NoteView|undefined{
  if(!pages.length||viewportWidth<=0)return;
  let pageTop=16,index=0;
  for(;index<pages.length-1;index++){const bottom=pageTop+24+pages[index].height*zoom+34;if(top<bottom)break;pageTop=bottom;}
  const centre=Math.max(viewportWidth,Math.max(...pages.map(p=>p.width))*zoom+96)/2;
  return {version:1,pageId:pages[index].id,index,zoom,x:(left+viewportWidth/2-centre)/zoom,y:(top-pageTop-24)/zoom};
}
export function restoreNoteView(pages:ViewPage[],view:NoteView,viewportWidth:number){
  if(!pages.length)return {pageId:"",left:0,top:0};
  const found=pages.findIndex(p=>p.id===view.pageId),index=found<0?Math.min(view.index,pages.length-1):found;
  const top=16+pages.slice(0,index).reduce((sum,p)=>sum+24+p.height*view.zoom+34,0)+24;
  const y=found<0?0:Math.max(-40/view.zoom,Math.min(pages[index].height+34/view.zoom,view.y));
  const centre=Math.max(viewportWidth,Math.max(...pages.map(p=>p.width))*view.zoom+96)/2;
  return {pageId:pages[index].id,left:Math.max(0,centre+view.x*view.zoom-viewportWidth/2),top:Math.max(0,top+y*view.zoom)};
}
