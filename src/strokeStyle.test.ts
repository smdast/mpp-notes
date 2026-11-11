import {expect,it} from "vitest";
import {applyStrokeStyle,lineStyle,strokeSize} from "./strokeStyle";
import {newPage,type Stroke} from "./model";
import {recordPages,travelPages} from "./notebookHistory";

const pen:Stroke={id:"pen",tool:"pen",color:"#123456",width:3,points:[{x:2,y:3,p:.4}],pressure:true,shape:"line"};
const marker:Stroke={...pen,id:"marker",tool:"marker",color:"#987654",width:20,dotted:true,pressure:false};
const image:Stroke={...pen,id:"image",image:"image"};
const other:Stroke={...pen,id:"other"};
const strokes=[pen,marker,image,other];
const selected=new Set(["pen","marker","image"]);

it("changes only selected ink and retains any fields left unspecified",()=>{
  const changed=applyStrokeStyle(strokes,selected,{color:"#ee5533"});
  expect(changed.slice(0,2)).toEqual([{...pen,color:"#ee5533"},{...marker,color:"#ee5533"}]);
  expect(changed[2]).toBe(image);
  expect(changed[3]).toBe(other);
});

it("applies width and exclusive line patterns without changing ink geometry",()=>{
  const changed=applyStrokeStyle(strokes,selected,{width:31,line:"dashed"});
  expect(changed[0]).toMatchObject({width:6.2,dashed:true,dotted:false,shape:"line"});
  expect(changed[0].points).toBe(pen.points);
  expect(changed.slice(0,2).map(strokeSize)).toEqual([31,31]);
  expect(changed[1]).toMatchObject({tool:"marker",width:31,dashed:true,dotted:false,pressure:false});
  expect(lineStyle(applyStrokeStyle(changed,selected,{line:"solid"})[1])).toBe("solid");
  expect(lineStyle(applyStrokeStyle(changed,selected,{line:"dotted"})[1])).toBe("dotted");
});

it("skips no-op edits and records a mixed change as one undoable edit",()=>{
  expect(applyStrokeStyle(strokes,new Set(["pen"]),{line:"solid",width:15})).toBe(strokes);
  expect(applyStrokeStyle(strokes,new Set(["image"]),{width:10})).toBe(strokes);
  const page={...newPage(),strokes};
  const changed=applyStrokeStyle(strokes,selected,{color:"#000000",width:5,line:"dotted"});
  const history=recordPages({past:[],future:[]},[page],[{id:page.id,strokes:changed}]);
  const undone=travelPages(history,[{...page,strokes:changed}],false);
  expect(undone.pages[0].strokes).toEqual(strokes);
  expect(travelPages(undone.history,undone.pages,true).pages[0].strokes).toEqual(changed);
});
