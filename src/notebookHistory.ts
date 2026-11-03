import type {Page,Stroke} from "./model";
export type PageChange={id:string;strokes:Stroke[]};
type Edit={id:string;before:Stroke[];after:Stroke[]}[];
export type NotebookHistory={past:Edit[];future:Edit[]};
export function recordPages(history:NotebookHistory,pages:Page[],changes:PageChange[]):NotebookHistory {
 const edits:Edit=[];
 for(const change of changes){const page=pages.find(p=>p.id===change.id);if(page&&page.strokes!==change.strokes)edits.push({id:page.id,before:page.strokes,after:change.strokes});}
 return edits.length?{past:[...history.past.slice(-49),edits],future:[]}:history;
}
export function travelPages(history:NotebookHistory,pages:Page[],redo=false){
 const source=redo?history.future:history.past,edit=source.at(-1);
 if(!edit)return {history,pages,ids:[] as string[]};
 const replacements=new Map(edit.map(e=>[e.id,redo?e.after:e.before]));
 return {history:redo?{past:[...history.past,edit],future:history.future.slice(0,-1)}:{past:history.past.slice(0,-1),future:[...history.future,edit]},
  pages:pages.map(p=>replacements.has(p.id)?{...p,strokes:replacements.get(p.id)!}:p),ids:edit.map(e=>e.id)};
}
export function forgetPage(history:NotebookHistory,id:string):NotebookHistory {
 // Old snapshots may include ink transferred from the deleted page. Dropping
 // just the transfer entry would let older edits accidentally discard that ink.
 return [...history.past,...history.future].some(edit=>edit.some(e=>e.id===id))?{past:[],future:[]}:history;
}
