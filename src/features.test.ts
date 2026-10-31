import { it, expect } from "vitest";
import { normalizeFolders, relocateFolder } from "./folders";
import {
  defaultPreferences,
  readPreferences,
  pressureValue,
} from "./preferences";
import { correctShape } from "./shapes";
import { newNote, type Stroke, type Point } from "./model";
const p = (x: number, y: number): Point => ({ x, y, p: 0.7 });
const s = (points: Point[]): Stroke => ({
  id: "shape",
  tool: "pen",
  color: "#243d35",
  width: 2.5,
  points,
});
it("normalizes nested folders and renames an entire subtree without affecting siblings", () => {
  const folders = normalizeFolders(["学校/理科/物理", "学校/理科2", "仕事"]);
  expect(folders).toContain("学校/理科");
  const a = { ...newNote("A"), folder: "学校/理科/物理" },
    b = { ...newNote("B"), folder: "学校/理科2" };
  const moved = relocateFolder(folders, [a, b], "学校/理科", "仕事/研究");
  expect(moved.folders).toContain("仕事/研究/物理");
  expect(moved.notes[0].folder).toBe("仕事/研究/物理");
  expect(moved.notes[1]).toBe(b);
  expect(() =>
    relocateFolder(folders, [a], "学校", "学校/理科/学校"),
  ).toThrow();
});
it("folder deletion retains all notes in the surviving parent", () => {
  const n = { ...newNote(), folder: "A/B/C" };
  const result = relocateFolder(["A", "A/B", "A/B/C"], [n], "A/B");
  expect(result.folders).toEqual(["A"]);
  expect(result.notes[0].folder).toBe("A");
  expect(result.notes[0].pages).toBe(n.pages);
});
it("pen preferences are independent, validated and pressure off yields a constant width", () => {
  const prefs = defaultPreferences();
  prefs.pens.pen2.color = "#ff0000";
  prefs.pens.pen2.width = 6;
  prefs.pens.pen2.pressure = false;
  const restored = readPreferences(prefs);
  expect(restored.pens.pen1.width).toBe(2.5);
  expect(restored.pens.pen2.width).toBe(6);
  expect(restored.pens.pen2.color).toBe("#ff0000");
  expect(pressureValue(0.1, false)).toBe(pressureValue(1, false));
  expect(pressureValue(0.1, true)).not.toBe(pressureValue(1, true));
  expect(
    readPreferences({ pens: { pen1: { color: "bad" } } }).pens.pen1.color,
  ).toBe("#243d35");
});
it("recognizes a nearly straight stroke without changing curved writing", () => {
  expect(
    correctShape(s([p(0, 0), p(30, 1), p(60, -0.5), p(100, 0)])).shape,
  ).toBe("line");
  const writing = s([p(0, 0), p(20, 50), p(40, 10), p(70, 45), p(100, 0)]);
  expect(correctShape(writing)).toBe(writing);
});
it("recognizes a closed circle and ellipse", () => {
  for (const ry of [50, 80]) {
    const points = Array.from({ length: 65 }, (_, i) =>
      p(
        100 + 50 * Math.cos((i * Math.PI * 2) / 64),
        100 + ry * Math.sin((i * Math.PI * 2) / 64),
      ),
    );
    const result = correctShape(s(points));
    expect(result.shape).toBe("ellipse");
    expect(result.points).toHaveLength(129);
    expect(result.points[0].x).toBeCloseTo(result.points.at(-1)!.x);
  }
});
it("recognizes axis aligned and rotated rectangles but does not square a circle", () => {
  const points: Point[] = [];
  const corners = [p(0, 0), p(160, 0), p(160, 80), p(0, 80), p(0, 0)];
  for (let i = 1; i < corners.length; i++)
    for (let j = 0; j < 20; j++)
      points.push(
        p(
          corners[i - 1].x + ((corners[i].x - corners[i - 1].x) * j) / 20,
          corners[i - 1].y + ((corners[i].y - corners[i - 1].y) * j) / 20,
        ),
      );
  points.push(p(0, 0));
  for (const angle of [0, Math.PI / 6]) {
    const result = correctShape(
      s(
        points.map((pt) =>
          p(
            pt.x * Math.cos(angle) - pt.y * Math.sin(angle),
            pt.x * Math.sin(angle) + pt.y * Math.cos(angle),
          ),
        ),
      ),
    );
    expect(result.shape).toBe("rectangle");
    expect(result.points).toHaveLength(5);
  }
});
import { zoomScrollTop } from "./scrolling";
it("keeps the same location within a page when zooming across fixed page gaps", () => {
  const pages = [{ height: 1000 }, { height: 600 }, { height: 800 }];
  const oldPage2Top = 16 + 24 + 1000 + 34;
  const top = oldPage2Top + 24 + 200 - 150;
  const next = zoomScrollTop(pages, 1, 2, top, 150);
  const newPage2Top = 16 + 24 + 2000 + 34;
  expect(next).toBe(newPage2Top + 24 + 400 - 150);
});
