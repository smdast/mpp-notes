import type {Page} from "./model";
export const PAGE_HOLD_MS=450;
export const PAGE_HOLD_SLOP=8;
export function pageGridSlot(x:number,y:number,left:number,top:number,width:number,height:number,gapX:number,gapY:number,count:number){
 const col=Math.max(0,Math.min(1,Math.floor((x-left)/(width+gapX))));
 const row=Math.max(0,Math.floor((y-top)/(height+gapY)));
 return Math.max(0,Math.min(count-1,row*2+col));
}
export function pageDropTarget(pages:Page[],source:string,slot:number){
 const rest=pages.filter(p=>p.id!==source);if(!rest.length||rest.length===pages.length)return null;
 const at=Math.max(0,Math.min(rest.length,Math.round(slot)));
 return at===rest.length?{id:rest[rest.length-1].id,after:true}:{id:rest[at].id,after:false};
}
