import "fake-indexeddb/auto";
import {it,expect} from "vitest";
import {penButtonTool,penInContact} from "./penInput";
import {defaultPreferences,readPreferences} from "./preferences";
import {defaultShortcuts,shortcutFromEvent,shortcutAction,readShortcuts,reservedShortcut,formatShortcut,nativeClipboardAction} from "./shortcuts";
import {saveSetting,loadSetting} from "./storage";
const pen=(buttons:number,button=-1,pressure=.6)=>({pointerType:"pen",buttons,button,pressure});
const key=(code:string,patch:Partial<KeyboardEvent>={})=>({code,key:code.replace("Key","").toLowerCase(),ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...patch});
it("keeps the selection button separate from the dedicated eraser in both configurations",()=>{
  for(const selection of ["lasso","eraser"] as const){
    expect(penButtonTool(pen(2,2),selection)).toBe(selection);expect(penButtonTool(pen(3,0),selection)).toBe(selection);
    expect(penButtonTool(pen(32,5),selection)).toBe("eraser");expect(penButtonTool(pen(34),selection)).toBe("eraser");
    expect(penButtonTool(pen(1),selection)).toBeUndefined();expect(penButtonTool(pen(0,5,0),selection)).toBeUndefined();expect(penButtonTool(pen(1,5,.6),selection)).toBeUndefined();
    expect(penButtonTool({...pen(2,2),pointerType:"mouse"},selection)).toBeUndefined();
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
it("persists operation preferences and upgrades previous settings with a lasso selection button",async()=>{
  expect(readPreferences({theme:"dark"}).selectionButton).toBe("lasso");
  const value=defaultPreferences();value.selectionButton="eraser";value.shortcuts.pen=["KeyB"];value.shortcuts.undo=["Alt+KeyZ"];
  await saveSetting("operation-settings-test",value);
  const restored=readPreferences(await loadSetting("operation-settings-test"));
  expect(restored.selectionButton).toBe("eraser");expect(restored.shortcuts.pen).toEqual(["KeyB"]);expect(restored.shortcuts.undo).toEqual(["Alt+KeyZ"]);
  expect(readPreferences({selectionButton:"invalid",shortcuts:{pen:["<script>"]}}).selectionButton).toBe("lasso");
});
