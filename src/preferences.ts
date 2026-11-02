export type PenId = "pen1" | "pen2" | "pen3" | "marker";
export type Theme = "system" | "light" | "dark";
export type PenSettings = {
  dashed?: boolean;
  dotted?: boolean;
  color: string;
  width: number;
  pressure: boolean;
  customColor?: boolean;
};
export type Preferences = {
  scratchErase: boolean;
  eraserMode: "stroke" | "area";
  theme: Theme;
  accent: "green" | "blue" | "rose";
  paperColor: string;
  paperPattern: "blank" | "ruled" | "grid";
  paperImage?: string;
  pens: Record<PenId, PenSettings>;
  activePen: PenId;
  shapeCorrection: boolean;
};
export const defaultPreferences = (): Preferences => ({
  eraserMode: "stroke", scratchErase: false,
  theme: "system", accent: "green", paperColor: "auto", paperPattern: "grid",
  pens: {
    pen1: { color: "#243d35", width: 3, pressure: true },
    pen2: { color: "#376fac", width: 3, pressure: true },
    pen3: { color: "#bd6263", width: 4, pressure: true },
    marker: { color: "#bd8d39", width: 4, pressure: false },
  },
  activePen: "pen1",
  shapeCorrection: true,
});
export function readPreferences(value: unknown): Preferences {
  const base = defaultPreferences();
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<Preferences>;
  if(typeof v.scratchErase === "boolean")base.scratchErase=v.scratchErase;
  if (v.eraserMode === "stroke" || v.eraserMode === "area") base.eraserMode = v.eraserMode;
  if (v.accent && ["green","blue","rose"].includes(v.accent)) base.accent=v.accent;
  if (v.paperColor === "auto" || /^#[0-9a-f]{6}$/i.test(v.paperColor || "")) base.paperColor=v.paperColor!;
  if (v.paperPattern && ["blank","ruled","grid"].includes(v.paperPattern)) base.paperPattern=v.paperPattern;
  if (typeof v.paperImage === "string" && v.paperImage.length < 30000000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.paperImage)) base.paperImage=v.paperImage;
  if (v.theme && ["system", "light", "dark"].includes(v.theme))
    base.theme = v.theme;
  for (const key of Object.keys(base.pens) as PenId[]) {
    const p = v.pens?.[key];
    if (
      p &&
      /^#[\da-f]{6}$/i.test(p.color) &&
      Number.isFinite(p.width) && p.width >= 0.2 && p.width <= 20 &&
      typeof p.pressure === "boolean"
    )
      base.pens[key] = {
        ...p,
        width: Math.round(p.width * 5) / 5,
        dashed: p.dashed === true,
        dotted: p.dotted === true && p.dashed !== true,
        customColor:
          typeof p.customColor === "boolean"
            ? p.customColor
            : p.color !== base.pens[key].color,
      };
  }
  if (v.activePen && v.activePen in base.pens) base.activePen = v.activePen;
  if (typeof v.shapeCorrection === "boolean")
    base.shapeCorrection = v.shapeCorrection;
  return base;
}
export const pressureValue = (value: number, enabled: boolean) =>
  enabled ? Math.max(0.05, Math.min(1, value)) : 0.75 / 0.95;
