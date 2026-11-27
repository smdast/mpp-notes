import {ScrollMotion} from "./motion";
import {it,expect,vi} from "vitest";
import {horizontalPageLayout,horizontalPageIndex,verticalPageInset,pageAfterSwipe,horizontalZoomPosition,touchGeometry,pinchViewport,zoomScrollLeft,zoomScrollTop} from "./scrolling";
const pages=[{height:1123},{height:842},{height:1123}];
it("starts at the actual two-finger midpoint without a first-move pan or zoom",()=>{
  const first={x:170,y:220},second={x:470,y:420};
  const start=touchGeometry([first,second])!;
  expect(start.x).toBe(320);expect(start.y).toBe(320);
  const anchor={...start,zoom:.7,left:0,top:620,viewportWidth:900};
  expect(pinchViewport(pages,794,900,anchor,start)).toEqual({zoom:.7,left:0,top:620});
  expect(touchGeometry([first,second,{x:999,y:999}])).toEqual(start);
  // Rebase when one finger lifts, so the remaining finger pans by its delta.
  expect(touchGeometry([second])).toEqual({...second,distance:0});
});
it("keeps a page point under a moving pinch centre, including fixed labels and gaps",()=>{
  const from=.7,to=1.8,pageX=265,pageY=360,index=1;
  const pageTop=(zoom:number)=>16+pages.slice(0,index).reduce((sum,p)=>sum+24+p.height*zoom+34,0)+24;
  const stackCentre=(zoom:number)=>Math.max(900,794*zoom)/2;
  const anchor={zoom:from,left:0,top:pageTop(from)+pageY*from-290,x:stackCentre(from)+(pageX-794/2)*from,y:290,distance:200,viewportWidth:900};
  const current={x:anchor.x+35,y:anchor.y-24,distance:200*to/from};
  const next=pinchViewport(pages,794,900,anchor,current);
  expect(next.zoom).toBeCloseTo(to);
  expect(stackCentre(to)+(pageX-794/2)*to-next.left).toBeCloseTo(current.x);
  expect(pageTop(to)+pageY*to-next.top).toBeCloseTo(current.y);
});
it("uses a stable baseline for rapid samples and clamps to the supported zoom range",()=>{
  const anchor={zoom:1,left:250,top:1200,x:420,y:280,distance:240,viewportWidth:800};
  const target={x:450,y:290,distance:360};
  for(const distance of [245,260,300,340])pinchViewport(pages,794,800,anchor,{...target,distance});
  expect(pinchViewport(pages,794,800,anchor,target).zoom).toBe(1.5);
  expect(pinchViewport(pages,794,800,anchor,{...target,distance:9000}).zoom).toBe(8);
  expect(pinchViewport(pages,794,800,anchor,{...target,distance:1}).zoom).toBe(.25);
});
it("accounts for scrollbar changes without moving the page point at the viewport centre",()=>{
  const from=.7,to=2,oldHeight=600,newHeight=590,pageY=600;
  const top=16+24+pageY*from-oldHeight/2;
  const next=zoomScrollTop(pages,from,to,top,oldHeight/2)+oldHeight/2-newHeight/2;
  expect(16+24+pageY*to-next).toBeCloseTo(newHeight/2);
  // Zooming out can remove the vertical scrollbar and widen the viewport.
  const left=zoomScrollLeft(794,890,2,.7,320,445,900)+445-450;
  const oldPoint=(320+445-794*2/2)/2;
  expect(450+oldPoint*.7-left).toBeCloseTo(450);
});
it("preserves horizontal anchors when switching between centred and horizontally scrollable pages",()=>{
  for(const [from,to] of [[.7,2],[2,.7],[2,4]]){
    const left=from>1?310:0,x=450;
    const next=zoomScrollLeft(794,900,from,to,left,x);
    const restored=zoomScrollLeft(794,900,to,from,next,x);
    expect(restored).toBeCloseTo(left);
  }
});
it("does not scale page labels and gaps when anchoring between pages",()=>{
  const from=.7,to=2,gapTop=16+24+1123*from+12;
  const next=zoomScrollTop(pages,from,to,gapTop-200,200);
  expect(next+200).toBeCloseTo(16+24+1123*to+12);
});

