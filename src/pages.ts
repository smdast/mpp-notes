import { uid, type Page } from "./model";
import { newPageFrom } from "./paper";
export function reorderPages(pages:Page[], source:string, target:string, after=false):Page[]{
 if(source===target||!pages.some(p=>p.id===source)||!pages.some(p=>p.id===target))return pages;
 const moved=pages.find(p=>p.id===source)!;
 const rest=pages.filter(p=>p.id!==source), index=rest.findIndex(p=>p.id===target)+(after?1:0);
 const result=[...rest.slice(0,index),moved,...rest.slice(index)];
 return result.every((p,i)=>p===pages[i])?pages:result;
}
export function duplicatePage(page:Page):Page{
 return {...page,id:uid(),strokes:page.strokes.map(s=>({...s,id:uid(),points:s.points.map(p=>({...p}))}))};
}
export function insertedPage(pages:Page[], target:string, after:boolean, dark:boolean){
 const index=pages.findIndex(p=>p.id===target);
 if(index<0)return null;
 const page=newPageFrom(after?pages[index]:pages[index-1]??pages[index],dark);
 const at=index+(after?1:0);
 return {page,pages:[...pages.slice(0,at),page,...pages.slice(at)]};
}
