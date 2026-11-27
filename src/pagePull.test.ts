import {it,expect} from "vitest";
import {nextPaperGeometry,pagePullOffset,pagePullHandoff,advanceVerticalPagePull,isForeignPointerCaptureLoss} from "./pagePull";
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height});
it("reveals a page-sized sheet in the next horizontal frame, including the centred gutters",()=>{
  const geometry=nextPaperGeometry("horizontal",rect(200,100,600,500),rect(200,190,600,300),rect(400,214,200,276));
  expect(geometry).toMatchObject({left:834,top:114,width:200,height:276,inset:234});
  const offset=pagePullOffset(90,geometry);
  expect(geometry.left-offset).toBeLessThan(600);
  expect(offset).toBeGreaterThan(90);
  expect(pagePullOffset(0,geometry)).toBe(0);
  expect(pagePullOffset(10000,geometry)).toBeLessThan(600);
});
it("places the next vertical paper after the existing page and its fixed label and gap",()=>{
  const geometry=nextPaperGeometry("vertical",rect(200,100,600,500),rect(300,-200,400,800),rect(300,-176,400,776));
  expect(geometry).toMatchObject({left:100,top:558,width:400,height:776,inset:58});
  expect(geometry.top-pagePullOffset(90,geometry)).toBe(410);
});
it("hands a translated page over to real scrolling without moving its visible position",()=>{
  for(const offset of [0,48,148,324]){
    const oldScreen=120-offset,newLayout=104,oldScroll=800;
    const nextScroll=pagePullHandoff(oldScroll,oldScreen,newLayout);
    expect(newLayout-(nextScroll-oldScroll)).toBeCloseTo(oldScreen);
  }
});
it("limits long pulls to the scroll space the appended page will actually provide",()=>{
  const geometry=nextPaperGeometry("vertical",rect(0,0,900,1200),rect(350,900,200,300),rect(350,924,200,276));
  expect(pagePullOffset(10000,geometry)).toBe(276+24+34);
});
it("preserves the pull through stationary samples, tiny reversals and changing layout bounds",()=>{
  const first=advanceVerticalPagePull(null,300,180,500,500);
  expect(first.distance).toBe(120);
  const still=advanceVerticalPagePull(first.anchor,180,180,500,550);
  expect(still.distance).toBe(120);
  const back=advanceVerticalPagePull(still.anchor,180,185,500,550);
  expect(back.distance).toBe(115);expect(back.scrollTop).toBe(500);
  const forward=advanceVerticalPagePull(back.anchor,185,170,500,480);
  expect(forward.distance).toBe(130);expect(forward.scrollTop).toBe(500);
});
it("counts only movement beyond the bottom, and scrolls back only after the full pull is consumed",()=>{
  const first=advanceVerticalPagePull(null,300,220,460,500);
  expect(first).toEqual({anchor:{y:260,edge:500},distance:40,scrollTop:500});
  const partial=advanceVerticalPagePull(first.anchor,220,250,500,500);
  expect(partial.distance).toBe(10);expect(partial.scrollTop).toBe(500);
  const back=advanceVerticalPagePull(partial.anchor,250,275,500,500);
  expect(back).toEqual({anchor:null,distance:0,scrollTop:485});
});
it("does not end a viewport gesture when a child loses implicit pointer capture",()=>{
  const viewport=new EventTarget(),canvas=new EventTarget();
  expect(isForeignPointerCaptureLoss("lostpointercapture",canvas,viewport,false)).toBe(true);
  expect(isForeignPointerCaptureLoss("lostpointercapture",viewport,viewport,true)).toBe(true);
  expect(isForeignPointerCaptureLoss("lostpointercapture",viewport,viewport,false)).toBe(false);
  expect(isForeignPointerCaptureLoss("pointerup",canvas,viewport,true)).toBe(false);
  expect(isForeignPointerCaptureLoss("pointercancel",canvas,viewport,true)).toBe(false);
});
