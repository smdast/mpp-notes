import { it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { newPage, newNote, type Stroke } from "./model";
import { newPageFrom, applyPaperTemplate } from "./paper";
import { dashSegments, drawStroke } from "./draw";
import { defaultPreferences, readPreferences } from "./preferences";
import { makeBackup, readBackupBundle } from "./backup";
import { cloneStrokes, decodeStrokes, encodeStrokes } from "./clipboard";
const p = (x:number) => ({x,y:20,p:.75/.95});
const dashed: Stroke = {id:"dash",tool:"pen",color:"#000000",width:3,pressure:false,dashed:true,points:[p(10),p(90)]};
it("inherits the previous template without copying ink or PDF identity", () => {
  const previous = {...newPage(), width:600, height:900, paper:"ruled" as const, paperColor:"#fff7dc",strokes:[dashed]};
  const added = newPageFrom(previous,true);
  expect(added).toMatchObject({width:600,height:900,paper:"ruled",paperColor:"#fff7dc",strokes:[]});
  expect(added.id).not.toBe(previous.id);
  const fromPdf = newPageFrom({...previous,pdfIndex:2,paper:"blank"},true);
  expect(fromPdf.pdfIndex).toBeUndefined(); expect(fromPdf.paperColor).toBe("#fffefa");
  expect(newPageFrom(undefined,true).paperColor).toBe("#1e2822");
});
it("applies templates to all normal pages while preserving ink, dimensions and PDF pages", () => {
  const source={...newPage(),paper:"ruled" as const,paperColor:"#fff7dc"};
  const written={...newPage(),width:600,strokes:[dashed]};
  const pdf={...newPage(),pdfIndex:0};
  const result=applyPaperTemplate([source,written,pdf],source,true);
  expect(result[1]).toMatchObject({id:written.id,width:600,paper:"ruled",paperColor:"#fff7dc"});
  expect(result[1].strokes).toBe(written.strokes); expect(result[2]).toBe(pdf);
  expect(written.paper).toBe("grid");
  expect(newPageFrom(result[1],true).paper).toBe("ruled");
});
it("keeps dash lengths independent of event sampling and renders empty gaps", () => {
  const a=dashSegments([p(0),p(45)],12,8);
  const b=dashSegments([p(0),p(5),p(13),p(30),p(45)],12,8);
  expect(a.map((piece)=>piece.map((point)=>point.x))).toEqual([[0,12],[20,32],[40,45]]);
  expect(b.map((piece)=>[piece[0].x,piece.at(-1)!.x])).toEqual([[0,12],[20,32],[40,45]]);
  const canvas=createCanvas(100,40),ctx=canvas.getContext("2d");
  drawStroke(ctx as unknown as CanvasRenderingContext2D,dashed);
  expect(ctx.getImageData(15,20,1,1).data[3]).toBeGreaterThan(200);
  expect(ctx.getImageData(26,20,1,1).data[3]).toBe(0);
  expect(ctx.getImageData(36,20,1,1).data[3]).toBeGreaterThan(200);
});
it("restores all 100 pen sizes and normalizes older settings without changing old strokes", () => {
  for (let level=1;level<=100;level++) {
    const width=level/5;
    const settings=defaultPreferences(); settings.pens.pen1.width=width; settings.pens.pen1.dashed=true;
    const restored=readPreferences(settings);
    expect(restored.pens.pen1.width).toBe(width); expect(restored.pens.pen1.dashed).toBe(true);
  }
  const old=defaultPreferences(); old.pens.pen1.width=2.5;
  expect(readPreferences(old).pens.pen1.width).toBe(2.6);
  const n=newNote();n.pages[0].strokes=[{...dashed,width:2.5}];
  expect(readBackupBundle(makeBackup([n])).notes[0].pages[0].strokes[0].width).toBe(2.5);
});
it("preserves dashed lines through backup and editable clipboard operations", () => {
  const note=newNote();note.pages[0].strokes=[dashed];
  expect(readBackupBundle(makeBackup([note])).notes[0].pages[0].strokes[0].dashed).toBe(true);
  expect(cloneStrokes(decodeStrokes(encodeStrokes([dashed]))!,newPage())[0].dashed).toBe(true);
  const invalid={...dashed,dashed:"bad"} as unknown as Stroke;
  expect(decodeStrokes(encodeStrokes([invalid]))).toBeNull();
});
