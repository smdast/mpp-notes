import {it,expect} from "vitest";
import {scratchPasses,scratchErase} from "./scratch";
import {record,travel,type Stroke,type History} from "./model";
import {defaultPreferences,readPreferences} from "./preferences";
const p=(x:number,y:number)=>({x,y,p:.7});
const line:Stroke={id:"line",tool:"pen",width:2,color:"#000000",points:[p(30,-30),p(30,30)]};
const rub=[p(0,0),p(60,1),p(0,2),p(60,3),p(0,4),p(60,5)];
it("requires deliberate repeated reversals and rejects ordinary writing and short gestures",()=>{
 expect(scratchPasses(rub)).not.toBeNull();
 expect(scratchPasses(rub.slice(0,4))).toBeNull();
 expect(scratchPasses(rub.map(p=>({...p,x:p.x/10})))).toBeNull();
 expect(scratchPasses([p(0,0),p(10,20),p(20,0),p(30,20),p(40,0),p(50,20)])).toBeNull();
 expect(scratchPasses([p(0,0),p(60,0),p(0,60),p(60,60),p(0,120),p(60,120)])).toBeNull();
 expect(scratchPasses(rub.map(q=>p((q.x-q.y)/Math.SQRT2,(q.x+q.y)/Math.SQRT2)))).not.toBeNull();
});
it("erases repeatedly crossed strokes only, preserving images and nearby ink",()=>{
 const nearby={...line,id:"other",points:[p(90,-30),p(90,30)]};
 const image={...line,id:"image",image:"data:image/png;base64,test"};
 expect(scratchErase([line,nearby,image],rub)).toEqual([nearby,image]);
 expect(scratchErase([nearby],rub)).toBeNull();
 const vertical=rub.map(q=>p(q.y,q.x));
 const horizontal={...line,points:[p(-30,30),p(30,30)]};
 expect(scratchErase([horizontal],vertical)).toEqual([]);
 expect(line.points).toEqual([p(30,-30),p(30,30)]);
});
it("uses screen-size thresholds consistently at different zoom levels",()=>{
 for(const zoom of [.25,1,8]){
  const points=rub.map(q=>p(q.x/zoom,q.y/zoom));
  expect(scratchPasses(points,zoom)).not.toBeNull();
 }
});
it("defaults the optional gesture off, restores it and permits undo as one edit",()=>{
 expect(defaultPreferences().scratchErase).toBe(false);
 expect(readPreferences({scratchErase:true}).scratchErase).toBe(true);
 expect(readPreferences({scratchErase:"bad"}).scratchErase).toBe(false);
 const before=[line],after=scratchErase(before,rub)!;
 const history:History={past:[],future:[]};
 const changed=record(history,before);expect(travel(changed,after).strokes).toEqual(before);
});
