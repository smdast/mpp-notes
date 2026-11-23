import "fake-indexeddb/auto";
import {it,expect} from "vitest";
import {clampToolbarPosition,defaultToolbarPlacement,readToolbarPlacement} from "./toolbarPlacement";
import {defaultPreferences,readPreferences} from "./preferences";
import {savePreferences,loadPreferences} from "./storage";
it("keeps all floating controls inside the viewport when moved or restored on a smaller display",()=>{
 expect(clampToolbarPosition({x:500,y:400},{width:600,height:70},{width:1280,height:800})).toEqual({x:500,y:400});
 expect(clampToolbarPosition({x:1000,y:900},{width:400,height:70},{width:430,height:600})).toEqual({x:22,y:522});
 expect(clampToolbarPosition({x:-50,y:-100},{width:400,height:70},{width:430,height:600})).toEqual({x:8,y:8});
 expect(clampToolbarPosition({x:500,y:500},{width:400,height:70},{width:300,height:60})).toEqual({x:8,y:8});
});
it("keeps legacy preferences docked and rejects corrupt placement data",()=>{
 expect(readPreferences({}).toolbarPlacement).toEqual(defaultToolbarPlacement());
 for(const value of [undefined,null,{mode:"other",x:1,y:2},{mode:"floating",x:NaN,y:3},{mode:"floating",x:1,y:Infinity},{mode:"floating",x:-1,y:3},{mode:"floating",x:"50",y:10}])expect(readToolbarPlacement(value)).toEqual(defaultToolbarPlacement());
});
it("persists floating and docked modes without losing the last floating location",async()=>{
 let prefs=defaultPreferences();prefs.toolbarPlacement={mode:"floating",x:302,y:421};
 await savePreferences(prefs);let restored=readPreferences(await loadPreferences());expect(restored.toolbarPlacement).toEqual(prefs.toolbarPlacement);
 prefs={...restored,toolbarPlacement:{...restored.toolbarPlacement,mode:"docked"}};await savePreferences(prefs);
 restored=readPreferences(await loadPreferences());expect(restored.toolbarPlacement).toEqual({mode:"docked",x:302,y:421});
 expect(readPreferences({...restored,toolbarPlacement:{...restored.toolbarPlacement,mode:"floating"}}).toolbarPlacement).toEqual({mode:"floating",x:302,y:421});
});
