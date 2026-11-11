import { uid, hits, segmentDistance, type Point, type Stroke } from "./model";
import {StrokeIndex,strokeBounds,pointBounds,overlaps} from "./spatial";
export type EraserMode = "stroke" | "area";
export function erase(
  strokes: Stroke[],
  a: Point,
  b: Point,
  radius: number,
  mode: EraserMode,
  index?: StrokeIndex,
  onErase?: (stroke:Stroke)=>void,
): Stroke[] {
  let changed = false;
  const result: Stroke[] = [];
  const region=pointBounds([a,b],radius),candidates=index?.query(region);
  for (const stroke of strokes) {
    // Images are selected/deleted as objects, never split into pen fragments.
    if (stroke.image) {
      result.push(stroke);
      continue;
    }
    if ((candidates ? !candidates.has(stroke) : !overlaps(strokeBounds(stroke),region)) || !hits(stroke, a, b, radius)) {
      result.push(stroke);
      continue;
    }
    changed = true;
    onErase?.(stroke);index?.remove(stroke);
    if (mode === "stroke") continue;
    const limit = radius + stroke.width * 0.6;
    const pieces: Point[][] = [];
    let piece: Point[] = [];
    const keep = (p: Point) => {
      if (segmentDistance(p, a, b) > limit) {
        piece.push(p);
      } else if (piece.length) {
        pieces.push(piece);
        piece = [];
      }
    };
    if (stroke.points.length === 1) keep(stroke.points[0]);
    for (let i = 1; i < stroke.points.length; i++) {
      const from = stroke.points[i - 1],
        to = stroke.points[i];
      const count = Math.max(
        1,
        Math.ceil(
          Math.hypot(to.x - from.x, to.y - from.y) /
            Math.max(0.5, Math.min(2, radius / 4)),
        ),
      );
      for (let j = i === 1 ? 0 : 1; j <= count; j++) {
        const t = j / count;
        keep({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          p: from.p + (to.p - from.p) * t,
        });
      }
    }
    if (piece.length) pieces.push(piece);
    for (const points of pieces) {const fragment={ ...stroke, id: uid(), points };result.push(fragment);index?.add(fragment);}
  }
  return changed ? result : strokes;
}
export function inside(p: Point, polygon: Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}
export function selectLasso(strokes: Stroke[], polygon: Point[], index?:StrokeIndex) {
  if (polygon.length < 3) return new Set<string>();
  const region=pointBounds(polygon),candidates=index?.query(region);
  const edges=polygon.map((a,i)=>({a,b:polygon[(i+1)%polygon.length],bounds:pointBounds([a,polygon[(i+1)%polygon.length]])}));
  return new Set(
    (candidates?[...candidates]:strokes)
      .filter(
        (s) =>
          overlaps(strokeBounds(s),region) && (s.points.some((p) => inside(p, polygon)) ||
          (!!s.image && polygon.some((p) => inside(p, s.points))) ||
          edges.some(({a,b,bounds}) => overlaps(strokeBounds(s),bounds)&&hits(s,a,b,0))),
      )
      .map((s) => s.id),
  );
}
// Match the transformed image polygon, choosing the topmost pasted image.
export function imageAtPoint(strokes: Stroke[], p: Point) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.image && (inside(p, s.points) || hits(s, p, p, 0))) return s;
  }
}
export function moveSelection(
  strokes: Stroke[],
  ids: Set<string>,
  dx: number,
  dy: number,
) {
  return strokes.map((s) =>
    ids.has(s.id)
      ? {
          ...s,
          points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
        }
      : s,
  );
}
export function selectionBounds(strokes: Stroke[], ids: Set<string>) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const s of strokes)
    if (ids.has(s.id)) {
      const b=strokeBounds(s),inset=s.image?s.width/2:-s.width*.15;
      left=Math.min(left,b.left-inset);top=Math.min(top,b.top-inset);
      right=Math.max(right,b.right+inset);bottom=Math.max(bottom,b.bottom+inset);
    }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}
