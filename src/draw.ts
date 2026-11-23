import {smoothPoints,wavyStrokePoints} from "./strokePath";
export {smoothPoints} from "./strokePath";
import type { Page, Stroke } from "./model";
import { isDarkColor, isDarkPaperPixel, LIGHT_PAPER } from "./paper";
import { inkImage } from "./images";
import type { AutoPenColor } from "./preferences";
import { strokeBounds } from "./spatial";
export const PAPER_SPACING = 40;
export function dashSegments(points: Stroke["points"], dash: number, gap: number): Stroke["points"][] {
  if (!points.length) return [];
  const segments: Stroke["points"][] = [];
  let drawing = true, remaining = Math.max(1, dash), piece = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    let along = 0;
    while (along < distance) {
      const step = Math.min(remaining, distance - along);
      along += step;
      remaining -= step;
      const t = along / distance;
      const p = {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, p:a.p+(b.p-a.p)*t};
      if (drawing) piece.push(p);
      if (remaining < 1e-8) {
        if (drawing) segments.push(piece);
        drawing = !drawing;
        piece = drawing ? [p] : [];
        remaining = Math.max(1, drawing ? dash : gap);
      }
    }
  }
  if (drawing && piece.length) segments.push(piece);
  return segments;
}
// Arc-length sampling keeps dots equally spaced, regardless of input speed.
export function dotPoints(points: Stroke["points"], spacing: number): Stroke["points"] {
  if (!points.length) return [];
  const dots = [points[0]];
  let remaining = Math.max(1, spacing);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    let along = remaining;
    while (along <= distance) {
      const t = along / distance;
      dots.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t});
      along += Math.max(1, spacing);
    }
    remaining = along - distance;
  }
  return dots;
}
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, presmoothed = false) {
  if (s.image) {
    const image = inkImage(s.image);
    if (!image || s.points.length !== 4) return;
    const [a, b, , d] = s.points;
    ctx.save();
    ctx.transform(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y, a.x, a.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.restore();
    return;
  }
  if (!s.points.length) return;
  if(s.wavy){
    drawStroke(ctx,{...s,wavy:false,dashed:false,dotted:false,shape:undefined,points:wavyStrokePoints(s)},true);
    return;
  }
  const points = presmoothed || s.shape ? s.points : smoothPoints(s.points);
  if (s.dashed) {
    for (const piece of dashSegments(points, Math.max(4, s.width * 4), Math.max(3, s.width * 3)))
      drawStroke(ctx, {...s, shape: undefined, dashed: false, dotted: false, points: piece}, true);
    return;
  }
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.opacity ?? (s.tool === "marker" ? 0.27 : 1);
  if (s.dotted) {
    ctx.beginPath();
    for (const p of dotPoints(points, Math.max(4, s.width * 3))) {
      const diameter = s.pressure === false ? s.width : s.width * (0.25 + p.p * .95);
      ctx.moveTo(p.x + diameter / 2, p.y);
      ctx.arc(p.x, p.y, diameter / 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    return;
  }
  if (s.shape || (s.tool === "marker" && !s.pressure)) {
    ctx.lineWidth =
      s.shape && s.tool === "pen"
        ? s.width * (0.25 + points[0].p * 0.95)
        : s.width;
    if (s.shape === "rectangle") ctx.lineJoin = "miter";
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (points.length === 1) {
      const p = points[0];
      ctx.lineTo(p.x + 0.01, p.y);
    }
    if (
      s.shape &&
      points.length > 2 &&
      Math.hypot(
        points[0].x - points.at(-1)!.x,
        points[0].y - points.at(-1)!.y,
      ) < 0.001
    )
      ctx.closePath();
    ctx.stroke();
  } else {
    const left: { x: number; y: number }[] = [],
      right: { x: number; y: number }[] = [];
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)],
        b = points[Math.min(points.length - 1, i + 1)],
        dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1,
        r = (s.width * (0.25 + p.p * 0.95)) / 2;
      left.push({ x: p.x - (dy / len) * r, y: p.y + (dx / len) * r });
      right.push({ x: p.x + (dy / len) * r, y: p.y - (dx / len) * r });
    });
    ctx.beginPath();
    const outline = [...left, ...right.reverse()];
    let area = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) outline.reverse();
    outline.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    for (const p of [points[0], points[points.length - 1]]) {
      ctx.moveTo(p.x + (s.width * (0.25 + p.p * 0.95)) / 2, p.y);
      ctx.arc(p.x, p.y, (s.width * (0.25 + p.p * 0.95)) / 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}
let backgroundSample: CanvasRenderingContext2D | null = null;
export const AUTO_COLOR_RADIUS=12;
const BACKGROUND_SAMPLE_SIZE=25;
export function strokeStartColor(
  colors: AutoPenColor,
  paper: HTMLCanvasElement | null,
  point: { x: number; y: number },
  page: Pick<Page, "width" | "height">,
  paperColor: string,
  images: Stroke[] = [],
) {
  if(!paper?.width||!paper.height||!paper.getContext("2d"))
    return isDarkColor(paperColor)?colors.onDark:colors.onLight;
  const x=Math.max(0,Math.min(page.width,point.x)),y=Math.max(0,Math.min(page.height,point.y));
  const left=Math.max(0,x-AUTO_COLOR_RADIUS),top=Math.max(0,y-AUTO_COLOR_RADIUS);
  const right=Math.min(page.width,x+AUTO_COLOR_RADIUS),bottom=Math.min(page.height,y+AUTO_COLOR_RADIUS);
  if(right<=left||bottom<=top)return isDarkColor(paperColor)?colors.onDark:colors.onLight;
  if(!backgroundSample){
    const canvas=paper.ownerDocument.createElement("canvas");
    canvas.width=canvas.height=BACKGROUND_SAMPLE_SIZE;
    backgroundSample=canvas.getContext("2d",{willReadFrequently:true});
  }
  if(!backgroundSample)return isDarkColor(paperColor)?colors.onDark:colors.onLight;
  const sample=backgroundSample,size=BACKGROUND_SAMPLE_SIZE;
  const scaleX=size/(right-left),scaleY=size/(bottom-top);
  sample.resetTransform();sample.clearRect(0,0,size,size);
  // Nearest-neighbour samples count the light/dark areas rather than averaging
  // their RGB values. The fixed-size readback keeps pen-down work bounded.
  sample.imageSmoothingEnabled=false;
  sample.drawImage(paper,left*paper.width/page.width,top*paper.height/page.height,
    (right-left)*paper.width/page.width,(bottom-top)*paper.height/page.height,0,0,size,size);
  sample.setTransform(scaleX,0,0,scaleY,-left*scaleX,-top*scaleY);
  for(const image of images){
    const bounds=strokeBounds(image);
    if(bounds.left<right&&bounds.right>left&&bounds.top<bottom&&bounds.bottom>top)drawStroke(sample,image);
  }
  // Use only paper/PDF and inserted images: existing ink must not decide the
  // next stroke's colour. Transparent pixels reveal their composited background.
  const pixels=sample.getImageData(0,0,size,size).data;
  let dark=0,light=0;
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const px=left+(col+.5)/scaleX,py=top+(row+.5)/scaleY;
    if(Math.hypot(px-x,py-y)>AUTO_COLOR_RADIUS)continue;
    if(isDarkPaperPixel(pixels.subarray((row*size+col)*4,(row*size+col)*4+4),paperColor))dark++;else light++;
  }
  const col=Math.min(size-1,Math.max(0,Math.floor((x-left)*scaleX)));
  const row=Math.min(size-1,Math.max(0,Math.floor((y-top)*scaleY))),offset=(row*size+col)*4;
  const useDark=dark===light?isDarkPaperPixel(pixels.subarray(offset,offset+4),paperColor):dark>light;
  return useDark?colors.onDark:colors.onLight;
}

export function drawPaper(
  ctx: CanvasRenderingContext2D,
  p: Page,
  background?: string,
) {
  const color = background || p.paperColor || LIGHT_PAPER;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, p.width, p.height);
  if (p.backgroundImage) {
    const image=inkImage(p.backgroundImage);
    if (image) {const scale=Math.min(p.width/image.width,p.height/image.height);ctx.drawImage(image,(p.width-image.width*scale)/2,(p.height-image.height*scale)/2,image.width*scale,image.height*scale);}
  }
  if (p.paper === "blank") return;
  ctx.strokeStyle = isDarkColor(color)
    ? p.paper === "grid"
      ? "#3a4940"
      : "#45574b"
    : p.paper === "grid"
      ? "#e6e9e5"
      : "#dce5e9";
  ctx.lineWidth = 0.65;
  const gap = PAPER_SPACING;
  ctx.beginPath();
  for (let y = gap; y < p.height; y += gap) {
    ctx.moveTo(0, y);
    ctx.lineTo(p.width, y);
  }
  if (p.paper === "grid")
    for (let x = gap; x < p.width; x += gap) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, p.height);
    }
  ctx.stroke();
}
