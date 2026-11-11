import {it, expect} from "vitest";
import {selectionFrame,selectionHandles, selectionHit, selectionScale, transformSelection, moveSelection, imageAtPoint} from "./editing";
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

it("preserves line thickness, pressure and style through uniform and one-axis scaling",()=>{
 for (const width of [0.05,0.2,3,20,100]) {
  const ink:Stroke={id:"ink",tool:"pen",width,color:"#abcdef",pressure:true,dashed:true,points:[p(10,20),p(20,40)]};
  for (const scale of [{scaleX:3,scaleY:3},{scaleX:0.05,scaleY:1},{scaleX:1,scaleY:20}]) {
   const result=transformSelection([ink],new Set(["ink"]),{...scale,cx:0,cy:0})[0];
   expect(result.width).toBe(width);expect(result.points[0].p).toBe(.7);
   expect(result).toMatchObject({color:ink.color,pressure:true,dashed:true});
   expect(result.points[1].x).toBe(20*scale.scaleX);expect(result.points[1].y).toBe(40*scale.scaleY);
  }
 }
});
it("tap-selects only images, prioritizes the top image and respects rotated polygons",()=>{
 const image:Stroke={id:"image",tool:"pen",width:.05,color:"#000000",image:"data:image/png;base64,test",points:[p(0,0),p(100,0),p(100,60),p(0,60)]};
 const top={...image,id:"top"};const ink={...image,id:"ink",image:undefined};
 expect(imageAtPoint([image,top,ink],p(40,30))).toBe(top);
 expect(imageAtPoint([ink],p(40,30))).toBeUndefined();
 expect(imageAtPoint([image],p(110,30))).toBeUndefined();
 const rotated=transformSelection([image],new Set([image.id]),{angle:Math.PI/4,cx:50,cy:30})[0];
 expect(imageAtPoint([rotated],p(50,30))).toBe(rotated);
 expect(imageAtPoint([rotated],p(-5,-25))).toBeUndefined();
});

it("keeps the middle of thin selections draggable at different zoom levels",()=>{
 for(const zoom of [.25,1,8]){
  for(const thin of [{left:100,top:100,right:360,bottom:101},{left:100,top:100,right:101,bottom:360}]){
   const frame=selectionFrame(thin,zoom)!;
   expect(selectionHit(frame,p((thin.left+thin.right)/2,(thin.top+thin.bottom)/2),zoom)?.kind).toBe("move");
   expect(selectionHit(frame,p(frame.left,frame.top),zoom)?.kind).toBe("corner");
  }
 }
});
