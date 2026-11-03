import "fake-indexeddb/auto";
import {it,expect} from "vitest";
import {defaultPreferences,readPreferences,addPen,deletePen,penIds,penKind} from "./preferences";
import {savePreferences,loadPreferences} from "./storage";
import {penColor} from "./paper";
it("migrates the legacy shared correction flag to every pen while preserving explicit overrides",()=>{
 const old=defaultPreferences();
 for(const pen of Object.values(old.pens))delete pen.shapeCorrection;
 const migrated=readPreferences({...old,shapeCorrection:false});
 expect(Object.values(migrated.pens).every(p=>p.shapeCorrection===false)).toBe(true);
 const override=readPreferences({...old,shapeCorrection:false,pens:{...old.pens,pen2:{...old.pens.pen2,shapeCorrection:true}}});
 expect(override.pens.pen1.shapeCorrection).toBe(false);expect(override.pens.pen2.shapeCorrection).toBe(true);
 expect(override).not.toHaveProperty("shapeCorrection");
});
it("registers pen and marker presets independently and preserves their styles and automatic dark colors",()=>{
 const base=defaultPreferences();base.activePen="pen2";base.pens.pen2.width=6.2;base.pens.pen2.shapeCorrection=false;base.pens.pen2.dashed=true;
 const added=addPen(base,"pen","custom-blue");
 expect(penIds(added,"pen")).toEqual(["pen1","pen2","pen3","custom-blue"]);
 expect(added.pens[added.activePen]).toMatchObject({kind:"pen",width:6.2,shapeCorrection:false,dashed:true});
 expect(penColor(added.pens[added.activePen],added.activePen,true)).toBe(penColor(base.pens.pen2,"pen2",true));
 added.pens[added.activePen].shapeCorrection=true;expect(base.pens.pen2.shapeCorrection).toBe(false);expect(base.pens).not.toHaveProperty("custom-blue");
 const marker=addPen(added,"marker","custom-yellow");
 expect(penKind(marker.activePen,marker.pens[marker.activePen])).toBe("marker");expect(penIds(marker,"marker")).toEqual(["marker","custom-yellow"]);
 expect(marker.pens[marker.activePen].pressure).toBe(false);expect(marker.pens[marker.activePen].shapeCorrection).toBe(true);
 expect(()=>addPen(marker,"pen","pen1")).toThrow();expect(()=>addPen(marker,"pen","custom-yellow")).toThrow();
});
it("restores added presets, their kind and independent correction switches from local storage",async()=>{
 let prefs=addPen(defaultPreferences(),"pen","custom-thin");prefs.pens[prefs.activePen]={...prefs.pens[prefs.activePen],width:.2,color:"#abcdef",customColor:true,shapeCorrection:false};
 prefs=addPen(prefs,"marker","custom-marker");prefs.pens[prefs.activePen].shapeCorrection=true;
 await savePreferences(prefs);const restored=readPreferences(await loadPreferences());
 expect(restored.activePen).toBe("custom-marker");expect(restored.pens["custom-thin"]).toMatchObject({width:.2,color:"#abcdef",shapeCorrection:false,kind:"pen"});
 expect(restored.pens["custom-marker"]).toMatchObject({kind:"marker",shapeCorrection:true});expect(penIds(restored,"pen")).toHaveLength(4);expect(penIds(restored,"marker")).toHaveLength(2);
});
it("rejects invalid registrations and active IDs without losing the built-in pens",()=>{
 const valid=defaultPreferences().pens.pen1;
 const restored=readPreferences({activePen:"toString",pens:{"custom-bad":{...valid,kind:"eraser"},"custom-no-kind":{color:"#000000",width:3,pressure:true},"custom-negative":{...valid,width:-1},"custom-ok":{...valid,kind:"marker",shapeCorrection:false}}});
 expect(restored.activePen).toBe("pen1");expect(penIds(restored,"pen")).toHaveLength(3);expect(penIds(restored,"marker")).toEqual(["marker","custom-ok"]);
 expect(readPreferences({pens:{"custom-ok":restored.pens["custom-ok"]},activePen:"custom-ok"}).activePen).toBe("custom-ok");
});
it("deletes built-in and registered pens, restores their absence and selects an available replacement",async()=>{
 let prefs=addPen(defaultPreferences(),"pen","custom-delete");
 prefs=deletePen(prefs,"custom-delete");expect(prefs.pens).not.toHaveProperty("custom-delete");expect(prefs.activePen).toBe("pen1");
 prefs=deletePen(prefs,"pen1");expect(prefs.activePen).toBe("pen2");expect(penIds(prefs,"pen")).toEqual(["pen2","pen3"]);
 prefs=deletePen(prefs,"marker");expect(penIds(prefs,"marker")).toEqual([]);
 await savePreferences(prefs);const restored=readPreferences(await loadPreferences());
 expect(penIds(restored,"pen")).toEqual(["pen2","pen3"]);expect(penIds(restored,"marker")).toEqual([]);expect(restored.activePen).toBe("pen2");
 const added=addPen(restored,"marker","custom-new-marker");expect(penIds(added,"marker")).toEqual(["custom-new-marker"]);expect(added.pens[added.activePen]).toMatchObject({kind:"marker",width:4});
 expect(penIds(defaultPreferences(),"pen")).toHaveLength(3);
});
it("keeps one usable preset and rejects a deleted active pen when restoring",()=>{
 let prefs=deletePen(defaultPreferences(),"pen1");prefs=deletePen(prefs,"pen2");prefs=deletePen(prefs,"pen3");
 expect(prefs.activePen).toBe("marker");expect(deletePen(prefs,"marker")).toBe(prefs);
 const restored=readPreferences({...prefs,activePen:"pen1"});expect(restored.activePen).toBe("marker");
 const empty=readPreferences({deletedPens:["pen1","pen2","pen3","marker"]});expect(empty.activePen).toBe("pen1");expect(penIds(empty,"pen")).toEqual(["pen1"]);
});