it("keeps a point on a mixed-size page under the pinch midpoint in a horizontal stack",()=>{
  const landscapePages=[{width:794,height:1123},{width:842,height:612}];
  const pageLeft=(zoom:number)=>horizontalPageLayout(landscapePages,zoom,900)[1].paperLeft;
  const paperCentre=(zoom:number,height:number)=>Math.max(height,1123*zoom+24)/2+12;
  const x=240,y=320,point={x:310,y:280},from=.7,to=2.4;
  const anchor={x,y,zoom:from,distance:200,viewportWidth:900,viewportHeight:600,
    left:pageLeft(from)+200*from-x,top:paperCentre(from,600)-30*from-y};
  const next=horizontalZoomPosition(landscapePages,anchor,to,point,588);
  expect(pageLeft(to)+200*to-next.left).toBeCloseTo(point.x);
  expect(paperCentre(to,588)-30*to-next.top).toBeCloseTo(point.y);
});

it("turns exactly one page per horizontal swipe and ignores short movements",()=>{
  expect(pageAfterSwipe(2,-47,5)).toBe(2);
  expect(pageAfterSwipe(2,-48,5)).toBe(3);
  expect(pageAfterSwipe(2,-1200,5)).toBe(3);
  expect(pageAfterSwipe(2,1200,5)).toBe(1);
  expect(pageAfterSwipe(0,1200,5)).toBe(0);
  expect(pageAfterSwipe(4,-1200,5)).toBe(4);
});

it("settles smooth paging at the exact target despite rounded browser scroll offsets",()=>{
  let time=performance.now(),nextFrame:FrameRequestCallback|undefined,left=0;
  const viewport={
    get scrollLeft(){return left;},set scrollLeft(value:number){left=Math.round(value);},
    scrollTop:0,clientWidth:800,scrollWidth:2400,clientHeight:600,scrollHeight:600,
    addEventListener(){},removeEventListener(){},
  } as unknown as HTMLElement;
  vi.stubGlobal("document",{addEventListener(){},removeEventListener(){}});
  vi.stubGlobal("requestAnimationFrame",(frame:FrameRequestCallback)=>{nextFrame=frame;return 1;});
  vi.stubGlobal("cancelAnimationFrame",()=>{nextFrame=undefined;});
  try{
    const motion=new ScrollMotion(viewport,()=>false,()=>"horizontal");
    motion.easeTo(590,0);
    for(let i=0;i<80&&nextFrame;i++){const frame=nextFrame;nextFrame=undefined;time+=16;frame(time);}
    expect(viewport.scrollLeft).toBe(590);
    expect(nextFrame).toBeUndefined();
    motion.destroy();
  }finally{vi.unstubAllGlobals();}
});


it("reserves a whole viewport for each horizontal page at low zoom, including mixed sizes",()=>{
  const sizes=[{width:794},{width:612},{width:1200}];
  for(const zoom of [.25,.4,.7]){
    const frames=horizontalPageLayout(sizes,zoom,900);
    frames.forEach((frame,i)=>{
      expect(frame.width).toBeGreaterThanOrEqual(900);
      expect(frame.paperLeft).toBeGreaterThanOrEqual(frame.left);
      expect(horizontalPageIndex(frames.map(f=>f.left),frame.left)).toBe(i);
      if(i)expect(frame.left).toBeCloseTo(frames[i-1].left+frames[i-1].width+34);
    });
  }
});
it("keeps the same single page snapped while zooming out and after viewport resizing",()=>{
  const sizes=[{width:794,height:1123},{width:612,height:842},{width:1200,height:1500}];
  const old=horizontalPageLayout(sizes,2,900);
  const anchor={zoom:2,left:old[1].left+100,top:210,x:450,y:300,distance:200,viewportWidth:900,viewportHeight:600};
  for(const viewportWidth of [430,900,1200]){
    const target=horizontalZoomPosition(sizes,anchor,.25,{x:viewportWidth/2,y:300},600,viewportWidth);
    const frames=horizontalPageLayout(sizes,.25,viewportWidth);
    expect(target.left).toBe(frames[1].left);
    expect(frames[0].left+frames[0].width).toBeLessThanOrEqual(target.left);
    expect(frames[2].left).toBeGreaterThanOrEqual(target.left+viewportWidth);
  }
});
it("shrinks optional vertical gutters before a fitting page can overflow",()=>{
  const single=[{height:1123}],height=600,zoom=(height-24-10)/1123;
  const inset=verticalPageInset(single,zoom,height);
  expect(inset).toBe(5);
  expect(inset*2+24+1123*zoom).toBeCloseTo(height);
  expect(verticalPageInset(single,1,height)).toBe(0);
  expect(zoomScrollLeft(794,800,.7,1,0,400)).toBe(0);
});
