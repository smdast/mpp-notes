import type { Page } from "./model";
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
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
