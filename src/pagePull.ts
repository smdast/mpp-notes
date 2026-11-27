import {PAGE_GAP,PAGE_LABEL,type ScrollDirection} from "./scrolling";

type Rect={left:number;top:number;right:number;bottom:number;width:number;height:number};
export type PullGeometry={left:number;top:number;width:number;height:number;extent:number;inset:number;travel:number};

// The preview occupies exactly the position the real appended paper will take.
export function nextPaperGeometry(direction:ScrollDirection,viewport:Rect,slot:Rect,paper:Rect):PullGeometry{
  const horizontal=direction==="horizontal";
  const left=horizontal?slot.right-viewport.left+PAGE_GAP+Math.max(0,(slot.width-paper.width)/2):paper.left-viewport.left;
  const top=horizontal?paper.top-viewport.top:slot.bottom-viewport.top+PAGE_GAP+PAGE_LABEL;
  const extent=horizontal?viewport.width:viewport.height;
  const travel=horizontal?Math.max(viewport.width,paper.width)+PAGE_GAP:paper.height+PAGE_LABEL+PAGE_GAP;
  return {left,top,width:paper.width,height:paper.height,extent,inset:Math.max(0,(horizontal?left:top)-extent),travel};
}

export function pagePullOffset(distance:number,geometry:Pick<PullGeometry,"extent"|"inset"|"travel">){
  const progress=Math.max(0,Math.min(1,distance/90));
  // Account for the centred paper's gutter so a small page is still revealed.
  return Math.min(geometry.extent*.85,geometry.travel,Math.max(0,distance)+geometry.inset*progress);
}

export function pagePullHandoff(position:number,before:number,after:number){
  return position+after-before;
}

export type VerticalPullAnchor={y:number;edge:number};
export function advanceVerticalPagePull(anchor:VerticalPullAnchor|null,previousY:number,currentY:number,scrollTop:number,maxScroll:number){
  if(anchor){
    const distance=anchor.y-currentY;
    // Consume the pull before allowing a reversal to scroll back into the note.
    if(distance>0)return {anchor,distance,scrollTop:anchor.edge};
    return {anchor:null,distance:0,scrollTop:Math.max(0,anchor.edge+distance)};
  }
  const edge=Math.max(0,maxScroll),before=Math.max(0,Math.min(edge,scrollTop));
  const delta=previousY-currentY,target=before+delta;
  if(delta>0&&target>edge){
    return {anchor:{y:previousY-(edge-before),edge},distance:target-edge,scrollTop:edge};
  }
  return {anchor:null,distance:0,scrollTop:Math.max(0,Math.min(edge,target))};
}

export function isForeignPointerCaptureLoss(type:string,target:EventTarget,currentTarget:EventTarget,hasCapture:boolean){
  return type==="lostpointercapture"&&(target!==currentTarget||hasCapture);
}
