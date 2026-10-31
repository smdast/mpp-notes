import { segmentDistance, type Stroke, type Point } from "./model";
const length = (points: Point[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
export function correctShape(stroke: Stroke): Stroke {
  const raw = stroke.points;
  const points =
    raw.length > 512
      ? Array.from(
          { length: 512 },
          (_, i) => raw[Math.round((i * (raw.length - 1)) / 511)],
        )
      : raw;
  if (points.length < 3) return stroke;
  const first = points[0],
    last = points.at(-1)!,
    total = length(points);
  if (total < 35) return stroke;
  const span = Math.hypot(last.x - first.x, last.y - first.y),
    pressure = points.reduce((s, p) => s + p.p, 0) / points.length;
  if (
    span / total > 0.985 &&
    points.every(
      (p) => segmentDistance(p, first, last) < Math.max(2, span * 0.018),
    )
  )
    return {
      ...stroke,
      shape: "line",
      points: [
        { ...first, p: pressure },
        { ...last, p: pressure },
      ],
    };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    left = Math.min(...xs),
    top = Math.min(...ys),
    w = Math.max(...xs) - left,
    h = Math.max(...ys) - top;
  if (Math.min(w, h) < 24 || span > Math.min(w, h) * 0.23) return stroke;
  // Fit a rotated bounding rectangle; corner and edge checks avoid turning circles into boxes.
  let fit:
    | {
        area: number;
        angle: number;
        x: number;
        y: number;
        w: number;
        h: number;
        points: Point[];
      }
    | undefined;
  for (let deg = 0; deg < 180; deg += 3) {
    const a = (deg * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a),
      q = points.map((p) => ({
        x: p.x * c + p.y * s,
        y: -p.x * s + p.y * c,
        p: pressure,
      }));
    const x = Math.min(...q.map((p) => p.x)),
      y = Math.min(...q.map((p) => p.y)),
      rw = Math.max(...q.map((p) => p.x)) - x,
      rh = Math.max(...q.map((p) => p.y)) - y;
    if (!fit || rw * rh < fit.area)
      fit = { area: rw * rh, angle: a, x, y, w: rw, h: rh, points: q };
  }
  if (fit) {
    const f = fit,
      min = Math.min(f.w, f.h),
      corners = [
        { x: f.x, y: f.y, p: pressure },
        { x: f.x + f.w, y: f.y, p: pressure },
        { x: f.x + f.w, y: f.y + f.h, p: pressure },
        { x: f.x, y: f.y + f.h, p: pressure },
      ];
    const errors = f.points.map((p) =>
      Math.min(
        Math.abs(p.x - f.x),
        Math.abs(p.x - f.x - f.w),
        Math.abs(p.y - f.y),
        Math.abs(p.y - f.y - f.h),
      ),
    );
    if (
      min >= 24 &&
      total / (2 * (f.w + f.h)) > 0.83 &&
      total / (2 * (f.w + f.h)) < 1.2 &&
      errors.reduce((a, b) => a + b, 0) / errors.length < min * 0.035 &&
      Math.max(...errors) < min * 0.12 &&
      corners.every((c) =>
        f.points.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < min * 0.13),
      )
    ) {
      const c = Math.cos(f.angle),
        s = Math.sin(f.angle);
      const clean = corners.map((p) => ({
        x: p.x * c - p.y * s,
        y: p.x * s + p.y * c,
        p: pressure,
      }));
      return { ...stroke, shape: "rectangle", points: [...clean, clean[0]] };
    }
  }
  const cx = left + w / 2,
    cy = top + h / 2;
  const radial = points.map((p) =>
    Math.abs(Math.hypot((p.x - cx) / (w / 2), (p.y - cy) / (h / 2)) - 1),
  );
  const circumference =
    Math.PI *
    (3 * (w / 2 + h / 2) -
      Math.sqrt(((3 * w) / 2 + h / 2) * (w / 2 + (3 * h) / 2)));
  let sweep = 0,
    backtrack = 0;
  for (let i = 1; i < points.length; i++) {
    let d =
      Math.atan2((points[i].y - cy) / h, (points[i].x - cx) / w) -
      Math.atan2((points[i - 1].y - cy) / h, (points[i - 1].x - cx) / w);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
    backtrack += Math.abs(d);
  }
  if (
    radial.reduce((a, b) => a + b, 0) / radial.length < 0.09 &&
    Math.max(...radial) < 0.25 &&
    total / circumference > 0.83 &&
    total / circumference < 1.2 &&
    Math.abs(sweep) > 5.5 &&
    backtrack < 7.3
  ) {
    const circular = Math.abs(w - h) / Math.max(w, h) < 0.12,
      rx = circular ? (w + h) / 4 : w / 2,
      ry = circular ? rx : h / 2;
    return {
      ...stroke,
      shape: "ellipse",
      points: Array.from({ length: 129 }, (_, i) => ({
        x: cx + rx * Math.cos((i / 128) * Math.PI * 2),
        y: cy + ry * Math.sin((i / 128) * Math.PI * 2),
        p: pressure,
      })),
    };
  }
  return stroke;
}
