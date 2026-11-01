import { ClipboardPaste, Undo2, Redo2, PenLine, Highlighter, Eraser, Lasso, Hand, Plus, Gauge, Shapes, MousePointer2 } from "lucide-react";
import type { Tool } from "./Sheet";
import type { EraserMode } from "./editing";
import { penColor } from "./paper";
import type { Preferences, PenId, PenSettings } from "./preferences";
type Props = {
  tool: Tool; preferences: Preferences; dark: boolean; color: string; colors: string[];
  eraserMode: EraserMode; eraserSize: number; mouse: boolean; canUndo: boolean; canRedo: boolean;
  onUndo: (redo?: boolean) => void; onTool: (tool: Tool) => void; onPen: (id: PenId) => void;
  onSettings: (settings: Partial<PenSettings>) => void; onColor: (color: string) => void;
  onEraserMode: (mode: EraserMode) => void; onEraserSize: (size: number) => void;
  onMouse: (mouse: boolean) => void; onShapeCorrection: (enabled: boolean) => void;
};
export function EditorToolbar(props: Props) {
  const {tool, preferences, color, colors, dark} = props;
  const settings = preferences.pens[preferences.activePen];
  const drawing = tool === "pen" || tool === "marker";
  const style = settings.dashed ? "dashed" : settings.dotted ? "dotted" : "solid";
  return <div className="toolbar editor-toolbar">
    <div className="history-tools" role="group" aria-label="編集操作">
      <button className="tool" title="元に戻す (Ctrl+Z)" aria-label="元に戻す (Ctrl+Z)" disabled={!props.canUndo} onClick={() => props.onUndo()}><Undo2 size={18}/></button>
      <button className="tool" title="やり直し (Ctrl+Shift+Z)" aria-label="やり直し (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={() => props.onUndo(true)}><Redo2 size={18}/></button>
      <button className="tool" title="貼り付け (Ctrl+V)" aria-label="貼り付け" onClick={() => window.dispatchEvent(new Event("mpp-paste"))}><ClipboardPaste size={18}/></button>
    </div>
    <div className="toolbar-content">
      <div className="tool-picker">
        <div className="tool-group pen-presets">
          {(["pen1","pen2","pen3","marker"] as PenId[]).map((id,i) => {
            const label=id === "marker" ? "蛍光ペン (H)" : `ペン${i+1}`;
            return <button key={id} className={"tool pen-preset " + (drawing && preferences.activePen === id ? "active" : "")}
              aria-label={label} aria-pressed={drawing && preferences.activePen === id} title={label}
              onClick={() => props.onPen(id)} style={{color:penColor(preferences.pens[id],id,dark)}}>
              {id === "marker" ? <Highlighter size={19}/> : <PenLine size={19}/>}
              <small>{id === "marker" ? "" : i+1}</small>
            </button>;
          })}
        </div>
        <div className="tool-group">
          {([{id:"eraser",label:"消しゴム (E)",Icon:Eraser},{id:"lasso",label:"なげなわ選択 (L)",Icon:Lasso},{id:"hand",label:"移動 (V)",Icon:Hand}] as const).map(({id,label,Icon}) =>
            <button key={id} className={"tool " + (tool === id ? "active" : "")} aria-label={label} aria-pressed={tool === id} title={label} onClick={() => props.onTool(id)}><Icon size={19}/></button>)}
        </div>
      </div>
      {drawing && <div className="context-controls" aria-label="ペンの設定">
        <div className="colors">
          {colors.map((c) => <button key={c} title={`色 ${c}`} aria-pressed={color === c} className={"swatch " + (color === c ? "chosen" : "")} style={{"--swatch":c} as React.CSSProperties} onClick={() => props.onColor(c)}/>)}
          <label className="custom-color" title="色を選ぶ"><Plus size={13}/><input type="color" aria-label="カスタム色" value={color} onChange={(e) => props.onColor(e.target.value)}/></label>
        </div>
        <label className="size-slider pen-size-slider">太さ<input type="range" aria-label="線の太さ" min={1} max={100} step={1} value={Math.round(settings.width * 5)} onChange={(e) => props.onSettings({width:Number(e.target.value) / 5})}/><output>{Math.round(settings.width * 5)}</output></label>
        <div className="line-styles" role="group" aria-label="線の種類">
          {([{id:"solid",label:"実線"},{id:"dotted",label:"点線"},{id:"dashed",label:"破線"}] as const).map(({id,label}) =>
            <button key={id} title={label} aria-label={label} aria-pressed={style === id} onClick={() => props.onSettings({dotted:id === "dotted",dashed:id === "dashed"})}>
              <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true"><path d="M3 6H41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={id === "dotted" ? "0.1 6" : id === "dashed" ? "9 6" : undefined}/></svg><span>{label}</span>
            </button>)}
        </div>
        <label className="setting-toggle"><input type="checkbox" aria-label="筆圧検知" checked={settings.pressure} onChange={(e) => props.onSettings({pressure:e.target.checked})}/><Gauge size={15} aria-hidden="true"/>筆圧</label>
        <label className="setting-toggle"><input type="checkbox" aria-label="図形補正" checked={preferences.shapeCorrection} onChange={(e) => props.onShapeCorrection(e.target.checked)}/><Shapes size={15} aria-hidden="true"/>図形補正</label>
      </div>}
      {tool === "eraser" && <div className="context-controls eraser-options" aria-label="消しゴムの設定">
        <div className="eraser-modes" role="group" aria-label="消しゴムの種類">
          <button aria-pressed={props.eraserMode === "stroke"} onClick={() => props.onEraserMode("stroke")}>ストローク</button>
          <button aria-pressed={props.eraserMode === "area"} onClick={() => props.onEraserMode("area")}>エリア</button>
        </div>
        <label className="size-slider">大きさ<input type="range" aria-label="消しゴムのサイズ" min={1} max={120} step={1} value={props.eraserSize} onChange={(e) => props.onEraserSize(Number(e.target.value))}/><output>{props.eraserSize} px</output></label>
      </div>}
      {(drawing || tool === "eraser") && <label className="mouse-toggle"><input type="checkbox" aria-label="マウスでも描画" checked={props.mouse} onChange={(e) => props.onMouse(e.target.checked)}/><MousePointer2 size={15} aria-hidden="true"/><span>マウスでも描画</span></label>}
    </div>
  </div>;
}
