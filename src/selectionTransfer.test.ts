import "fake-indexeddb/auto";
import {it,expect} from "vitest";
import {newNote,newPage,pagePoint,type Stroke} from "./model";
import {transferSelection} from "./selectionTransfer";
import {recordPages,travelPages,forgetPage} from "./notebookHistory";
import {saveNote,loadNotes} from "./storage";
const point=(x:number,y:number)=>({x,y,p:.7});
const line:Stroke={id:"ink",tool:"pen",width:3,color:"#123456",pressure:true,points:[point(100,900),point(150,950)]};
const image:Stroke={...line,id:"image",image:"data:image/png;base64,test",points:[point(200,900),point(300,900),point(300,1000),point(200,1000)]};
const pages=()=>[{...newPage(),id:"first",strokes:[line,image]},{...newPage(),id:"second",width:500,height:700,strokes:[{...line,id:"existing"}]}];
it("moves strokes and images to another page without scaling widths, pressure or image corners",()=>{
 const original=pages(),start=point(120,920),end=pagePoint(175,130,{left:100,top:100,width:250,height:350},original[1],.7);
 const changes=transferSelection(original,"first","second",[line,image],start,end);
 expect(changes[0].strokes).toEqual([]);expect(changes[1].strokes.map(s=>s.id)).toEqual(["existing","ink","image"]);
 expect(changes[1].strokes[1]).toMatchObject({width:3,pressure:true,points:[point(130,40),point(180,90)]});
 expect(changes[1].strokes[2]).toMatchObject({image:image.image,width:3,points:[point(230,40),point(330,40),point(330,140),point(230,140)]});
 expect(original[0].strokes).toEqual([line,image]);expect(changes[1].strokes[0]).toBe(original[1].strokes[0]);
});
it("supports upward and same-page moves and ignores missing destinations or a stationary tap",()=>{
 const original=pages();
 expect(transferSelection(original,"second","first",original[1].strokes,point(20,30),point(200,1000))[1].strokes.at(-1)?.points[0]).toEqual(point(280,1870));
 const same=transferSelection(original,"first","first",[image],point(200,900),point(220,930));
 expect(same).toHaveLength(1);expect(same[0].strokes[0]).toBe(line);expect(same[0].strokes[1].points[0]).toEqual(point(220,930));
 expect(transferSelection(original,"first","missing",[line],point(0,0),point(2,2))).toEqual([]);
 expect(transferSelection(original,"first","first",[line],point(0,0),point(0,0))).toEqual([]);
});
it("undoes and redoes both pages as one edit, including subsequent drawing and branching",()=>{
 const original=pages(),changes=transferSelection(original,"first","second",[line],point(100,900),point(100,100));
 const moved=original.map(p=>({...p,strokes:changes.find(c=>c.id===p.id)!.strokes}));
 const history=recordPages({past:[],future:[]},original,changes);
 const undone=travelPages(history,moved);expect(undone.pages.map(p=>p.strokes)).toEqual(original.map(p=>p.strokes));
 const redone=travelPages(undone.history,undone.pages,true);expect(redone.pages.map(p=>p.strokes)).toEqual(moved.map(p=>p.strokes));
 const newInk=[...moved[1].strokes,{...line,id:"new"}],drawn=moved.map(p=>p.id==="second"?{...p,strokes:newInk}:p);
 const drawing=recordPages(redone.history,moved,[{id:"second",strokes:newInk}]);
 const back=travelPages(drawing,drawn);expect(back.pages.map(p=>p.strokes)).toEqual(moved.map(p=>p.strokes));
 expect(travelPages(back.history,back.pages).pages.map(p=>p.strokes)).toEqual(original.map(p=>p.strokes));
 expect(recordPages(undone.history,undone.pages,[{id:"first",strokes:[]}]).future).toEqual([]);
 expect(forgetPage(history,"first").past).toEqual([]);
 expect(forgetPage(drawing,"first")).toEqual({past:[],future:[]});
 expect(forgetPage(drawing,"unrelated")).toBe(drawing);
});
it("saves both sides of the transfer together and restores them without duplicate strokes",async()=>{
 const note=newNote(),original=pages(),changes=transferSelection(original,"first","second",[line,image],point(100,900),point(100,100));
 note.pages=original.map(p=>({...p,strokes:changes.find(c=>c.id===p.id)!.strokes}));
 await saveNote(note);const restored=(await loadNotes()).find(n=>n.id===note.id)!;
 expect(restored.pages[0].strokes).toEqual([]);expect(restored.pages[1].strokes).toHaveLength(3);
 expect(restored.pages[1].strokes.filter(s=>s.id==="ink")).toHaveLength(1);
});
it("keeps imported same-ID strokes distinct when moving them onto the same page",()=>{
 const original=pages();original[1].strokes=[{...line,points:[point(10,10)]}];
 const changes=transferSelection(original,"first","second",[line],point(100,900),point(100,100));
 expect(changes[1].strokes).toHaveLength(2);expect(changes[1].strokes[0].id).toBe("ink");expect(changes[1].strokes[1].id).not.toBe("ink");
});
