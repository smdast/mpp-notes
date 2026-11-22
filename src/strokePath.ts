import type {Stroke} from "./model";

// Rounded quadratic centerline, rendered as a continuous pressure-sensitive outline.
export function smoothPoints(points: Stroke["points"]): Stroke["points"] {
  if (points.length < 3) return points;
  const out: Stroke["points"] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    const a =
      i === 0
        ? p
        : {
            x: (prev.x + p.x) / 2,
            y: (prev.y + p.y) / 2,
            p: (prev.p + p.p) / 2,
          };
    const b =
      i === points.length - 1
        ? p
        : {
            x: (p.x + next.x) / 2,
            y: (p.y + next.y) / 2,
            p: (p.p + next.p) / 2,
          };
    const count = Math.max(
      1,
      Math.ceil(
        (Math.hypot(a.x - p.x, a.y - p.y) + Math.hypot(b.x - p.x, b.y - p.y)) /
          2,
      ),
    );
    for (let j = i === 0 ? 0 : 1; j <= count; j++) {
      const t = j / count,
        u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * p.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * p.y + t * t * b.y,
        p: u * u * a.p + 2 * u * t * p.p + t * t * b.p,
      });
    }
  }
  return out;
}

// Sample by distance, rather than input-event count, so fast and slow writing
// have the same wavelength. The initial point and phase remain stable while drawing.
export function wavePoints(points:Stroke["points"],width:number):Stroke["points"]{
  if(points.length<2)return points;
  const wavelength=Math.max(16,width*8),amplitude=Math.max(2,width*1.25);
  const step=Math.min(2,wavelength/16),samples=[{...points[0],distance:0}];
  let distance=0,next=step;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length===0)continue;
    while(next<=distance+length){
      const t=(next-distance)/length;
      samples.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,p:a.p+(b.p-a.p)*t,distance:next});
      next+=step;
    }
    distance+=length;
  }
  if(distance>samples[samples.length-1].distance+1e-8)samples.push({...points[points.length-1],distance});
  return samples.map((p,i)=>{
    const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    const offset=Math.sin(p.distance/wavelength*Math.PI*2)*amplitude;
    return {x:p.x-dy/length*offset,y:p.y+dx/length*offset,p:p.p};
  });
}
export function wavyStrokePoints(stroke:Stroke){
  return wavePoints(stroke.shape?stroke.points:smoothPoints(stroke.points),stroke.width);
}
