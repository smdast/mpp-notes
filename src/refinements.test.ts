import { it, expect } from "vitest";
import { displayPath } from "./Breadcrumb";
import { pagePaperColor, penColor, isDarkColor } from "./paper";
import { defaultPreferences, readPreferences } from "./preferences";
import { newPage, type Stroke } from "./model";
import { transformSelection } from "./editing";
import { smoothStep, inertiaStep } from "./motion";
it("uses a single breadcrumb separator", () => {
  expect(displayPath("階層1/階層2/階層3")).toBe("階層1 > 階層2 > 階層3");
});
it("defaults empty paper and pens to readable colors while preserving existing ink and custom choices", () => {
  const page = newPage(),
    pref = defaultPreferences();
  expect(isDarkColor(pagePaperColor(page, true))).toBe(true);
  expect(isDarkColor(penColor(pref.pens.pen1, "pen1", true))).toBe(false);
  expect(pagePaperColor({ ...page, strokes: [{} as Stroke] }, true)).toBe(
    "#fffefa",
  );
  expect(pagePaperColor({ ...page, paperColor: "#ffeedd" }, true)).toBe(
    "#ffeedd",
  );
  const custom = readPreferences({
    pens: { pen1: { color: "#abcdef", width: 4, pressure: true } },
  });
  expect(penColor(custom.pens.pen1, "pen1", true)).toBe("#abcdef");
});
it("scales and rotates only selected strokes without losing pressure and color", () => {
  const a: Stroke = {
      id: "a",
      color: "#abcdef",
      tool: "pen",
      width: 2,
      pressure: true,
      points: [
        { x: 10, y: 0, p: 0.2 },
        { x: 20, y: 0, p: 0.8 },
      ],
    },
    b = { ...a, id: "b" };
  const result = transformSelection([a, b], new Set(["a"]), {
    cx: 0,
    cy: 0,
    scaleX: 2,
    scaleY: 1,
    angle: Math.PI / 2,
  });
  expect(result[0].points[0].x).toBeCloseTo(0);
  expect(result[0].points[0].y).toBeCloseTo(20);
  expect(result[0].points[0].p).toBe(0.2);
  expect(result[0].color).toBe(a.color);
  expect(result[1]).toBe(b);
  expect(a.points[0].x).toBe(10);
});
it("eases toward the target without overshoot and gradually slows momentum", () => {
  let x = 0;
  for (let i = 0; i < 30; i++) x = smoothStep(x, 300, 16);
  expect(x).toBeGreaterThan(295);
  expect(x).toBeLessThan(300);
  const first = inertiaStep(2, 16),
    second = inertiaStep(first.velocity, 16);
  expect(second.velocity).toBeLessThan(first.velocity);
  expect(second.delta).toBeLessThan(first.delta);
});
