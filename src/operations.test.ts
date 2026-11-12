import {strokeStartColor} from "./draw";
import {createCanvas,Image} from "@napi-rs/canvas";
import {prepareImages} from "./images";
import type {Stroke} from "./model";
import "fake-indexeddb/auto";
import {it,expect,vi} from "vitest";
import {penButtonTool,penInContact} from "./penInput";
import {defaultPreferences,readPreferences} from "./preferences";
import {defaultShortcuts,shortcutFromEvent,shortcutAction,readShortcuts,reservedShortcut,formatShortcut,nativeClipboardAction} from "./shortcuts";
import {saveSetting,loadSetting} from "./storage";
const pen=(buttons:number,button=-1,pressure=.6)=>({pointerType:"pen",buttons,button,pressure});
const key=(code:string,patch:Partial<KeyboardEvent>={})=>({code,key:code.replace("Key","").toLowerCase(),ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...patch});
it("applies independent mappings to the selection and eraser signals",()=>{
  for(const selection of ["lasso","eraser"] as const)for(const eraser of ["lasso","eraser"] as const){
    expect(penButtonTool(pen(2,2),selection,eraser)).toBe(selection);expect(penButtonTool(pen(3,0),selection,eraser)).toBe(selection);
    expect(penButtonTool(pen(32,5),selection,eraser)).toBe(eraser);expect(penButtonTool(pen(34),selection,eraser)).toBe(eraser);
    expect(penButtonTool(pen(1),selection,eraser)).toBeUndefined();expect(penButtonTool(pen(0,5,0),selection,eraser)).toBeUndefined();expect(penButtonTool(pen(1,5,.6),selection,eraser)).toBeUndefined();
    expect(penButtonTool({...pen(2,2),pointerType:"mouse"},selection,eraser)).toBeUndefined();
  }
});
it("distinguishes pressing a barrel button in hover from contacting the page",()=>{
  expect(penInContact(pen(2,2,0))).toBe(false);
  expect(penInContact(pen(2,-1,.4))).toBe(true);expect(penInContact(pen(3,0,0))).toBe(true);
  expect(penInContact(pen(32,5,0))).toBe(true);expect(penInContact(pen(0,0,0))).toBe(false);
});
it("matches complete modifier combinations and skips IME input",()=>{
  const map=defaultShortcuts();expect(shortcutAction(map,key("KeyP"))).toBe("pen");
  expect(shortcutAction(map,key("KeyP",{altKey:true}))).toBeUndefined();
  expect(shortcutAction(map,key("KeyZ",{ctrlKey:true}))).toBe("undo");
  expect(shortcutAction(map,key("KeyZ",{metaKey:true,shiftKey:true}))).toBe("redo");
  expect(shortcutAction(map,key("KeyY",{ctrlKey:true}))).toBe("redo");
  expect(shortcutFromEvent(key("KeyP",{isComposing:true}))).toBeNull();
  expect(shortcutFromEvent(key("ShiftLeft",{key:"Shift",shiftKey:true}))).toBeNull();
  expect(formatShortcut("Mod+Shift+KeyZ")).toBe("Ctrl / ⌘+Shift+Z");
});
it("loads user bindings and disabled defaults without duplicate or browser-reserved shortcuts",()=>{
  const map=defaultShortcuts();map.pen=["KeyB"];map.eraser=[];map.undo=["Alt+KeyZ"];
  const result=readShortcuts({...map,marker:["KeyB","F5"],copy:["Mod+KeyW"]});
  expect(result.pen).toEqual(["KeyB"]);expect(result.marker).toEqual([]);expect(result.copy).toEqual([]);
  expect(result.eraser).toEqual([]);expect(shortcutAction(result,key("KeyZ",{altKey:true}))).toBe("undo");
  expect(shortcutAction(result,key("KeyP"))).toBeUndefined();expect(readShortcuts(null)).toEqual(defaultShortcuts());
  expect(reservedShortcut("Mod+KeyW")).toBe(true);expect(reservedShortcut("Alt+F4")).toBe(true);
});
it("retains native clipboard paths only for their matching command",()=>{
  expect(nativeClipboardAction(key("KeyV",{ctrlKey:true}))).toBe("paste");
  const map=defaultShortcuts();map.paste=["Alt+KeyV"];
  expect(shortcutAction(map,key("KeyV",{ctrlKey:true}))).toBeUndefined();
  expect(shortcutAction(map,key("KeyV",{altKey:true}))).toBe("paste");
});
it("persists both button assignments and retains older configurations",async()=>{
  expect(readPreferences({theme:"dark"})).toMatchObject({selectionButton:"lasso",eraserButton:"eraser"});
  expect(readPreferences({selectionButton:"eraser"})).toMatchObject({selectionButton:"eraser",eraserButton:"eraser"});
  const value=defaultPreferences();value.selectionButton="eraser";value.eraserButton="lasso";value.shortcuts.pen=["KeyB"];value.shortcuts.undo=["Alt+KeyZ"];
  await saveSetting("operation-settings-test",value);
  const restored=readPreferences(await loadSetting("operation-settings-test"));
  expect(restored).toMatchObject({selectionButton:"eraser",eraserButton:"lasso"});expect(restored.shortcuts.pen).toEqual(["KeyB"]);expect(restored.shortcuts.undo).toEqual(["Alt+KeyZ"]);
  expect(readPreferences({selectionButton:"invalid",shortcuts:{pen:["<script>"]}}).selectionButton).toBe("lasso");
});

