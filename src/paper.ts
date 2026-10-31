import { newPage, type Page } from "./model";
import type { PenId, PenSettings } from "./preferences";
export const LIGHT_PAPER = "#fffefa",
  DARK_PAPER = "#1e2822";
export function newPageFrom(previous: Page | undefined, dark: boolean): Page {
  const page = newPage();
  if (!previous) return {...page, paperColor: dark ? DARK_PAPER : LIGHT_PAPER};
  return {...page, width: previous.width, height: previous.height, paper: previous.paper,
    paperColor: pagePaperColor(previous, dark)};
}
export function applyPaperTemplate(pages: Page[], source: Page, dark: boolean): Page[] {
  if (source.pdfIndex !== undefined) return pages;
  const paperColor = pagePaperColor(source, dark);
  return pages.map((page) => page.pdfIndex !== undefined ? page : {...page, paper: source.paper, paperColor});
}
export function isDarkColor(color: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 0.3;
}
export function pagePaperColor(
  page: Pick<Page, "paperColor" | "strokes" | "pdfIndex">,
  dark: boolean,
) {
  if (page.pdfIndex !== undefined) return LIGHT_PAPER;
  if (page.paperColor) return page.paperColor;
  return page.strokes.length ? LIGHT_PAPER : dark ? DARK_PAPER : LIGHT_PAPER;
}
export const darkPenColors: Record<PenId, string> = {
  pen1: "#e3efdf",
  pen2: "#8ec5ff",
  pen3: "#ffa5ad",
  marker: "#e9c968",
};
export const lightPenColors: Record<PenId, string> = {
  pen1: "#243d35",
  pen2: "#376fac",
  pen3: "#bd6263",
  marker: "#bd8d39",
};
export function penColor(settings: PenSettings, id: PenId, dark: boolean) {
  return settings.customColor
    ? settings.color
    : (dark ? darkPenColors : lightPenColors)[id];
}
