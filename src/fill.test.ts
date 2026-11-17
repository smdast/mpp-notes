import {createCanvas,loadImage} from "@napi-rs/canvas";
import {expect,it,vi} from "vitest";
import {drawStroke} from "./draw";
import {fillStroke} from "./fill";
import {newPage,type Point,type Stroke} from "./model";
import {validStroke} from "./backup";
import {defaultPreferences,readPreferences} from "./preferences";

const p=(x:number,y:number):Point=>({x,y,p:.6});
const line=(id:string,points:Point[]):Stroke=>({id,points,tool:"pen",width:2,color:"#000000",shape:"line"});
it("fills only the tapped compartment, keeps transparency, and rejects open contours",async()=>{
  vi.stubGlobal("document",{createElement:()=>createCanvas(1,1)});
  try{
    const box=line("box",[p(10,10),p(70,10),p(70,60),p(10,60),p(10,10)]);
    const divider=line("divider",[p(40,10),p(40,60)]);
    const page={...newPage(),width:80,height:70,strokes:[box,divider]};
    const settings={color:"#fa3412",opacity:.4};
    const fill=fillStroke(page,p(20,25),settings)!;
    expect(validStroke(fill)).toBe(true);
    expect(fill.points[1].x).toBeLessThanOrEqual(40);
    const image=await loadImage(fill.image!);
    const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext("2d");
    ctx.drawImage(image,0,0);
    const [red,green,blue,alpha]=ctx.getImageData(10,10,1,1).data;
    expect(Math.abs(red-250)).toBeLessThanOrEqual(2);
    expect(Math.abs(green-52)).toBeLessThanOrEqual(2);
    expect(Math.abs(blue-18)).toBeLessThanOrEqual(2);
    expect(alpha).toBe(102);
    expect(fillStroke(page,p(4,4),settings)).toBeUndefined();
    expect(fillStroke({...page,strokes:[{...box,points:box.points.slice(0,-1)},divider]},p(20,25),settings)).toBeUndefined();
    expect(fillStroke({...page,strokes:[fill]},p(20,25),settings)).toBeUndefined();
  }finally{vi.unstubAllGlobals();}
});
it("retains the legacy marker alpha and saves custom marker and fill opacity",()=>{
  const canvas=createCanvas(50,50),ctx=canvas.getContext("2d");
  const marker:Stroke={...line("marker",[p(5,15),p(45,15)]),tool:"marker",width:8,pressure:false};
  drawStroke(ctx as unknown as CanvasRenderingContext2D,marker);
  expect(Math.abs(ctx.getImageData(20,15,1,1).data[3]-69)).toBeLessThanOrEqual(1);
  ctx.clearRect(0,0,50,50);
  drawStroke(ctx as unknown as CanvasRenderingContext2D,{...marker,opacity:.6});
  expect(ctx.getImageData(20,15,1,1).data[3]).toBe(153);
  expect(validStroke({...marker,opacity:1.1})).toBe(false);
  const prefs=defaultPreferences();
  prefs.pens.marker.opacity=.6;
  prefs.fill={color:"#abcdef",opacity:.2};
  expect(readPreferences(prefs).pens.marker.opacity).toBe(.6);
  expect(readPreferences(prefs).fill).toEqual(prefs.fill);
});
