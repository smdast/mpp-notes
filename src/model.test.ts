import { describe, it, expect } from "vitest";
import { pagePoint, record, travel, hits, newNote, type Stroke } from "./model";
const line: Stroke = {
  id: "s",
  tool: "pen",
  color: "#243d35",
  width: 2,
  points: [
    { x: 10, y: 10, p: 0.5 },
    { x: 110, y: 10, p: 1 },
  ],
};
describe("drawing geometry", () => {
  it("keeps page coordinates independent from zoom", () => {
    expect(
      pagePoint(
        120,
        220,
        { left: 20, top: 20, width: 400, height: 600 },
        { width: 800, height: 1200 },
        0.7,
      ),
    ).toEqual({ x: 200, y: 400, p: 0.7 });
  });
  it("erases intersecting segments even between input samples", () => {
    expect(
      hits(line, { x: 60, y: 0, p: 0.5 }, { x: 60, y: 20, p: 0.5 }, 2),
    ).toBe(true);
    expect(
      hits(line, { x: 60, y: 80, p: 0.5 }, { x: 60, y: 100, p: 0.5 }, 2),
    ).toBe(false);
  });
});
describe("undo and redo", () => {
  it("restores a stroke and clears redo after a new edit", () => {
    const h = record({ past: [], future: [] }, []);
    const back = travel(h, [line]);
    expect(back.strokes).toEqual([]);
    const forward = travel(back.history, back.strokes, true);
    expect(forward.strokes).toEqual([line]);
    expect(record(back.history, []).future).toEqual([]);
  });
});
