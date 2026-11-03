export type BuiltinPenId = "pen1" | "pen2" | "pen3" | "marker";
export type PenId = BuiltinPenId | `custom-${string}`;
export type PenKind = "pen" | "marker";
export type Theme = "system" | "light" | "dark";
export type PenSettings = {
  kind?:PenKind;
  shapeCorrection?:boolean;
  dashed?: boolean;
  dotted?: boolean;
  color: string;
  width: number;
  pressure: boolean;
  customColor?: boolean;
};
export type Preferences = {
  deletedPens?: BuiltinPenId[];
  scratchErase: boolean;
  pagesCollapsed:boolean;
  eraserMode: "stroke" | "area";
  theme: Theme;
  accent: "green" | "blue" | "rose";
  paperColor: string;
  paperPattern: "blank" | "ruled" | "grid";
  paperImage?: string;
  pens: Record<PenId, PenSettings>;
  activePen: PenId;
};
export const defaultPreferences = (): Preferences => ({
  eraserMode: "stroke", scratchErase: false, pagesCollapsed:false,
  theme: "system", accent: "green", paperColor: "auto", paperPattern: "grid",
  pens: {
    pen1: { color: "#243d35", width: 3, pressure: true, kind:"pen", shapeCorrection:true },
    pen2: { color: "#376fac", width: 3, pressure: true, kind:"pen", shapeCorrection:true },
    pen3: { color: "#bd6263", width: 4, pressure: true, kind:"pen", shapeCorrection:true },
    marker: { color: "#bd8d39", width: 4, pressure: false, kind:"marker", shapeCorrection:true },
  },
  activePen: "pen1",
});
export function readPreferences(value: unknown): Preferences {
  const base = defaultPreferences();
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<Preferences> & {shapeCorrection?:boolean};
  const legacyCorrection=typeof v.shapeCorrection === "boolean"?v.shapeCorrection:true;
  for(const p of Object.values(base.pens))p.shapeCorrection=legacyCorrection;
  if(typeof v.pagesCollapsed === "boolean")base.pagesCollapsed=v.pagesCollapsed;
  if(typeof v.scratchErase === "boolean")base.scratchErase=v.scratchErase;
  if (v.eraserMode === "stroke" || v.eraserMode === "area") base.eraserMode = v.eraserMode;
  if (v.accent && ["green","blue","rose"].includes(v.accent)) base.accent=v.accent;
  if (v.paperColor === "auto" || /^#[0-9a-f]{6}$/i.test(v.paperColor || "")) base.paperColor=v.paperColor!;
  if (v.paperPattern && ["blank","ruled","grid"].includes(v.paperPattern)) base.paperPattern=v.paperPattern;
  if (typeof v.paperImage === "string" && v.paperImage.length < 30000000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.paperImage)) base.paperImage=v.paperImage;
  if (v.theme && ["system", "light", "dark"].includes(v.theme))
    base.theme = v.theme;
  for (const [raw,p] of Object.entries(v.pens || {})) {
    if(!isPenId(raw) || !p || typeof p!=="object")continue;
    const key=raw;
    if(key.startsWith("custom-") && p.kind!=="pen" && p.kind!=="marker")continue;
    if (/^#[\da-f]{6}$/i.test(p.color) && Number.isFinite(p.width) && p.width >= 0.2 && p.width <= 20 && typeof p.pressure === "boolean") {
      const kind=penKind(key,p),fallback=base.pens[key]||base.pens[kind==="marker"?"marker":"pen1"];
      base.pens[key] = {
        color:p.color,pressure:p.pressure,kind,
        width: Math.round(p.width * 5) / 5,
        shapeCorrection:typeof p.shapeCorrection === "boolean"?p.shapeCorrection:legacyCorrection,
        dashed: p.dashed === true,
        dotted: p.dotted === true && p.dashed !== true,
        customColor:typeof p.customColor === "boolean"?p.customColor:p.color!==fallback.color,
      };
    }
  }
  if(Array.isArray(v.deletedPens))base.deletedPens=[...new Set(v.deletedPens.filter(id=>["pen1","pen2","pen3","marker"].includes(id)))];
  let available=[...penIds(base,"pen"),...penIds(base,"marker")];
  if(!available.length){base.deletedPens=base.deletedPens?.filter(id=>id!=="pen1");available=["pen1"];}
  base.activePen=isPenId(v.activePen)&&available.includes(v.activePen)?v.activePen:available[0];
  return base;
}
export const pressureValue = (value: number, enabled: boolean) =>
  enabled ? Math.max(0.05, Math.min(1, value)) : 0.75 / 0.95;

export function isPenId(value:unknown):value is PenId {
 return typeof value === "string" && (["pen1","pen2","pen3","marker"].includes(value)||/^custom-[a-z0-9-]{1,80}$/i.test(value));
}
export function penKind(id:PenId,settings:PenSettings):PenKind {
 return id==="marker" || (id.startsWith("custom-")&&settings.kind==="marker")?"marker":"pen";
}
export function penIds(value:Preferences,kind:PenKind):PenId[]{
 return (Object.keys(value.pens) as PenId[]).filter(id=>!value.deletedPens?.includes(id as BuiltinPenId)&&penKind(id,value.pens[id])===kind);
}
export function addPen(value:Preferences,kind:PenKind,id:PenId=`custom-${crypto.randomUUID()}`):Preferences {
 if(!isPenId(id)||!id.startsWith("custom-")||Object.hasOwn(value.pens,id))throw new Error("ペンを追加できませんでした。");
 const source=(penKind(value.activePen,value.pens[value.activePen])===kind?value.pens[value.activePen]:value.pens[penIds(value,kind)[0]])||defaultPreferences().pens[kind==="marker"?"marker":"pen1"];
 return {...value,activePen:id,pens:{...value.pens,[id]:{...source,kind,shapeCorrection:source.shapeCorrection!==false,customColor:source.customColor===true}}};
}
export function deletePen(value:Preferences,id:PenId):Preferences {
 const available=[...penIds(value,"pen"),...penIds(value,"marker")];
 if(!available.includes(id)||available.length<=1)return value;
 const kind=penKind(id,value.pens[id]),pens={...value.pens};
 let deletedPens=value.deletedPens;
 if(id.startsWith("custom-"))delete pens[id];
 else deletedPens=[...(deletedPens||[]),id as BuiltinPenId];
 const next={...value,pens,deletedPens};
 if(value.activePen===id)next.activePen=penIds(next,kind)[0]||available.find(key=>key!==id)!;
 return next;
}
