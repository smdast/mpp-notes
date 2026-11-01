import {it, expect} from "vitest";
import {selectionHandles, selectionHit, selectionScale, transformSelection, moveSelection} from "./editing";
import type {Point, Stroke} from "./model";
const p=(x:number,y:number):Point=>({x,y,p:0.7});
const bounds={left:10,top:20,right:210,bottom:120};
it("locks the aspect ratio at all four corners even for off-diagonal drags",()=>{
 for(const handle of selectionHandles(bounds).slice(0,4)) {
  const scale=selectionScale(handle,43,-17);
  expect(scale.scaleX).toBe(scale.scaleY);
  const image:Stroke={id:"image",tool:"pen",color:"#000000",width:0,points:[p(handle.cx,handle.cy),p(handle.x,handle.y)]};
  const transformed=transformSelection([image],new Set([image.id]),{...scale,cx:handle.cx,cy:handle.cy})[0];
  expect(transformed.points[0]).toEqual(image.points[0]);
  expect(Math.abs((transformed.points[1].x-handle.cx)/(transformed.points[1].y-handle.cy))).toBeCloseTo(2);
 }
});
it("stretches only the requested axis and ignores perpendicular motion on every edge",()=>{
 for(const handle of selectionHandles(bounds).slice(4)) {
  const scale=selectionScale(handle,40,30);
  if(handle.kind==="x") {
   expect(scale.scaleY).toBe(1);
   expect(scale).toEqual(selectionScale(handle,40,300));
  } else {
   expect(scale.scaleX).toBe(1);
   expect(scale).toEqual(selectionScale(handle,400,30));
  }
 }
});
it("keeps grab offsets stable and prevents zero sizes or flipping",()=>{
 const handle=selectionHandles(bounds)[3];
 expect(selectionScale(handle,0,0)).toEqual({scaleX:1,scaleY:1});
 expect(selectionScale(handle,-400,-400)).toEqual({scaleX:0.05,scaleY:0.05});
 expect(selectionScale(handle,1e6,1e6)).toEqual({scaleX:20,scaleY:20});
});
it("routes selection interiors, corners, borders and rotation independently from outside scrolling at any zoom",()=>{
 for(const zoom of [0.25,1,8]) {
  const b={left:100,top:200,right:1100,bottom:1000};
  expect(selectionHit(b,p(600,600),zoom)?.kind).toBe("move");
  expect(selectionHit(b,p(100,200),zoom)?.kind).toBe("corner");
  expect(selectionHit(b,p(100,600),zoom)?.kind).toBe("x");
  expect(selectionHit(b,p(400,1000),zoom)?.kind).toBe("y");
  expect(selectionHit(b,p(600,200-22/zoom),zoom)?.kind).toBe("rotate");
  expect(selectionHit(b,p(1200,1200),zoom)).toBeNull();
 }
 expect(selectionHit(null,p(100,100),1)).toBeNull();
});
it("moves pasted image corners and ink together without mutating originals",()=>{
 const image:Stroke={id:"image",tool:"pen",width:0,color:"#000000",image:"data:image/png;base64,test",points:[p(10,20),p(210,20),p(210,120),p(10,120)]};
 const ink:Stroke={id:"ink",tool:"pen",width:2,color:"#abcdef",points:[p(30,40),p(60,80)]};
 const other={...ink,id:"other"};
 const result=moveSelection([image,ink,other],new Set(["image","ink"]),25,-12);
 expect(result[0].points[0]).toEqual(p(35,8));expect(result[0].image).toBe(image.image);
 expect(result[1].points[0]).toEqual(p(55,28));expect(result[2]).toBe(other);
 expect(image.points[0]).toEqual(p(10,20));
});
