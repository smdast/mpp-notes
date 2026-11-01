import "fake-indexeddb/auto";
import { it,expect,vi } from "vitest";
import { createCanvas,Image } from "@napi-rs/canvas";
import { readPreferences,defaultPreferences } from "./preferences";
import { newNote } from "./model";
import { makeBackup,readBackupBundle } from "./backup";
import { saveNote,loadNotes } from "./storage";
import { newPageFrom,applyPaperTemplate } from "./paper";
import { loadInkImage } from "./images";
import { drawPaper } from "./draw";
it("keeps validated theme and paper defaults while rejecting external images",()=>{
 expect(readPreferences({accent:"blue",paperColor:"#fff7dc",paperPattern:"ruled"})).toMatchObject({accent:"blue",paperColor:"#fff7dc",paperPattern:"ruled"});
 expect(readPreferences({accent:"unknown",paperImage:"https://example.com/a.png"})).toMatchObject({accent:"green",paperPattern:"grid"});
 expect(readPreferences({}).theme).toBe(defaultPreferences().theme);
});
it("preserves cover and page background images in local storage, backups and new pages",async()=>{
 const c=createCanvas(3,3),data=c.toDataURL("image/png"),n=newNote();n.coverImage=data;n.pages[0].backgroundImage=data;
 await saveNote(n);expect((await loadNotes()).find(x=>x.id===n.id)?.coverImage).toBe(data);
 const restored=readBackupBundle(makeBackup([n])).notes[0];expect(restored.coverImage).toBe(data);expect(restored.pages[0].backgroundImage).toBe(data);
 expect(newPageFrom(n.pages[0],false).backgroundImage).toBe(data);
 expect(applyPaperTemplate([n.pages[0],newNote().pages[0]],n.pages[0],false)[1].backgroundImage).toBe(data);
 n.coverImage="https://example.com/private";expect(()=>readBackupBundle(makeBackup([n]))).toThrow();
});
it("renders custom paper imagery in the shared screen and PDF paper renderer",async()=>{
 vi.stubGlobal("Image",Image);
 try{const source=createCanvas(10,10),sc=source.getContext("2d");sc.fillStyle="#ff0000";sc.fillRect(0,0,10,10);const data=source.toDataURL("image/png");await loadInkImage(data);
 const c=createCanvas(100,100);drawPaper(c.getContext("2d") as unknown as CanvasRenderingContext2D,{...newNote().pages[0],width:100,height:100,paper:"blank",backgroundImage:data});expect(c.getContext("2d").getImageData(50,50,1,1).data[0]).toBe(255);expect(c.getContext("2d").getImageData(50,50,1,1).data[1]).toBe(0);
 }finally{vi.unstubAllGlobals();}
});
