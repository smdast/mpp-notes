import {it,expect} from "vitest";
import {captureNoteView,restoreNoteView,readNoteView,saveNoteView,forgetNoteView,validNoteView} from "./noteView";
const pages=[{id:"a",width:794,height:1123},{id:"b",width:612,height:842},{id:"c",width:1200,height:1500}];
const store=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};};
it("restores the exact viewport in page content, labels and gaps at different zoom levels",()=>{
  for(const zoom of [.25,.7,1.5,8])for(const top of [0,20,16+24+1123*zoom+12,Math.min(1600,16+pages.reduce((sum,p)=>sum+24+p.height*zoom+34,0)-300)]){
    const left=Math.max(0,Math.min(210,1200*zoom+96-900)),view=captureNoteView(pages,zoom,left,top,900)!;
    const restored=restoreNoteView(pages,view,900);
    expect(restored.left).toBeCloseTo(left);expect(restored.top).toBeCloseTo(top);
  }
});
it("anchors to the page identity after reordering and uses the nearest surviving page after deletion",()=>{
  const view=captureNoteView(pages,1,0,16+24+1123+34+24+200,900)!;expect(view.pageId).toBe("b");
  const reordered=restoreNoteView([pages[1],pages[0],pages[2]],view,900);expect(reordered.pageId).toBe("b");expect(reordered.top).toBe(240);
  const deleted=restoreNoteView([pages[0],pages[2]],view,900);expect(deleted.pageId).toBe("c");expect(deleted.top).toBe(1221);
});
it("preserves the horizontal page coordinate when the viewport size changes",()=>{
  const view=captureNoteView(pages,2,250,1700,900)!;
  const next=restoreNoteView(pages,view,700);
  expect(next.left).toBe(350);expect(next.top).toBe(1700);
});
it("keeps each note's position separate and loads persisted values without changing note data",()=>{
  const storage=store(),id=crypto.randomUUID(),other=crypto.randomUUID(),view=captureNoteView(pages,2,200,1500,900)!;
  expect(saveNoteView(id,view,storage)).toBe(true);expect(readNoteView(id,storage)).toEqual(view);expect(readNoteView(other,storage)).toBeUndefined();
  storage.setItem("mpp-notes:view:1:"+other,JSON.stringify(view));expect(readNoteView(other,storage)).toEqual(view);
  forgetNoteView(id,storage);expect(readNoteView(id,storage)).toBeUndefined();expect(readNoteView(other,storage)).toEqual(view);
  expect(pages.map(p=>p.id)).toEqual(["a","b","c"]);
});
it("rejects corrupt or out-of-range metadata and retains a session fallback if storage is unavailable",()=>{
  const storage=store(),bad=crypto.randomUUID();storage.setItem("mpp-notes:view:1:"+bad,"{broken");expect(readNoteView(bad,storage)).toBeUndefined();
  const view=captureNoteView(pages,1,0,100,900)!;
  for(const patch of [{version:2},{zoom:0},{zoom:9},{x:Infinity},{index:-1},{pageId:""}])expect(validNoteView({...view,...patch})).toBe(false);
  const denied={...storage,setItem:()=>{throw new Error("denied");}},id=crypto.randomUUID();
  expect(saveNoteView(id,view,denied)).toBe(false);expect(readNoteView(id,denied)).toEqual(view);
});

it("restores the exact horizontal position and opens the same page after switching direction",()=>{
  const zoom=1.5;
  const left=16+794*zoom+34+200,top=420;
  const view=captureNoteView(pages,zoom,left,top,900,"horizontal",600)!;
  expect(view.pageId).toBe("b");
  expect(restoreNoteView(pages,view,900,"horizontal",600)).toEqual({pageId:"b",left,top});
  expect(restoreNoteView(pages,view,900)).toEqual({pageId:"b",left:0,top:16+24+1123*zoom+34});
  const vertical=captureNoteView(pages,zoom,0,1800,900)!;
  expect(restoreNoteView(pages,vertical,900,"horizontal",600)).toEqual({pageId:"b",left:left-200,top:0});
});

it("keeps the target page when the scroll position includes the leading gutter",()=>{
  const left=794+34;
  const view=captureNoteView(pages,1,left,0,900,"horizontal",600)!;
  expect(view.pageId).toBe("b");
  expect(restoreNoteView(pages,view,900,"horizontal",600).left).toBe(left);
  expect(restoreNoteView(pages,view,900)).toEqual({pageId:"b",left:0,top:16+24+1123+34});
});
