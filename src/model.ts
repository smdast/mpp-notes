export type Point = { x: number; y: number; p: number };
export type Stroke = {
  dashed?: boolean;
  dotted?: boolean;
  // Image corners are top-left, top-right, bottom-right, bottom-left.
  image?: string;
  shape?: "line" | "rectangle" | "ellipse";
  pressure?: boolean;
  id: string;
  tool: "pen" | "marker";
  color: string;
  width: number;
  points: Point[];
};
export type Paper = "blank" | "ruled" | "grid";
export type Page = {
  paperColor?: string;
  id: string;
  width: number;
  height: number;
  paper: Paper;
  strokes: Stroke[];
  pdfIndex?: number;
};
export type Note = {
  folder?: string;
  id: string;
  title: string;
  updated: number;
  pages: Page[];
  pdf?: Uint8Array;
};
export const uid = () => crypto.randomUUID();
export const newPage = (): Page => ({
  id: uid(),
  width: 794,
  height: 1123,
  paper: "grid",
  strokes: [],
});
export const newNote = (title = "無題のノート"): Note => ({
  id: uid(),
  title,
  updated: Date.now(),
  pages: [newPage()],
});
export function pagePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  page: Pick<Page, "width" | "height">,
  pressure: number,
): Point {
  return {
    x: ((clientX - rect.left) * page.width) / rect.width,
    y: ((clientY - rect.top) * page.height) / rect.height,
    p: Math.max(0.05, Math.min(1, pressure)),
  };
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hits(stroke: Stroke, a: Point, b: Point, radius: number) {
  const r = radius + stroke.width / 2;
  return stroke.points.some(
    (p, i) =>
      segmentDistance(p, a, b) <= r ||
      (i > 0 &&
        (segmentDistance(a, stroke.points[i - 1], p) <= r ||
          segmentDistance(b, stroke.points[i - 1], p) <= r ||
          intersects(a, b, stroke.points[i - 1], p))),
  );
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
export type History = { past: Stroke[][]; future: Stroke[][] };
export function record(h: History, prev: Stroke[]): History {
  return { past: [...h.past.slice(-49), prev], future: [] };
}
export function travel(
  h: History,
  current: Stroke[],
  redo = false,
): { history: History; strokes: Stroke[] } {
  const source = redo ? h.future : h.past;
  if (!source.length) return { history: h, strokes: current };
  const next = source[source.length - 1];
  return {
    strokes: next,
    history: redo
      ? { past: [...h.past, current], future: h.future.slice(0, -1) }
      : { past: h.past.slice(0, -1), future: [...h.future, current] },
  };
}
