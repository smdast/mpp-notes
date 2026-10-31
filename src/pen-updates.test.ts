import { it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { correctShape } from "./shapes";
import { dotPoints, drawPaper, drawStroke, PAPER_SPACING } from "./draw";
import { newNote, newPage, type Point, type Stroke } from "./model";
import { defaultPreferences, readPreferences } from "./preferences";
import { makeBackup, readBackupBundle } from "./backup";
import { cloneStrokes, decodeStrokes, encodeStrokes } from "./clipboard";
import { clampZoom } from "./scrolling";
const p = (x:number,y:number): Point => ({x,y,p:.5});
const stroke = (points:Point[]): Stroke => ({id:"rough",tool:"pen",color:"#000000",width:3,points});
it("straightens wobbling lines and snaps near horizontal/vertical without snapping intentional diagonals", () => {
  const horizontal = correctShape(stroke([p(0,0),p(20,7),p(45,0),p(70,9),p(100,8)]));
  expect(horizontal.shape).toBe("line");
  expect(horizontal.points[0].y).toBeCloseTo(horizontal.points[1].y);
  const vertical = correctShape(stroke([p(30,0),p(26,40),p(40,80),p(39,140)]));
  expect(vertical.shape).toBe("line");
  expect(vertical.points[0].x).toBeCloseTo(vertical.points[1].x);
  const diagonal = correctShape(stroke([p(0,0),p(40,20),p(100,50)]));
  expect(diagonal.points[1].y-diagonal.points[0].y).toBeCloseTo(50);
  const writing = stroke([p(0,0),p(30,40),p(55,-35),p(80,35),p(100,0)]);
  expect(correctShape(writing)).toBe(writing);
});
it("aligns near parallel and perpendicular lines with nearby corrected lines", () => {
  const guide = {...stroke([p(0,0),p(100,50)]),shape:"line" as const};
  for (const end of [p(100,55),p(-55,100)]) {
    const result = correctShape(stroke([p(0,0),p(end.x/2,end.y/2),end]),[guide]);
    const [a,b] = result.points, dx=b.x-a.x, dy=b.y-a.y;
    if (end.x>0) expect(dy/dx).toBeCloseTo(.5);
    else expect(dy/dx).toBeCloseTo(-2);
  }
});
it("recognizes uneven boxes and imperfectly closed circles while preserving an open curve", () => {
  const box = [p(0,0),p(40,-4),p(80,5),p(125,1),p(120,30),p(127,60),p(120,90),p(80,84),p(40,94),p(2,88),p(-4,50),p(5,20),p(8,5)];
  expect(correctShape(stroke(box)).shape).toBe("rectangle");
  const circle = Array.from({length:65},(_,i) => {
    const angle = i/64*Math.PI*1.94, r=60+5*Math.sin(i*1.3)+3*Math.cos(i*.5);
    return p(100+r*Math.cos(angle),100+r*Math.sin(angle));
  });
  expect(correctShape(stroke(circle)).shape).toBe("ellipse");
  const open = stroke(Array.from({length:33},(_,i) => p(100+60*Math.cos(i/32*Math.PI),100+60*Math.sin(i/32*Math.PI))));
  expect(correctShape(open)).toBe(open);
});
it("spaces pressure-sensitive dots evenly and leaves actual gaps on the rendered canvas", () => {
  const points = [p(10,20),p(12,20),p(20,20),p(43,20),p(90,20)];
  expect(dotPoints(points,10).map((p) => p.x)).toEqual([10,20,30,40,50,60,70,80,90]);
  const canvas = createCanvas(110,40), ctx=canvas.getContext("2d");
  drawStroke(ctx as unknown as CanvasRenderingContext2D,{...stroke(points),width:4,pressure:false,dotted:true});
  expect(ctx.getImageData(10,20,1,1).data[3]).toBeGreaterThan(200);
  expect(ctx.getImageData(16,20,1,1).data[3]).toBe(0);
});
it("preserves dotted settings per pen and editable dotted strokes through copy and backup", () => {
  const settings = defaultPreferences(); settings.pens.pen2.dotted = true;
  expect(readPreferences(settings).pens.pen2.dotted).toBe(true);
  expect(readPreferences(settings).pens.pen1.dotted).not.toBe(true);
  expect(readPreferences({pens:{pen1:{...settings.pens.pen1,dotted:"bad"}}}).pens.pen1.dotted).toBe(false);
  const note = newNote(); note.pages[0].strokes=[{...stroke([p(0,0),p(100,0)]),dotted:true}];
  expect(readBackupBundle(makeBackup([note])).notes[0].pages[0].strokes[0].dotted).toBe(true);
  expect(cloneStrokes(decodeStrokes(encodeStrokes(note.pages[0].strokes))!,newPage())[0].dotted).toBe(true);
});
it("widens page ruling consistently and supports zooming to 800 percent", () => {
  const canvas=createCanvas(100,100),ctx=canvas.getContext("2d");
  drawPaper(ctx as unknown as CanvasRenderingContext2D,{...newPage(),paper:"grid"});
  expect(PAPER_SPACING).toBe(40);
  const line=ctx.getImageData(40,20,1,1).data, gap=ctx.getImageData(26,20,1,1).data;
  expect(line[0]).toBeLessThan(gap[0]);
  expect(clampZoom(8)).toBe(8); expect(clampZoom(10)).toBe(8); expect(clampZoom(.1)).toBe(.25);
});
