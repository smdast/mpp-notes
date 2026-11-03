import type {Point, Stroke} from "./model";
export type Bounds={left:number;top:number;right:number;bottom:number};
const boundsCache=new WeakMap<Stroke,Bounds>();
export function strokeBounds(stroke:Stroke):Bounds {
 const cached=boundsCache.get(stroke);if(cached)return cached;
 const b={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
 const padding=stroke.image?0:stroke.width*.65;
 for(const p of stroke.points){b.left=Math.min(b.left,p.x-padding);b.right=Math.max(b.right,p.x+padding);b.top=Math.min(b.top,p.y-padding);b.bottom=Math.max(b.bottom,p.y+padding);}
 boundsCache.set(stroke,b);return b;
}
export function pointBounds(points:Point[],padding=0):Bounds {
 const b={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
 for(const p of points){b.left=Math.min(b.left,p.x-padding);b.right=Math.max(b.right,p.x+padding);b.top=Math.min(b.top,p.y-padding);b.bottom=Math.max(b.bottom,p.y+padding);}return b;
}
export const overlaps=(a:Bounds,b:Bounds)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
export const unionBounds=(a:Bounds,b:Bounds):Bounds=>({left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)});
// Large objects use an overflow bucket rather than occupying thousands of cells.
export class StrokeIndex {
 private cells=new Map<string,Set<Stroke>>();
 private large=new Set<Stroke>();
 constructor(strokes:Stroke[]){for(const s of strokes)this.add(s);}
 private keys(b:Bounds):string[]|null {
  if(!Number.isFinite(b.left))return [];
  const l=Math.floor(b.left/128),r=Math.floor(b.right/128),t=Math.floor(b.top/128),d=Math.floor(b.bottom/128);
  if((r-l+1)*(d-t+1)>256)return null;
  const out:string[]=[];for(let y=t;y<=d;y++)for(let x=l;x<=r;x++)out.push(`${x},${y}`);return out;
 }
 add(s:Stroke){const keys=this.keys(strokeBounds(s));if(!keys){this.large.add(s);return;}for(const key of keys){let cell=this.cells.get(key);if(!cell){cell=new Set();this.cells.set(key,cell);}cell.add(s);}}
 remove(s:Stroke){const keys=this.keys(strokeBounds(s));if(!keys){this.large.delete(s);return;}for(const key of keys){const cell=this.cells.get(key);cell?.delete(s);if(!cell?.size)this.cells.delete(key);}}
 query(b:Bounds):Set<Stroke>{
  const found=new Set<Stroke>(),keys=this.keys(b);
  const inspect=(s:Stroke)=>{if(overlaps(strokeBounds(s),b))found.add(s);};
  if(!keys)for(const cell of this.cells.values())for(const s of cell)inspect(s);
  else for(const key of keys)for(const s of this.cells.get(key)||[])inspect(s);
  for(const s of this.large)inspect(s);return found;
 }
}
