import { uid, hits, segmentDistance, type Point, type Stroke } from "./model";
export type EraserMode = "stroke" | "area";
export function erase(
  strokes: Stroke[],
  a: Point,
  b: Point,
  radius: number,
  mode: EraserMode,
): Stroke[] {
  let changed = false;
  const result: Stroke[] = [];
  for (const stroke of strokes) {
    // Images are selected/deleted as objects, never split into pen fragments.
    if (stroke.image) {
      result.push(stroke);
      continue;
    }
    if (!hits(stroke, a, b, radius)) {
      result.push(stroke);
      continue;
    }
    changed = true;
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
    for (const points of pieces) result.push({ ...stroke, id: uid(), points });
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
export function selectLasso(strokes: Stroke[], polygon: Point[]) {
  if (polygon.length < 3) return new Set<string>();
  return new Set(
    strokes
      .filter(
        (s) =>
          s.points.some((p) => inside(p, polygon)) ||
          (!!s.image && polygon.some((p) => inside(p, s.points))) ||
          polygon.some((a, i) =>
            hits(s, a, polygon[(i + 1) % polygon.length], 0),
          ),
      )
      .map((s) => s.id),
  );
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
    if (ids.has(s.id))
      for (const p of s.points) {
        left = Math.min(left, p.x - s.width / 2);
        top = Math.min(top, p.y - s.width / 2);
        right = Math.max(right, p.x + s.width / 2);
        bottom = Math.max(bottom, p.y + s.width / 2);
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
    s = Math.sin(angle),
    weight = Math.sqrt(Math.abs(scaleX * scaleY));
  return strokes.map((stroke) =>
    ids.has(stroke.id)
      ? {
          ...stroke,
          width: Math.max(0.05, Math.min(100, stroke.width * weight)),
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
