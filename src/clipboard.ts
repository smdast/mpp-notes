import { uid, type Stroke, type Page } from "./model";
import { validStroke } from "./backup";
import { moveSelection, selectionBounds } from "./editing";
export const CLIPBOARD_FORMAT = "mpp-notes-strokes";
let localCopy = "";
export function encodeStrokes(strokes: Stroke[]) {
  return JSON.stringify({format: CLIPBOARD_FORMAT, version: 1, strokes});
}
export function decodeStrokes(text: string): Stroke[] | null {
  if (text.length > 40_000_000) return null;
  try {
    const data = JSON.parse(text);
    if (data.format !== CLIPBOARD_FORMAT || data.version !== 1 || !Array.isArray(data.strokes) ||
      !data.strokes.length || data.strokes.length > 10000 || !data.strokes.every(validStroke)) return null;
    return data.strokes;
  } catch { return null; }
}
export function rememberStrokes(strokes: Stroke[]) {
  localCopy = encodeStrokes(strokes);
  return localCopy;
}
export function localStrokes() { return decodeStrokes(localCopy); }
export function cloneStrokes(strokes: Stroke[], page: Pick<Page, "width" | "height">, center = false) {
  const clones = strokes.map((s) => ({...s, id: uid(), points: s.points.map((p) => ({...p}))}));
  const ids = new Set(clones.map((s) => s.id));
  const bounds = selectionBounds(clones, ids);
  if (!bounds) return clones;
  let dx = 20, dy = 20;
  if (center || bounds.left > page.width || bounds.top > page.height || bounds.right < 0 || bounds.bottom < 0) {
    dx = (page.width - (bounds.right - bounds.left)) / 2 - bounds.left;
    dy = (page.height - (bounds.bottom - bounds.top)) / 2 - bounds.top;
  } else {
    dx = Math.max(-bounds.left, Math.min(dx, page.width - bounds.right));
    dy = Math.max(-bounds.top, Math.min(dy, page.height - bounds.bottom));
  }
  return moveSelection(clones, ids, dx, dy);
}
export function editableTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']");
}
