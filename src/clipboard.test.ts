import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { cloneStrokes, decodeStrokes, encodeStrokes } from "./clipboard";
import { newNote, newPage, record, travel, type Stroke } from "./model";
import { makeBackup, readBackupBundle } from "./backup";
import { saveNote, loadNotes } from "./storage";
import { selectLasso, transformSelection } from "./editing";
const line: Stroke = {id:"source", tool:"pen", color:"#123456", width:3, pressure:true,
  points:[{x:20,y:30,p:.2},{x:60,y:80,p:.9}]};
it("copies across pages with fresh IDs, independent points and preserved pen settings", () => {
  const decoded = decodeStrokes(encodeStrokes([line]))!;
  const copy = cloneStrokes(decoded, newPage());
  expect(copy[0].id).not.toBe(line.id);
  expect(copy[0]).toMatchObject({color:line.color, width:3, pressure:true});
  expect(copy[0].points[0]).toEqual({x:40,y:50,p:.2});
  copy[0].points[0].x = 999;
  expect(line.points[0].x).toBe(20);
  const small = cloneStrokes([line], {width:30,height:40}, true);
  expect(small[0].points[1].x - small[0].points[0].x).toBe(40);
});
it("rejects arbitrary text, versions, malformed points and remote image URLs", () => {
  for (const text of ["ordinary text", '{"format":"mpp-notes-strokes","version":2,"strokes":[]}',
    encodeStrokes([{...line, points:[{x:NaN,y:0,p:.5}]}]),
    encodeStrokes([{...line, image:"https://example.com/image.png"}]),
    JSON.stringify({format:"mpp-notes-strokes",version:1,strokes:[null]})])
    expect(decodeStrokes(text)).toBeNull();
});
it("keeps pasted images through local storage, backups, transformations and undo", async () => {
  const canvas = createCanvas(2,2);
  const image: Stroke = {...line, id:"image", width:.05, image:canvas.toDataURL("image/png"),
    points:[{x:100,y:100,p:.5},{x:200,y:100,p:.5},{x:200,y:180,p:.5},{x:100,y:180,p:.5}]};
  const note = newNote("画像の保存");
  note.pages[0].strokes = [line,image];
  await saveNote(note);
  expect((await loadNotes()).find((n) => n.id === note.id)?.pages[0].strokes[1]).toEqual(image);
  const restored = readBackupBundle(makeBackup([note]),true).notes[0];
  expect(restored.pages[0].strokes[1]).toEqual(image);
  const copies = cloneStrokes(decodeStrokes(encodeStrokes([image]))!,newPage());
  expect(copies[0].image).toBe(image.image);
  const selected = selectLasso([image], [{x:130,y:120,p:.5},{x:150,y:120,p:.5},{x:150,y:140,p:.5},{x:130,y:140,p:.5}]);
  expect(selected.has("image")).toBe(true);
  const transformed = transformSelection([image],selected,{cx:150,cy:140,angle:Math.PI/2,scaleX:2,scaleY:.5});
  expect(transformed[0].points[0].x).toBeCloseTo(170);
  expect(transformed[0].points[0].y).toBeCloseTo(40);
  expect(transformed[0].image).toBe(image.image);
  const history = record({past:[],future:[]},[line]);
  const undone = travel(history,[line,...copies]);
  expect(undone.strokes).toEqual([line]);
  expect(travel(undone.history,undone.strokes,true).strokes).toEqual([line,...copies]);
});
