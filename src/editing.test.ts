import { it, expect } from "vitest";
import {
  erase,
  selectLasso,
  moveSelection,
  renderScale,
  shouldAddPage,
} from "./editing";
import { smoothPoints } from "./draw";
import type { Stroke, Point } from "./model";
const p = (x: number, y: number): Point => ({ x, y, p: 0.7 });
const s: Stroke = {
  id: "a",
  tool: "pen",
  color: "#243d35",
  width: 2,
  points: [p(0, 50), p(100, 50)],
};
it("area eraser splits a sparse stroke while preserving both sides", () => {
  const result = erase([s], p(50, 40), p(50, 60), 10, "area");
  expect(result).toHaveLength(2);
  expect(result[0].points[0].x).toBe(0);
  expect(result[0].points.at(-1)!.x).toBeLessThan(40);
  expect(result[1].points[0].x).toBeGreaterThan(60);
  expect(result[1].points.at(-1)!.x).toBe(100);
  expect(s.points).toHaveLength(2);
});
it("stroke eraser removes a whole line; untouched lines retain identity", () => {
  expect(erase([s], p(50, 40), p(50, 60), 10, "stroke")).toEqual([]);
  const a = [s];
  expect(erase(a, p(200, 100), p(200, 120), 10, "area")).toBe(a);
});
it("lasso selects intersecting sparse lines and moves only the selection", () => {
  const other = { ...s, id: "b", points: [p(0, 150), p(100, 150)] };
  const selection = selectLasso(
    [s, other],
    [p(40, 40), p(60, 40), p(60, 60), p(40, 60)],
  );
  expect([...selection]).toEqual(["a"]);
  const moved = moveSelection([s, other], selection, 20, -10);
  expect(moved[0].points[0]).toEqual(p(20, 40));
  expect(moved[1]).toBe(other);
  expect(s.points[0]).toEqual(p(0, 50));
});
it("scales the backing surface with zoom and caps memory usage", () => {
  expect(renderScale(794, 1123, 2, 2)).toBeGreaterThan(
    renderScale(794, 1123, 1, 2),
  );
  const scale = renderScale(20000, 20000, 2.5, 3);
  expect(20000 * 20000 * scale * scale).toBeLessThanOrEqual(24_000_001);
});
it("preserves endpoints and bounds when smoothing", () => {
  const points = [p(0, 0), p(20, 50), p(40, 0)];
  const smooth = smoothPoints(points);
  expect(smooth[0]).toEqual(points[0]);
  expect(smooth.at(-1)).toEqual(points.at(-1));
  expect(
    smooth.every((p) => p.y >= 0 && p.y <= 50 && p.p >= 0 && p.p <= 1),
  ).toBe(true);
});
it("adds a page only after a deliberate one-finger release at the last bottom", () => {
  expect(shouldAddPage(true, true, 95, false, false)).toBe(true);
  expect(shouldAddPage(false, true, 95, false, false)).toBe(false);
  expect(shouldAddPage(true, false, 95, false, false)).toBe(false);
  expect(shouldAddPage(true, true, 80, false, false)).toBe(false);
  expect(shouldAddPage(true, true, 95, true, false)).toBe(false);
  expect(shouldAddPage(true, true, 95, false, true)).toBe(false);
});
