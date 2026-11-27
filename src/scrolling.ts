import type { Page } from "./model";
export type ScrollDirection = "vertical" | "horizontal";
export const PAGE_START = 16, PAGE_LABEL = 24, PAGE_GAP = 34;
export const PAGE_SWIPE_THRESHOLD=48;
export function pageAfterSwipe(start:number,deltaX:number,pageCount:number){
  const offset=Math.abs(deltaX)>=PAGE_SWIPE_THRESHOLD?-Math.sign(deltaX):0;
  return Math.max(0,Math.min(pageCount-1,start+offset));
}
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
type PageSize=Pick<Page,"width"|"height">;
export function verticalPageInset(pages:Pick<Page,"height">[],zoom:number,viewportHeight=0){
  if(!viewportHeight)return PAGE_START;
  const content=pages.reduce((sum,p)=>sum+p.height*zoom+PAGE_LABEL,0)+Math.max(0,pages.length-1)*PAGE_GAP;
  return Math.min(PAGE_START,Math.max(0,(viewportHeight-content)/2));
}
export function horizontalPageLayout(pages:Pick<Page,"width">[],zoom:number,viewportWidth:number){
  let left=0;
  return pages.map(page=>{
    const width=Math.max(viewportWidth,page.width*zoom);
    const frame={left,width,paperLeft:left+(width-page.width*zoom)/2};
    left+=width+PAGE_GAP;
    return frame;
  });
}
export function horizontalPageIndex(starts:number[],left:number){
  const next=starts.findIndex(start=>start>left+2);
  return next<0?starts.length-1:Math.max(0,next-1);
}
export type TouchPosition = {x:number;y:number};
export function touchGeometry(points:TouchPosition[]) {
  // Additional contacts (for example a palm) must not move the pinch centre.
  const pair=points.slice(0,2);
  if(!pair.length)return null;
  return {x:pair.reduce((sum,p)=>sum+p.x,0)/pair.length,y:pair.reduce((sum,p)=>sum+p.y,0)/pair.length,
    distance:pair.length===2?Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y):0};
}
export function zoomScrollLeft(maxPageWidth:number,viewportWidth:number,from:number,to:number,scrollLeft:number,screenX:number,nextViewportWidth=viewportWidth,padding=0) {
  // Pages are centred inside a stack whose padding does not scale.
  const oldCentre=Math.max(viewportWidth,maxPageWidth*from+padding)/2;
  const newCentre=Math.max(nextViewportWidth,maxPageWidth*to+padding)/2;
  return newCentre+(scrollLeft+screenX-oldCentre)*to/from-screenX;
}
export type PinchAnchor={zoom:number;left:number;top:number;x:number;y:number;distance:number;viewportWidth:number;viewportHeight?:number};
export function pinchViewport(pages:Pick<Page,"height">[],maxPageWidth:number,viewportWidth:number,anchor:PinchAnchor,current:{x:number;y:number;distance:number},viewportHeight=anchor.viewportHeight??0) {
  const zoom=clampZoom(anchor.zoom*current.distance/Math.max(1,anchor.distance));
  return {zoom,
    left:zoomScrollLeft(maxPageWidth,anchor.viewportWidth,anchor.zoom,zoom,anchor.left,anchor.x,viewportWidth)+anchor.x-current.x,
    top:zoomScrollTop(pages,anchor.zoom,zoom,anchor.top,anchor.y,PAGE_LABEL,current.y,
      verticalPageInset(pages,anchor.zoom,anchor.viewportHeight),verticalPageInset(pages,zoom,viewportHeight))};
}
export function zoomScrollTop(
  pages: Pick<Page, "height">[],
  from: number,
  to: number,
  scrollTop: number,
  screenY: number,
  label=PAGE_LABEL,
  nextScreenY=screenY,
  fromStart=PAGE_START,
  toStart=PAGE_START,
) {
  const anchor = scrollTop + screenY;
  let oldTop = fromStart,
    newTop = toStart;
  for (const page of pages) {
    const oldBottom = oldTop + label + page.height * from;
    if (anchor < oldBottom + PAGE_GAP) {
      const local = anchor - oldTop;
      const converted =
        local <= label
          ? local
          : local <= label + page.height * from
            ? label + ((local - label) * to) / from
            : label + page.height * to + (local - label - page.height * from);
      return Math.max(0, newTop + converted - nextScreenY);
    }
    oldTop = oldBottom + PAGE_GAP;
    newTop += label + page.height * to + PAGE_GAP;
  }
  return Math.max(0, newTop + (anchor - oldTop) - nextScreenY);
}

export function horizontalZoomPosition(
  pages:PageSize[],
  anchor:PinchAnchor,
  zoom:number,
  point:TouchPosition,
  viewportHeight:number,
  viewportWidth=anchor.viewportWidth,
) {
  const oldFrames=horizontalPageLayout(pages,anchor.zoom,anchor.viewportWidth);
  const frames=horizontalPageLayout(pages,zoom,viewportWidth);
  const index=horizontalPageIndex(oldFrames.map(p=>p.left),anchor.left+anchor.viewportWidth/2);
  const old=oldFrames[index],next=frames[index];
  if(!old||!next)return {left:0,top:0};
  const maxHeight=Math.max(...pages.map(p=>p.height));
  return {
    // A fitting page occupies the whole viewport, even at the lowest zoom.
    left:pages[index].width*zoom<=viewportWidth?next.left:
      Math.max(next.left,Math.min(next.left+next.width-viewportWidth,
        next.paperLeft+(anchor.left+anchor.x-old.paperLeft)*zoom/anchor.zoom-point.x)),
    top:zoomScrollLeft(maxHeight,anchor.viewportHeight??viewportHeight,anchor.zoom,zoom,anchor.top,anchor.y-PAGE_LABEL/2,viewportHeight,PAGE_LABEL)+anchor.y-point.y,
  };
}