export function transformSelection(
  strokes: Stroke[],
  ids: Set<string>,
  {
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    cx,
    cy,
  }: {
    scaleX?: number;
    scaleY?: number;
    angle?: number;
    cx: number;
    cy: number;
  },
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return strokes.map((stroke) =>
    ids.has(stroke.id)
      ? {
          ...stroke,
          points: stroke.points.map((p) => {
            const x = (p.x - cx) * scaleX,
              y = (p.y - cy) * scaleY;
            return { ...p, x: cx + x * c - y * s, y: cy + x * s + y * c };
          }),
        }
      : stroke,
  );
}
export type SelectionBounds = {left: number; top: number; right: number; bottom: number};
export function selectionFrame(bounds:SelectionBounds|null,zoom:number):SelectionBounds|null{
  if(!bounds)return null;
  const padX=Math.max(0,(36/zoom-(bounds.right-bounds.left))/2);
  const padY=Math.max(0,(36/zoom-(bounds.bottom-bounds.top))/2);
  return {left:bounds.left-padX,right:bounds.right+padX,top:bounds.top-padY,bottom:bounds.bottom+padY};
}
export type SelectionHandle = {kind: "corner" | "x" | "y"; x: number; y: number; cx: number; cy: number};
export function selectionHandles(b: SelectionBounds): SelectionHandle[] {
  const mx = (b.left + b.right) / 2, my = (b.top + b.bottom) / 2;
  return [
    {kind: "corner", x:b.left,y:b.top,cx:b.right,cy:b.bottom},
    {kind: "corner", x:b.right,y:b.top,cx:b.left,cy:b.bottom},
    {kind: "corner", x:b.left,y:b.bottom,cx:b.right,cy:b.top},
    {kind: "corner", x:b.right,y:b.bottom,cx:b.left,cy:b.top},
    {kind: "x", x:b.left,y:my,cx:b.right,cy:my},
    {kind: "x", x:b.right,y:my,cx:b.left,cy:my},
    {kind: "y", x:mx,y:b.top,cx:mx,cy:b.bottom},
    {kind: "y", x:mx,y:b.bottom,cx:mx,cy:b.top},
  ];
}
export function selectionHit(b: SelectionBounds | null, p: Point, zoom: number) {
  if (!b) return null;
  const mx = (b.left + b.right) / 2, my = (b.top + b.bottom) / 2;
  if (Math.hypot(p.x-mx,p.y-(b.top-22/zoom)) < 12/zoom)
    return {kind:"rotate" as const,cx:mx,cy:my};
  const handles = selectionHandles(b);
  const corner = handles.slice(0,4).find(h=>Math.hypot(p.x-h.x,p.y-h.y)<12/zoom);
  if (corner) return corner;
  const edge = handles.slice(4).find(h=>h.kind==="x"
    ? Math.abs(p.x-h.x)<10/zoom && p.y>=b.top && p.y<=b.bottom
    : Math.abs(p.y-h.y)<10/zoom && p.x>=b.left && p.x<=b.right);
  if (edge) return edge;
  return p.x>=b.left && p.x<=b.right && p.y>=b.top && p.y<=b.bottom
    ? {kind:"move" as const} : null;
}
export function selectionScale(handle: SelectionHandle, dx: number, dy: number) {
  const x=handle.x-handle.cx,y=handle.y-handle.cy;
  const safe=(n:number)=>Math.max(0.05,Math.min(20,n));
  // Project the drag onto the original diagonal, keeping both axes identical.
  if(handle.kind==="corner") {
    const scale=safe(1+(dx*x+dy*y)/Math.max(1,x*x+y*y));
    return {scaleX:scale,scaleY:scale};
  }
  return {scaleX:handle.kind==="x"?safe(1+dx/(x||1)):1,
    scaleY:handle.kind==="y"?safe(1+dy/(y||1)):1};
}
export function renderScale(
  width: number,
  height: number,
  zoom: number,
  dpr: number,
) {
  return Math.min(
    Math.max(1, zoom * dpr * 1.5),
    8192 / Math.max(width, height),
    Math.sqrt(24_000_000 / (width * height)),
  );
}
export function shouldAddPage(
  last: boolean,
  atBottom: boolean,
  distance: number,
  cancelled: boolean,
  multiTouch: boolean,
) {
  return last && atBottom && distance >= 90 && !cancelled && !multiTouch;
}
