import {it,expect} from "vitest";
import {EndpointHold,correctHeldShape,SHAPE_HOLD_MS} from "./shapeHold";
import type {Stroke} from "./model";
const line=():Stroke=>({id:"line",tool:"pen",color:"#345d48",width:3,points:[{x:0,y:0,p:.7},{x:40,y:2,p:.7},{x:100,y:5,p:.7}]});
const release=(timeStamp:number,clientX=100,clientY=5)=>({timeStamp,clientX,clientY});
function moved(){const hold=new EndpointHold();hold.start(0,0,0);hold.move(40,2,40,2);hold.move(100,5,90,3);return hold;}
it("only corrects a recognizable shape after holding at its endpoint",()=>{
  const hold=moved(),stroke=line();
  expect(correctHeldShape(stroke,[],hold,release(90+SHAPE_HOLD_MS-1))).toBe(stroke);
  const result=correctHeldShape(stroke,[],hold,release(90+SHAPE_HOLD_MS));expect(result.shape).toBe("line");expect(result.points).toHaveLength(2);expect(stroke.points).toHaveLength(3);
});
it("requires a new endpoint pause after continuing from a mid-stroke pause",()=>{
  const hold=moved();expect(hold.ready(100,5,1000)).toBe(true);
  hold.move(150,6,1100,4);const stroke=line();stroke.points.push({x:150,y:6,p:.7});
  expect(correctHeldShape(stroke,[],hold,release(1200,150,6))).toBe(stroke);
  expect(correctHeldShape(stroke,[],hold,release(1550,150,6)).shape).toBe("line");
});
it("accepts small endpoint jitter without allowing repeated samples to distort recognition",()=>{
  const hold=moved(),stroke=line();
  for(let i=1;i<=150;i++){const x=100+(i%2?.3:-.3),y=5+(i%2?.2:-.2);stroke.points.push({x,y,p:.7});hold.move(x,y,90+i*5,stroke.points.length);}
  expect(correctHeldShape(stroke,[],hold,release(850,100.3,5.2)).shape).toBe("line");
  expect(stroke.points).toHaveLength(153);
});
it("keeps unrecognized writing intact and rejects movement on release or a reset gesture",()=>{
  const hold=moved(),stroke=line();expect(correctHeldShape(stroke,[],hold,release(700,110,5))).toBe(stroke);
  const writing={...stroke,points:[{x:0,y:0,p:.7},{x:20,y:50,p:.7},{x:40,y:0,p:.7},{x:60,y:60,p:.7},{x:100,y:5,p:.7}]};hold.move(0,0,0,1);hold.move(100,5,90,5);
  expect(correctHeldShape(writing,[],hold,release(700))).toBe(writing);
  hold.reset();expect(hold.ready(100,5,2000)).toBe(false);
});
it("the live preview countdown follows movement but ignores endpoint jitter",()=>{
  const hold=moved();
  expect(hold.remaining(300)).toBe(90);
  expect(hold.move(101,6,310,4)).toBe(false);
  expect(hold.remaining(390)).toBe(0);
  expect(hold.move(112,5,400,5)).toBe(true);
  expect(hold.remaining(405)).toBe(295);
  expect(hold.endpointCount).toBe(5);
});

it("uses the configured delay and recognizes quick releases at zero",()=>{
  const hold=moved(),stroke=line();
  const end=release(190);
  expect(hold.remaining(190,800)).toBe(700);
  expect(correctHeldShape(stroke,[],hold,end,800)).toBe(stroke);
  expect(correctHeldShape(stroke,[],hold,end,100).shape).toBe("line");
  expect(correctHeldShape(stroke,[],hold,release(90,106,5),0).shape).toBe("line");
});
