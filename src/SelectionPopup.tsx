import {useDismiss} from "./useDismiss";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Copy, Scissors, CopyPlus, RotateCw, Trash2, Palette } from "lucide-react";
import {LineStylePicker} from "./LineStylePicker";
import {lineStyle,strokeSize,type LineStyle,type StrokeStylePatch} from "./strokeStyle";
import type {Stroke} from "./model";
type Bounds = {left: number; top: number; right: number; bottom: number};
export function SelectionPopup({canvas, bounds, zoom, onCopy, onCut, onDuplicate, onRotate, onDelete, onDismiss, strokes, onStyle}: {
  canvas: RefObject<HTMLCanvasElement | null>; bounds: Bounds; zoom: number;
  onDismiss:()=>void;
  strokes:Stroke[]; onStyle:(patch:StrokeStylePatch)=>void;
  onCopy: () => void; onCut: () => void; onDuplicate: () => void;
  onRotate: () => void; onDelete: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null),styleButton=useRef<HTMLButtonElement>(null);
  const [editing,setEditing]=useState(false);
  const restoreFocus=useRef(false);
  function closeStyle(){
    restoreFocus.current=true;
    setEditing(false);
  }
  useLayoutEffect(()=>{
    if(!editing&&restoreFocus.current){
      restoreFocus.current=false;
      styleButton.current?.focus({preventScroll:true});
    }
  },[editing]);
  useDismiss(true,[popup],onDismiss);
  const [position, setPosition] = useState({left: 0, top: 0, maxHeight: 0, visible: false});
  useLayoutEffect(() => {
    const update = () => {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect || !popup.current) return;
      const {width, height} = popup.current.getBoundingClientRect();
      const viewport = canvas.current?.closest(".viewport")?.getBoundingClientRect();
      const minY = Math.max(8, viewport?.top ?? 8);
      const maxY = Math.min(window.innerHeight - 8, viewport?.bottom ?? window.innerHeight - 8);
      const maxHeight=Math.max(0,maxY-minY);
      const panelHeight=editing?Math.min(height,maxHeight):height;
      const top = rect.top + bounds.top * zoom, bottom = rect.top + bounds.bottom * zoom;
      const left = rect.left + (bounds.left + bounds.right) / 2 * zoom - width / 2;
      setPosition({left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
        top: Math.max(minY, Math.min(maxY - panelHeight, bottom + panelHeight + 18 < maxY ? bottom + 14 : top - panelHeight - 34)),
        maxHeight,
        visible: bottom >= minY && top <= maxY && rect.right > 0 && rect.left < window.innerWidth});
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [canvas, bounds.left, bounds.top, bounds.right, bounds.bottom, zoom, editing]);
  return createPortal(<div ref={popup} role={editing?"dialog":"toolbar"} aria-label={editing?"スタイル変更":"選択したストロークの操作"}
    className={`selection-popup${editing?" selection-style-popup":""}`}
    style={{left:position.left,top:position.top,maxHeight:editing?position.maxHeight:undefined,visibility:position.visible?"visible":"hidden"}}
    onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{
      if(!editing)return;
      e.stopPropagation();
      if(e.key==="Escape"){e.preventDefault();closeStyle();}
    }}>
    {editing?<SelectionStyleEditor strokes={strokes} onCancel={closeStyle} onApply={patch=>{onStyle(patch);closeStyle();}}/>:<>
      {[
        {label:"コピー",Icon:Copy,run:onCopy},
        {label:"切り取り",Icon:Scissors,run:onCut},
        {label:"複製",Icon:CopyPlus,run:onDuplicate},
        {label:"90度回転",Icon:RotateCw,run:onRotate},
        ...(strokes.length?[{label:"スタイル変更",Icon:Palette,run:()=>setEditing(true)}]:[]),
        {label:"削除",Icon:Trash2,run:onDelete},
      ].map(({label,Icon,run})=><button key={label} ref={label==="スタイル変更"?styleButton:undefined}
        aria-label={label} aria-haspopup={label==="スタイル変更"?"dialog":undefined} title={label} onClick={run}>
        <Icon size={18}/><span>{label}</span>
      </button>)}
    </>}
  </div>, document.body);
}

const styleColorKey="mpp-notes:selection-style-color";
function recentStyleColor(){
  try{
    const color=localStorage.getItem(styleColorKey);
    if(color&&/^#[0-9a-f]{6}$/i.test(color))return color;
  }catch{}
}

function commonValue<T>(strokes:Stroke[],read:(stroke:Stroke)=>T):T|undefined{
  const first=strokes[0];
  if(!first)return;
  const value=read(first);
  return strokes.every(stroke=>read(stroke)===value)?value:undefined;
}

function SelectionStyleEditor({strokes,onApply,onCancel}:{
  strokes:Stroke[]; onApply:(patch:StrokeStylePatch)=>void; onCancel:()=>void;
}){
  const commonColor=commonValue(strokes,stroke=>stroke.color);
  const initialColor=recentStyleColor()??strokes[0]?.color??"#000000";
  const commonWidth=commonValue(strokes,strokeSize);
  const commonLine=commonValue(strokes,lineStyle);
  const [color,setColor]=useState<string>();
  const [width,setWidth]=useState<string>();
  const [line,setLine]=useState<LineStyle>();
  const input=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{input.current?.focus({preventScroll:true});},[]);
  const amount=width?Number(width):undefined;
  const validWidth=amount===undefined||(Number.isInteger(amount)&&amount>=1&&amount<=100);
  const canApply=strokes.length>0&&validWidth&&(
    (color!==undefined&&color!==commonColor)||(amount!==undefined&&amount!==commonWidth)||(line!==undefined&&line!==commonLine)
  );
  return <form onSubmit={e=>{
    e.preventDefault();
    if(!canApply)return;
    if(color!==undefined){
      try{localStorage.setItem(styleColorKey,color);}catch{}
    }
    onApply({color,width:amount,line});
  }}>
    <strong>スタイル変更</strong>
    <div className="selection-style-row">
      <label htmlFor="selection-stroke-color">色</label>
      {commonColor!==initialColor&&color===undefined&&<button type="button" onClick={()=>setColor(initialColor)}>この色を使う</button>}
      <input ref={input} id="selection-stroke-color" type="color" value={color??initialColor} onInput={e=>setColor(e.currentTarget.value)}/>
    </div>
    <label className="selection-style-row">
      <span>太さ</span>
      <input type="number" aria-label="太さ" placeholder={commonWidth===undefined?"混在":undefined}
        min={1} max={100} step={1} value={width??(commonWidth===undefined?"":String(commonWidth))} onChange={e=>setWidth(e.currentTarget.value)}/>
    </label>
    <LineStylePicker value={line??commonLine} onChange={setLine}/>
    <div className="selection-style-actions">
      <button type="button" onClick={onCancel}>キャンセル</button>
      <button type="submit" className="primary" disabled={!canApply}>適用</button>
    </div>
  </form>;
}
