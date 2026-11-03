import {uid,type Point,type Stroke,type Page} from "./model";
import type {PageChange} from "./notebookHistory";
export type ClientPoint={x:number;y:number};
export type SelectionDrag={phase:"start"|"move"|"end"|"cancel";strokes:Stroke[];start:Point;client:ClientPoint};
export type IncomingSelection={pageId:string;ids:string[];token:number};
export function transferSelection(pages:Page[],sourceId:string,targetId:string,strokes:Stroke[],start:Point,end:Point):PageChange[]{
 const source=pages.find(p=>p.id===sourceId),target=pages.find(p=>p.id===targetId);
 if(!source||!target)return [];
 if(source===target&&Math.hypot(end.x-start.x,end.y-start.y)<.01)return [];
 const ids=new Set(strokes.map(s=>s.id));
 const current=source.strokes.filter(s=>ids.has(s.id));
 if(!current.length)return [];
 const occupied=new Set(source===target?[]:target.strokes.map(s=>s.id));
 const moved=current.map(s=>({...s,id:occupied.has(s.id)?uid():s.id,points:s.points.map(p=>({...p,x:p.x+end.x-start.x,y:p.y+end.y-start.y}))}));
 if(source===target){const replacements=new Map(moved.map(s=>[s.id,s]));return [{id:sourceId,strokes:source.strokes.map(s=>replacements.get(s.id)||s)}];}
 return [{id:sourceId,strokes:source.strokes.filter(s=>!ids.has(s.id))},{id:targetId,strokes:[...target.strokes,...moved]}];
}
