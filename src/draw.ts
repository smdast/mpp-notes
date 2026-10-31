import type { Page, Stroke } from "./model";
import { isDarkColor, LIGHT_PAPER } from "./paper";
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
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (!s.points.length) return;
  const points = s.shape ? s.points : smoothPoints(s.points);
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.tool === "marker" ? 0.27 : 1;
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
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  p: Page,
  background?: string,
) {
  const color = background || p.paperColor || LIGHT_PAPER;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, p.width, p.height);
  if (p.paper === "blank") return;
  ctx.strokeStyle = isDarkColor(color)
    ? p.paper === "grid"
      ? "#3a4940"
      : "#45574b"
    : p.paper === "grid"
      ? "#e6e9e5"
      : "#dce5e9";
  ctx.lineWidth = 0.65;
  const gap = 26;
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
