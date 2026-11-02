import {hits,type Point,type Stroke} from "./model";
// Require several deliberate, substantial reversals in a narrow band.
export function scratchPasses(points:Point[],zoom=1):Point[]|null{
 if(points.length<6)return null;
 let mx=0,my=0;for(const p of points){mx+=p.x;my+=p.y;}mx/=points.length;my/=points.length;
 let xx=0,yy=0,xy=0;for(const p of points){const x=p.x-mx,y=p.y-my;xx+=x*x;yy+=y*y;xy+=x*y;}
 const angle=Math.atan2(2*xy,xx-yy)/2,c=Math.cos(angle),s=Math.sin(angle);
 const axis=(p:Point)=>(p.x-mx)*c+(p.y-my)*s;
 let min=Infinity,max=-Infinity,low=Infinity,high=-Infinity;
 for(const p of points){const along=axis(p),across=-(p.x-mx)*s+(p.y-my)*c;min=Math.min(min,along);max=Math.max(max,along);low=Math.min(low,across);high=Math.max(high,across);}
 const extent=max-min;
 if(extent*zoom<28 || high-low>extent*.6)return null;
 const threshold=10/zoom;
 let direction=0,extreme=points[0];const turns=[points[0]];
 for(const p of points.slice(1)){
  const delta=axis(p)-axis(extreme);
  if(!direction){if(Math.abs(delta)>=threshold){direction=Math.sign(delta);extreme=p;}}
  else if(delta*direction>=0)extreme=p;
  else if(Math.abs(delta)>=threshold){turns.push(extreme);direction=-direction;extreme=p;}
 }
 turns.push(extreme);
 if(turns.length<6)return null;
 const length=turns.slice(1).reduce((sum,p,i)=>sum+Math.abs(axis(p)-axis(turns[i])),0);
 return length>=extent*3.5?turns:null;
}
export function scratchErase(strokes:Stroke[],points:Point[],zoom=1):Stroke[]|null{
 const passes=scratchPasses(points,zoom);if(!passes)return null;
 const result=strokes.filter(s=>{
  if(s.image)return true;
  let crossings=0;
  for(let i=1;i<passes.length;i++)if(hits(s,passes[i-1],passes[i],2/zoom))crossings++;
  return crossings<3;
 });
 return result.length<strokes.length?result:null;
}
