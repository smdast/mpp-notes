import type { Page } from "./model";
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
export type TouchPosition = {x:number;y:number};
export function touchGeometry(points:TouchPosition[]) {
  // Additional contacts (for example a palm) must not move the pinch centre.
  const pair=points.slice(0,2);
  if(!pair.length)return null;
  return {x:pair.reduce((sum,p)=>sum+p.x,0)/pair.length,y:pair.reduce((sum,p)=>sum+p.y,0)/pair.length,
    distance:pair.length===2?Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y):0};
}
export function zoomScrollLeft(maxPageWidth:number,viewportWidth:number,from:number,to:number,scrollLeft:number,screenX:number,nextViewportWidth=viewportWidth) {
  // Pages are centred inside a stack whose padding does not scale.
  const oldCentre=Math.max(viewportWidth,maxPageWidth*from+96)/2;
  const newCentre=Math.max(nextViewportWidth,maxPageWidth*to+96)/2;
  return newCentre+(scrollLeft+screenX-oldCentre)*to/from-screenX;
}
export type PinchAnchor={zoom:number;left:number;top:number;x:number;y:number;distance:number;viewportWidth:number};
export function pinchViewport(pages:Pick<Page,"height">[],maxPageWidth:number,viewportWidth:number,anchor:PinchAnchor,current:{x:number;y:number;distance:number}) {
  const zoom=clampZoom(anchor.zoom*current.distance/Math.max(1,anchor.distance));
  return {zoom,
    left:zoomScrollLeft(maxPageWidth,anchor.viewportWidth,anchor.zoom,zoom,anchor.left,anchor.x,viewportWidth)+anchor.x-current.x,
    top:zoomScrollTop(pages,anchor.zoom,zoom,anchor.top,anchor.y)+anchor.y-current.y};
}
export function zoomScrollTop(
  pages: Pick<Page, "height">[],
  from: number,
  to: number,
  scrollTop: number,
  screenY: number,
) {
  const anchor = scrollTop + screenY;
  let oldTop = 16,
    newTop = 16;
  for (const page of pages) {
    const oldBottom = oldTop + 24 + page.height * from;
    if (anchor < oldBottom + 34) {
      const local = anchor - oldTop;
      const converted =
        local <= 24
          ? local
          : local <= 24 + page.height * from
            ? 24 + ((local - 24) * to) / from
            : 24 + page.height * to + (local - 24 - page.height * from);
      return Math.max(0, newTop + converted - screenY);
    }
    oldTop = oldBottom + 34;
    newTop += 24 + page.height * to + 34;
  }
  return Math.max(0, newTop + (anchor - oldTop) - screenY);
}
