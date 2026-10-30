import type { Page, Stroke } from "./model";
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (!s.points.length) return;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.tool === "marker" ? 0.27 : 1;
  // A stroke is composited once so a translucent highlighter does not darken at each sample.
  if (s.tool === "marker") {
    ctx.lineWidth = s.width;
    ctx.beginPath();
    s.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    if (s.points.length === 1) {
      const p = s.points[0];
      ctx.lineTo(p.x + 0.01, p.y);
    }
    ctx.stroke();
  } else {
    for (let i = 0; i < s.points.length; i++) {
      const a = s.points[Math.max(0, i - 1)],
        b = s.points[i];
      ctx.lineWidth = s.width * (0.25 + ((a.p + b.p) / 2) * 0.95);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x + 0.001, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
export function drawPaper(ctx: CanvasRenderingContext2D, p: Page) {
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, p.width, p.height);
  if (p.paper === "blank") return;
  ctx.strokeStyle = p.paper === "grid" ? "#e6e9e5" : "#dce5e9";
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
