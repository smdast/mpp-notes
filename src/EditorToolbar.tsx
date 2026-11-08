import {useState,useRef,useEffect,useLayoutEffect} from "react";
import {createPortal} from "react-dom";
import {useDismiss} from "./useDismiss";
import { ClipboardPaste, Undo2, Redo2, PenLine, Highlighter, Eraser, Lasso, Hand, Plus, Gauge, Shapes, X, ScanLine, Trash2, Contrast } from "lucide-react";
import type {LucideIcon} from "lucide-react";
import type { Tool } from "./Sheet";
import type { EraserMode } from "./editing";
import { defaultAutoPenColor, penColor } from "./paper";
import {shortcutTitle} from "./shortcuts";
import {penIds} from "./preferences";
import type { Preferences, PenId, PenKind, PenSettings } from "./preferences";
type Props = {
  tool: Tool; preferences: Preferences; dark: boolean; color: string; colors: string[];
  eraserMode: EraserMode; eraserSize: number; canUndo: boolean; canRedo: boolean;
  onUndo: (redo?: boolean) => void; onTool: (tool: Tool) => void; onPen: (id: PenId) => void; onAddPen:(kind:PenKind)=>PenId;
  onSettings: (settings: Partial<PenSettings>) => void; onColor: (color: string) => void;
  onEraserMode: (mode: EraserMode) => void; onEraserSize: (size: number) => void;
  onScratchErase:(enabled:boolean)=>void;
  onDeletePen:()=>void;
};
export function EditorToolbar(props: Props) {
  const {tool, preferences, color, colors, dark} = props;
  const settings = preferences.pens[preferences.activePen];
  const autoColor=settings.autoColor??defaultAutoPenColor(settings,preferences.activePen);
  const drawing = tool === "pen" || tool === "marker";
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:12,top:100});
  const panel=useRef<HTMLDivElement>(null),anchor=useRef<HTMLButtonElement|null>(null);
  useDismiss(open,[panel,anchor],()=>setOpen(false),true);
  const root=useRef<HTMLDivElement>(null),pendingNew=useRef<PenId|null>(null);
  useEffect(()=>{
    if(pendingNew.current===preferences.activePen){
      const button=root.current?.querySelector<HTMLButtonElement>(`[data-pen-id="${preferences.activePen}"]`);
      if(button){anchor.current=button;button.scrollIntoView({block:"nearest",inline:"nearest"});setOpen(true);button.focus({preventScroll:true});}
      pendingNew.current=null;
    }else setOpen(false);
  },[tool,preferences.activePen]);
  useLayoutEffect(()=>{
    if(!open)return;
    const update=()=>{const r=anchor.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(12,Math.min(innerWidth-Math.min(304,innerWidth-24)-12,r.left)),top:r.bottom+12});};
    update();window.addEventListener("resize",update);window.addEventListener("scroll",update,true);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true);};
  },[open]);
  const style = settings.dashed ? "dashed" : settings.dotted ? "dotted" : "solid";
  return <div ref={root} className="toolbar editor-toolbar">
    <div className="history-tools" role="group" aria-label="編集操作">
      <button className="tool" title={shortcutTitle("元に戻す",preferences.shortcuts,"undo")} aria-label={shortcutTitle("元に戻す",preferences.shortcuts,"undo")} disabled={!props.canUndo} onClick={() => props.onUndo()}><Undo2 size={18}/></button>
      <button className="tool" title={shortcutTitle("やり直し",preferences.shortcuts,"redo")} aria-label={shortcutTitle("やり直し",preferences.shortcuts,"redo")} disabled={!props.canRedo} onClick={() => props.onUndo(true)}><Redo2 size={18}/></button>
      <button className="tool" title={shortcutTitle("貼り付け",preferences.shortcuts,"paste")} aria-label="貼り付け" onClick={() => window.dispatchEvent(new Event("mpp-paste"))}><ClipboardPaste size={18}/></button>
    </div>
    <div className="toolbar-content">
      <div className="tool-picker">
        {(["pen","marker"] as PenKind[]).map(kind=><div className="tool-group pen-presets pen-family" role="group" aria-label={kind==="pen"?"ペン":"蛍光ペン"} key={kind}>
          {penIds(preferences,kind).map((id,i)=>{
            const label=`${kind==="marker"?"蛍光ペン":"ペン"}${i+1}`;
            return <button key={id} data-pen-id={id} className={"tool pen-preset "+(drawing&&preferences.activePen===id?"active":"")}
              aria-label={label} aria-pressed={drawing&&preferences.activePen===id} title={label}
              aria-expanded={drawing&&preferences.activePen===id&&open} aria-controls="tool-settings"
              onClick={e=>{anchor.current=e.currentTarget;if(drawing&&preferences.activePen===id)setOpen(v=>!v);else{setOpen(false);props.onPen(id);}}}
              style={{color:penColor(preferences.pens[id],id,dark)}}>
              {kind==="marker"?<Highlighter size={19}/>:<PenLine size={19}/>}<small>{i+1}</small>
            </button>;
          })}
          <button className="tool add-pen" aria-label={kind==="pen"?"ペンを追加":"蛍光ペンを追加"} title={kind==="pen"?"ペンを追加":"蛍光ペンを追加"} onClick={()=>{pendingNew.current=props.onAddPen(kind);setOpen(false);}}><Plus size={17}/></button>
        </div>)}
        <div className="tool-group">
          {([{id:"eraser",label:shortcutTitle("消しゴム",preferences.shortcuts,"eraser"),Icon:Eraser},{id:"lasso",label:shortcutTitle("なげなわ選択",preferences.shortcuts,"lasso"),Icon:Lasso},{id:"hand",label:shortcutTitle("移動",preferences.shortcuts,"hand"),Icon:Hand}] as const).map(({id,label,Icon}) =>
            <button key={id} className={"tool " + (tool === id ? "active" : "")} aria-label={label} aria-pressed={tool === id} title={label} aria-expanded={id === "eraser" ? tool === id && open : undefined} aria-controls={id === "eraser" ? "tool-settings" : undefined} onClick={e => {anchor.current=e.currentTarget;if(id === "eraser" && tool === id)setOpen(v=>!v);else{setOpen(false);props.onTool(id);}}}><Icon size={19}/></button>)}
        </div>
      </div>
      {open && (drawing || tool === "eraser") && createPortal(<div ref={panel} id="tool-settings" role="dialog" aria-label={drawing?(tool==="marker"?"蛍光ペンの設定":"ペンの設定"):"消しゴムの設定"} className="tool-settings-popover" style={{...position,maxHeight:`calc(100dvh - ${position.top+12}px)`}}>
        <header><strong>{drawing?(tool==="marker"?"蛍光ペンの設定":"ペンの設定"):"消しゴムの設定"}</strong><button aria-label="ツール設定を閉じる" onClick={()=>{setOpen(false);anchor.current?.focus();}}><X size={18}/></button></header>
      {drawing && <div className="context-controls" aria-label="ペンの設定">
        <SettingSwitch label="自動切り替え" Icon={Contrast} checked={autoColor.enabled} onChange={enabled=>props.onSettings({autoColor:{...autoColor,enabled}})}/>
        {autoColor.enabled?<div className="auto-pen-colors" role="group" aria-label="背景別のペン色">
          {(["onLight","onDark"] as const).map(key=><label key={key}>{key==="onLight"?"明るい背景":"暗い背景"}<input type="color" value={autoColor[key]} onInput={e=>props.onSettings({autoColor:{...autoColor,[key]:e.currentTarget.value}})}/></label>)}
        </div>:<div className="colors">
          {colors.map((c) => <button key={c} title={`色 ${c}`} aria-pressed={color === c} className={"swatch " + (color === c ? "chosen" : "")} style={{"--swatch":c} as React.CSSProperties} onClick={() => props.onColor(c)}/>)}
          <label className="custom-color" title="色を選ぶ"><Plus size={13}/><input type="color" aria-label="カスタム色" value={color} onChange={(e) => props.onColor(e.target.value)}/></label>
        </div>}
        <label className="size-slider pen-size-slider"><span>太さ</span><input type="range" aria-label="線の太さ" min={1} max={100} step={1} value={Math.round(settings.width * 5)} onChange={(e) => props.onSettings({width:Number(e.target.value) / 5})}/><output>{Math.round(settings.width * 5)}</output></label>
        <div className="line-styles" role="group" aria-label="線の種類">
          {([{id:"solid",label:"実線"},{id:"dotted",label:"点線"},{id:"dashed",label:"破線"}] as const).map(({id,label}) =>
            <button key={id} title={label} aria-label={label} aria-pressed={style === id} onClick={() => props.onSettings({dotted:id === "dotted",dashed:id === "dashed"})}>
              <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true"><path d="M3 6H41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={id === "dotted" ? "0.1 6" : id === "dashed" ? "9 6" : undefined}/></svg><span>{label}</span>
            </button>)}
        </div>
        <SettingSwitch label="筆圧検知" text="筆圧" Icon={Gauge} checked={settings.pressure} onChange={pressure=>props.onSettings({pressure})}/>
        <SettingSwitch label="図形補正" hint="補正までの時間は操作設定で変更できます" Icon={Shapes} checked={settings.shapeCorrection!==false} onChange={shapeCorrection=>props.onSettings({shapeCorrection})}/>
        {tool === "pen" && <SettingSwitch label="こすって消去" Icon={ScanLine} checked={preferences.scratchErase} onChange={props.onScratchErase}/>}
        <button className="delete-pen" disabled={penIds(preferences,"pen").length+penIds(preferences,"marker").length<=1} title={penIds(preferences,"pen").length+penIds(preferences,"marker").length<=1?"最後の1本は削除できません":undefined} onClick={()=>{setOpen(false);props.onDeletePen();}}><Trash2 size={16}/>{tool==="marker"?"蛍光ペンを削除":"ペンを削除"}</button>
      </div>}
      {tool === "eraser" && <div className="context-controls eraser-options" aria-label="消しゴムの設定">
        <div className="eraser-modes" role="group" aria-label="消しゴムの種類">
          <button aria-pressed={props.eraserMode === "stroke"} onClick={() => props.onEraserMode("stroke")}>ストローク</button>
          <button aria-pressed={props.eraserMode === "area"} onClick={() => props.onEraserMode("area")}>エリア</button>
        </div>
        <label className="size-slider"><span>大きさ</span><input type="range" aria-label="消しゴムのサイズ" min={1} max={120} step={1} value={props.eraserSize} onChange={(e) => props.onEraserSize(Number(e.target.value))}/><output>{props.eraserSize} px</output></label>
      </div>}
      </div>,document.body)}
    </div>
  </div>;
}

function SettingSwitch({label,text=label,hint,Icon,checked,onChange}:{label:string;text?:string;hint?:string;Icon:LucideIcon;checked:boolean;onChange:(value:boolean)=>void}){
 return <label className="setting-switch" title={hint}><span><Icon size={17} aria-hidden="true"/>{text}</span><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={e=>onChange(e.target.checked)}/><span className="switch-track" aria-hidden="true"/></label>;
}
