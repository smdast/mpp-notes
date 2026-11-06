import type {Stroke} from "./model";
import {correctShape} from "./shapes";
export const SHAPE_HOLD_MS=450,SHAPE_HOLD_SLOP=3;
export class EndpointHold {
  private anchor:{x:number;y:number;time:number}|null=null;
  endpointCount=1;
  start(x:number,y:number,time:number){this.anchor={x,y,time};this.endpointCount=1;}
  move(x:number,y:number,time:number,count:number){
    if(!this.anchor||Math.hypot(x-this.anchor.x,y-this.anchor.y)>SHAPE_HOLD_SLOP){this.anchor={x,y,time};this.endpointCount=count;}
  }
  ready(x:number,y:number,time:number){return !!this.anchor&&Math.hypot(x-this.anchor.x,y-this.anchor.y)<=SHAPE_HOLD_SLOP&&time-this.anchor.time>=SHAPE_HOLD_MS;}
  reset(){this.anchor=null;this.endpointCount=1;}
}
export function correctHeldShape(stroke:Stroke,references:Stroke[],hold:EndpointHold,release:{clientX:number;clientY:number;timeStamp:number}){
  if(!hold.ready(release.clientX,release.clientY,release.timeStamp))return stroke;
  // Repeated pressure/jitter samples at the held endpoint must not distort
  // the recognizer's path length. Keep the original ink if no shape matches.
  const points=stroke.points.slice(0,hold.endpointCount),last=stroke.points.at(-1);
  if(last&&points.at(-1)!==last)points.push(last);
  const candidate={...stroke,points},corrected=correctShape(candidate,references);
  return corrected===candidate?stroke:corrected;
}
