import {it,expect} from "vitest";
import {StrokeIndex,pointBounds,strokeBounds} from "./spatial";
import {erase,selectLasso,inside} from "./editing";
import {hits,type Stroke} from "./model";
const p=(x:number,y:number)=>({x,y,p:.7});
const line=(id:string,x:number,y:number):Stroke=>({id,tool:"pen",color:"#000000",width:3,points:[p(x,y),p(x+12,y+10)]});
it("narrows a dense page to nearby ink while including thick strokes and very large images",()=>{
 const strokes=Array.from({length:5000},(_,i)=>line(`${i}`,(i%50)*25,Math.floor(i/50)*15));
 const huge={...line("huge",-10000,-10000),image:"data",points:[p(-10000,-10000),p(10000,-10000),p(10000,10000),p(-10000,10000)]};
 const thick={...line("thick",510,500),width:30};
 const index=new StrokeIndex([...strokes,huge,thick]);const nearby=index.query(pointBounds([p(500,500)],5));
 expect(nearby.size).toBeLessThan(15);expect(nearby.has(huge)).toBe(true);expect(nearby.has(thick)).toBe(true);
 index.remove(huge);expect(index.query(pointBounds([p(500,500)],5)).has(huge)).toBe(false);
});
it("matches exhaustive lasso selection for sparse crossings, enclosed images and distant ink",()=>{
 const strokes=Array.from({length:300},(_,i)=>line(`${i}`,(i%20)*20,Math.floor(i/20)*20));
 strokes.push({...line("cross",-100,50),points:[p(-100,50),p(1000,50)]});
 strokes.push({...line("image",0,0),image:"data",points:[p(-10,-10),p(500,-10),p(500,500),p(-10,500)]});
 for(const polygon of [[p(30,30),p(70,30),p(70,70),p(30,70)],[p(10,10),p(300,40),p(120,200),p(10,150)]]){
  const expected=new Set(strokes.filter(s=>s.points.some(p=>inside(p,polygon))||(s.image&&polygon.some(p=>inside(p,s.points)))||polygon.some((a,i)=>hits(s,a,polygon[(i+1)%polygon.length],0))).map(s=>s.id));
  expect(selectLasso(strokes,polygon,new StrokeIndex(strokes))).toEqual(expected);
 }
});
it("updates the eraser index for fragments and preserves the same visible geometry as exhaustive erasing",()=>{
 const original=[{...line("cross",0,50),points:[p(0,50),p(100,50)]},line("far",200,200)];
 const index=new StrokeIndex(original);let actual=original,expected=original;
 for(const [a,b] of [[p(30,40),p(30,60)],[p(70,40),p(70,60)]]){
  actual=erase(actual,a,b,8,"area",index);expected=erase(expected,a,b,8,"area");
  expect(actual.map(({id,...s})=>s)).toEqual(expected.map(({id,...s})=>s));
  const candidates=index.query(pointBounds([a,b],10));expect([...candidates].every(s=>actual.includes(s))).toBe(true);
 }
 const untouched=actual;expect(erase(actual,p(900,900),p(901,901),5,"stroke",index)).toBe(untouched);
 const removed:Stroke[]=[];const result=erase(actual,p(200,200),p(210,210),5,"stroke",index,s=>removed.push(s));
 expect(removed.map(s=>s.id)).toEqual(["far"]);expect(result.some(s=>s.id==="far")).toBe(false);
});
it("reuses cached immutable bounds without rescanning all points on repeated queries",()=>{
 let reads=0;const stroke=line("cached",100,100),points=stroke.points;
 Object.defineProperty(stroke,"points",{get:()=>{reads++;return points;}});
 const index=new StrokeIndex([stroke]);const first=reads;
 for(let i=0;i<100;i++){strokeBounds(stroke);index.query(pointBounds([p(i,i)],3));}
 expect(reads).toBe(first);
});
