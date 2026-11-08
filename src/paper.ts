import { newPage, type Page } from "./model";
import {penKind} from "./preferences";
import type { AutoPenColor, BuiltinPenId, PenId, PenSettings } from "./preferences";
export const LIGHT_PAPER = "#fffefa",
  DARK_PAPER = "#1e2822";
export function newPageFrom(previous: Page | undefined, dark: boolean): Page {
  const page = newPage();
  if (!previous) return {...page, paperColor: dark ? DARK_PAPER : LIGHT_PAPER};
  return {...page, width: previous.width, height: previous.height, paper: previous.paper,
    paperColor: pagePaperColor(previous, dark), backgroundImage: previous.pdfIndex === undefined ? previous.backgroundImage : undefined};
}
export function applyPaperTemplate(pages: Page[], source: Page, dark: boolean): Page[] {
  if (source.pdfIndex !== undefined) return pages;
  const paperColor = pagePaperColor(source, dark);
  return pages.map((page) => page.pdfIndex !== undefined ? page : {...page, paper: source.paper, paperColor, backgroundImage: source.backgroundImage});
}
export function isDarkColor(color: string) {
  const [red,green,blue]=colorChannels(color);
  return isDarkRgb(red,green,blue);
}
function colorChannels(color:string){
  return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
}
function isDarkRgb(red:number,green:number,blue:number){
  const rgb = [red,green,blue].map(channel=>{
    const v=channel/255;
    return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
  });
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
export const darkPenColors: Record<BuiltinPenId, string> = {
  pen1: "#e3efdf",
  pen2: "#8ec5ff",
  pen3: "#ffa5ad",
  marker: "#e9c968",
};
export const lightPenColors: Record<BuiltinPenId, string> = {
  pen1: "#243d35",
  pen2: "#376fac",
  pen3: "#bd6263",
  marker: "#bd8d39",
};
export function penColor(settings: PenSettings, id: PenId, dark: boolean) {
  if(settings.autoColor?.enabled)return dark?settings.autoColor.onDark:settings.autoColor.onLight;
  if(settings.customColor)return settings.color;
  const preset=defaultAutoPenColor(settings,id);
  return dark?preset.onDark:preset.onLight;
}
export function defaultAutoPenColor(settings:PenSettings,id:PenId):AutoPenColor {
  const keys=Object.keys(lightPenColors) as BuiltinPenId[];
  const auto=keys.find(key=>key===id)||keys.find(key=>lightPenColors[key]===settings.color)||(penKind(id,settings)==="marker"?"marker":"pen1");
  return {enabled:false,onLight:lightPenColors[auto],onDark:darkPenColors[auto]};
}

export function strokeStartColor(
  colors:AutoPenColor,
  canvas:HTMLCanvasElement|null,
  point:{x:number;y:number},
  page:Pick<Page,"width"|"height">,
  paperColor:string,
) {
  let dark=isDarkColor(paperColor);
  const ctx=canvas?.getContext("2d");
  if(canvas?.width&&canvas.height&&ctx){
    const x=Math.max(0,Math.min(canvas.width-1,Math.floor(point.x*canvas.width/page.width)));
    const y=Math.max(0,Math.min(canvas.height-1,Math.floor(point.y*canvas.height/page.height)));
    const [r,g,b,alpha]=ctx.getImageData(x,y,1,1).data;
    const coverage=alpha/255;
    const [pr,pg,pb]=colorChannels(paperColor);
    dark=isDarkRgb(r*coverage+pr*(1-coverage),g*coverage+pg*(1-coverage),b*coverage+pb*(1-coverage));
  }
  return dark?colors.onDark:colors.onLight;
}
