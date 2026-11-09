import type {Stroke} from "./model";
import {correctShape} from "./shapes";
export const SHAPE_HOLD_MS=300,MAX_SHAPE_HOLD_MS=2000,SHAPE_HOLD_SLOP=6;
export class EndpointHold {
  private anchor:{x:number;y:number;time:number}|null=null;
  endpointCount=1;
  start(x:number,y:number,time:number){this.anchor={x,y,time};this.endpointCount=1;}
  move(x:number,y:number,time:number,count:number){
    if(!this.anchor||Math.hypot(x-this.anchor.x,y-this.anchor.y)>SHAPE_HOLD_SLOP){this.anchor={x,y,time};this.endpointCount=count;return true;}
    return false;
  }
  remaining(time:number,delay=SHAPE_HOLD_MS){return this.anchor?Math.max(0,this.anchor.time+delay-time):Infinity;}
  ready(x:number,y:number,time:number,delay=SHAPE_HOLD_MS){return !!this.anchor&&Math.hypot(x-this.anchor.x,y-this.anchor.y)<=SHAPE_HOLD_SLOP&&time-this.anchor.time>=delay;}
  reset(){this.anchor=null;this.endpointCount=1;}
}
export function correctHeldShape(stroke:Stroke,references:Stroke[],hold:EndpointHold,release:{clientX:number;clientY:number;timeStamp:number},delay=SHAPE_HOLD_MS){
  if(delay===0)return correctShape(stroke,references);
  if(!hold.ready(release.clientX,release.clientY,release.timeStamp,delay))return stroke;
  return recognizeHeldShape(stroke,references,hold.endpointCount);
}
export function recognizeHeldShape(stroke:Stroke,references:Stroke[],endpointCount:number){
  // Repeated pressure/jitter samples at the held endpoint must not distort
  // the recognizer's path length. Keep the original ink if no shape matches.
  const points=stroke.points.slice(0,endpointCount),last=stroke.points.at(-1);
  if(last&&points.at(-1)!==last)points.push(last);
  const candidate={...stroke,points},corrected=correctShape(candidate,references);
  return corrected===candidate?stroke:corrected;
}