it("persists horizontal scrolling and zero delay while defaulting older or invalid settings",async()=>{
  expect(readPreferences({})).toMatchObject({shapeHoldMs:300,scrollDirection:"vertical"});
  expect(readPreferences({shapeHoldMs:Infinity,scrollDirection:"diagonal"})).toMatchObject({shapeHoldMs:300,scrollDirection:"vertical"});
  await saveSetting("operation-display-test",{...defaultPreferences(),shapeHoldMs:0,scrollDirection:"horizontal"});
  expect(readPreferences(await loadSetting("operation-display-test"))).toMatchObject({shapeHoldMs:0,scrollDirection:"horizontal"});
});

it("persists individual pen background colors even when the mode is off",async()=>{
  const prefs=defaultPreferences();
  prefs.pens.pen1.autoColor={enabled:false,onLight:"#103030",onDark:"#ffeedd"};
  prefs.pens.pen2.autoColor={enabled:true,onLight:"#000000",onDark:"#ffffff"};
  await saveSetting("auto-pen-color-test",prefs);
  const restored=readPreferences(await loadSetting("auto-pen-color-test"));
  expect(restored.pens.pen1.autoColor).toEqual(prefs.pens.pen1.autoColor);
  expect(restored.pens.pen2.autoColor).toEqual(prefs.pens.pen2.autoColor);
  expect(restored.pens.pen3.autoColor).toBeUndefined();
  prefs.pens.pen1.autoColor.onLight="bad";
  expect(readPreferences(prefs).pens.pen1.autoColor).toBeUndefined();
});
it("samples the background at the page-space start on a scaled canvas and blends transparent pixels",()=>{
  const colors={enabled:true,onLight:"#111111",onDark:"#eeeeee"},page={width:100,height:200};
  const getImageData=(x:number,y:number)=>({data:x===50&&y===75?[0,0,0,255]:[0,0,0,0]});
  const canvas={width:200,height:300,getContext:()=>({getImageData})} as unknown as HTMLCanvasElement;
  expect(strokeStartColor(colors,canvas,{x:25,y:50},page,"#fffefa")).toBe(colors.onDark);
  expect(strokeStartColor(colors,canvas,{x:27,y:50},page,"#fffefa")).toBe(colors.onLight);
  expect(strokeStartColor(colors,canvas,{x:27,y:50},page,"#1e2822")).toBe(colors.onDark);
  expect(strokeStartColor(colors,null,{x:0,y:0},page,"#fffefa")).toBe(colors.onLight);
});

it("samples rotated inserted images in drawing order and sees through transparent pixels",async()=>{
  const paper=createCanvas(200,200),paperContext=paper.getContext("2d");
  paperContext.fillStyle="#ffffff";paperContext.fillRect(0,0,200,200);
  const sticker=createCanvas(40,40),stickerContext=sticker.getContext("2d");
  stickerContext.fillStyle="#000000";stickerContext.fillRect(0,0,20,40);
  const under=createCanvas(20,40),underContext=under.getContext("2d");
  underContext.fillStyle="#ffffff";underContext.fillRect(0,0,20,20);
  underContext.fillStyle="#000000";underContext.fillRect(0,20,20,20);
  const layer=(id:string,image:string,corners:number[][]):Stroke=>({
    id,image,tool:"pen",width:.05,color:"#000000",points:corners.map(([x,y])=>({x,y,p:.5})),
  });
  const top=layer("rotated",sticker.toDataURL(),[[70,20],[70,60],[30,60],[30,20]]);
  const bottom=layer("under",under.toDataURL(),[[45,20],[65,20],[65,60],[45,60]]);
  vi.stubGlobal("Image",Image);
  try{
    const decoded=await prepareImages([bottom,top]);
    const canvas=Object.assign(paper,{ownerDocument:{createElement:()=>createCanvas(1,1)}}) as unknown as HTMLCanvasElement;
    const colors={enabled:true,onLight:"#111111",onDark:"#eeeeee"};
    const at=(x:number,y:number,layers=[bottom,top])=>strokeStartColor(colors,canvas,{x,y},{width:100,height:100},"#ffffff",layers);
    expect(at(55,30)).toBe(colors.onDark);
    expect(at(55,30,[top,bottom])).toBe(colors.onLight);
    expect(at(55,50)).toBe(colors.onDark);
    expect(at(35,50)).toBe(colors.onLight);
    expect(at(75,30)).toBe(colors.onLight);
    expect(decoded).toHaveLength(2);
  }finally{vi.unstubAllGlobals();}
});
