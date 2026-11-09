import {scratchErase as eraseScratch} from "./scratch";
import {penButtonTool,penInContact,type SelectionButtonAction} from "./penInput";
import {defaultShortcuts,shortcutAction,nativeClipboardAction,type ShortcutMap} from "./shortcuts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { drawPaper, drawStroke, strokeStartColor } from "./draw";
import type {AutoPenColor} from "./preferences";
import { pagePoint, uid, type Page, type Point, type Stroke } from "./model";
import {
  erase,
  selectLasso,
  imageAtPoint,
  moveSelection,
  transformSelection,
  selectionBounds,
  selectionHandles,
  selectionHit,
  selectionScale,
  type SelectionHandle,
  renderScale,
  type EraserMode,
} from "./editing";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {EndpointHold,correctHeldShape,recognizeHeldShape,SHAPE_HOLD_MS} from "./shapeHold";
import { isDarkColor } from "./paper";
import { pressureValue } from "./preferences";
import { SelectionPopup } from "./SelectionPopup";
import {applyStrokeStyle,type StrokeStylePatch} from "./strokeStyle";
import { cloneStrokes, decodeStrokes, editableTarget, localStrokes, rememberStrokes } from "./clipboard";
import { imageStroke, prepareImages, loadInkImage } from "./images";
import {StrokeIndex,strokeBounds,unionBounds,type Bounds} from "./spatial";
import type {SelectionDrag,IncomingSelection} from "./selectionTransfer";
export type Tool = "pen" | "marker" | "eraser" | "lasso" | "hand";
type Props = {
  selectionButton?:SelectionButtonAction;
  eraserButton?:SelectionButtonAction;
  shortcuts?:ShortcutMap;
  page: Page;
  onPasted: () => void;
  paperColor: string;
  isActive: boolean;
  pdfDocument?: PDFDocumentProxy;
  pressure: boolean;
  dotted: boolean;
  dashed: boolean;
  shapeCorrection: boolean;
  shapeHoldMs?:number;
  scratchErase:boolean;
  onActivate: () => void;
  zoom: number;
  tool: Tool;
  color: string;
  autoColor?:AutoPenColor;
  width: number;
  eraserMode: EraserMode;
  eraserSize: number;
  onCommit: (strokes: Stroke[]) => void;
  onError: (message: string) => void;
  onWriting: (writing: boolean) => void;
  onSelectionDrag:(drag:SelectionDrag)=>string|undefined;
  incomingSelection?:IncomingSelection;
};
export function Sheet({
  selectionButton="lasso",
  eraserButton="eraser",
  shortcuts=defaultShortcuts(),
  page,
  onPasted,
  paperColor,
  isActive,
  pdfDocument,
  pressure,
  dotted,
  dashed,
  shapeCorrection,
  shapeHoldMs=SHAPE_HOLD_MS,
  scratchErase,
  onActivate,
  zoom,
  tool,
  color,
  autoColor,
  width,
  eraserMode,
  eraserSize,
  onCommit,
  onError,
  onWriting,
  onSelectionDrag,
  incomingSelection,
}: Props) {
  const inputTool=useRef<Tool|null>(null),buttonSelection=useRef(false);
  const shapeHold=useRef(new EndpointHold());
  const shapePreview=useRef<Stroke|null>(null),shapeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [,refreshButtonSelection]=useState(0);
  function selectionMode(){return tool==="lasso"||buttonSelection.current;}
  function setButtonSelection(value:boolean){if(buttonSelection.current!==value){buttonSelection.current=value;refreshButtonSelection(v=>v+1);}}
  const spatial=useRef<StrokeIndex|null>(null),dirty=useRef<Bounds|null>(null);
  const dragStrokes=useRef<Stroke[]>([]);
  const backing=useRef<{canvas:HTMLCanvasElement;source:Stroke[];omit:boolean}|null>(null);
  function discardBacking(){if(backing.current){backing.current.canvas.width=1;backing.current.canvas.height=1;backing.current=null;}}
  const cursor = useRef<HTMLDivElement>(null);
  // Keep decoded images alive only while their page is mounted.
  const decodedImages = useRef<HTMLImageElement[]>([]);
  const imageLayers=useMemo(()=>page.strokes.filter(stroke=>stroke.image),[page.strokes]);
  const paper = useRef<HTMLCanvasElement>(null),
    ink = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null),
    working = useRef(page.strokes),
    active = useRef<number | null>(null),
    last = useRef<Point | null>(null),
    erasing = useRef(false),
    frame = useRef(0);
  const selected = useRef(new Set<string>()),
    lasso = useRef<Point[]>([]),
    moving = useRef<Point | null>(null),
    original = useRef<Stroke[]>([]);
  const [popupOpen,setPopupOpen]=useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [, refreshSelection] = useState(0),
    [editingSelection, setEditingSelection] = useState(false);
  const alive = useRef(true), pasting = useRef(false);
  const live = useRef({page, isActive, onCommit, onPasted, onError, onWriting});
  live.current = {page, isActive, onCommit, onPasted, onError, onWriting};
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const transform = useRef<{
    kind: "scale" | "rotate";
    start: Point;
    cx: number;
    cy: number;
    handle?: SelectionHandle;
  } | null>(null);
  function clearSelection() {
    selected.current.clear();
    refreshSelection((v) => v + 1);
    paint();
  }
  function applyTransform(sx: number, sy: number, angle: number) {
    const b = selectionBounds(page.strokes, selected.current);
    if (!b) return;
    onActivate();
    working.current = transformSelection(page.strokes, selected.current, {
      scaleX: sx,
      scaleY: sy,
      angle,
      cx: (b.left + b.right) / 2,
      cy: (b.top + b.bottom) / 2,
    });
    onCommit(working.current);
    refreshSelection((v) => v + 1);
    paint();
  }
  function changeSelectionStyle(patch:StrokeStylePatch){
    const strokes=applyStrokeStyle(page.strokes,selected.current,patch);
    if(strokes===page.strokes)return;
    working.current=strokes;
    onCommit(strokes);
    schedule();
  }
  function removeSelection() {
    if (!selected.current.size) return;
    onActivate();
    working.current = page.strokes.filter((s) => !selected.current.has(s.id));
    selected.current.clear();
    onCommit(working.current);
    refreshSelection((v) => v + 1);
    paint();
  }
  function selectedStrokes() { return page.strokes.filter((s) => selected.current.has(s.id)); }
  function insert(strokes: Stroke[], paste = false) {
    const latest = live.current;
    if (!alive.current || !latest.isActive || active.current !== null) return;
    let additions = cloneStrokes(strokes, latest.page);
    const ids = new Set(additions.map((s) => s.id));
    const bounds = selectionBounds(additions, ids);
    const rect = ink.current?.getBoundingClientRect();
    const viewport = ink.current?.closest(".viewport")?.getBoundingClientRect();
    if (paste && bounds && rect && viewport) {
      const x = (Math.max(rect.left, viewport.left) + Math.min(rect.right, viewport.right)) / 2;
      const y = (Math.max(rect.top, viewport.top) + Math.min(rect.bottom, viewport.bottom)) / 2;
      additions = moveSelection(additions, ids,
        (x - rect.left) / zoom - (bounds.left + bounds.right) / 2,
        (y - rect.top) / zoom - (bounds.top + bounds.bottom) / 2);
    }
    selected.current = ids;
    working.current = [...latest.page.strokes, ...additions];
    latest.onCommit(working.current);
    latest.onPasted();
    refreshSelection((v) => v + 1);
    paint();
  }
  async function copySelection(cut = false) {
    const strokes = selectedStrokes();
    if (!strokes.length) return;
    const text = rememberStrokes(strokes);
    const ids = new Set(strokes.map((s) => s.id));
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      onError(cut ? "クリップボードへ書き込めないため切り取りませんでした。ブラウザーのクリップボード権限を確認してください。" : "アプリ内にコピーしました。ほかのアプリへのコピーにはクリップボードの許可が必要です。");
      if (cut) return;
    }
    if (cut && alive.current && live.current.isActive && active.current === null) {
      working.current = live.current.page.strokes.filter((s) => !ids.has(s.id));
      live.current.onCommit(working.current);
      clearSelection();
    }
  }
  function canPaste(target: EventTarget | null) {
    return live.current.isActive && !editableTarget(target) && active.current === null &&
      !document.querySelector('.modal-backdrop,.busy-overlay,.settings-page,.page-context-menu');
  }
  async function pasteContent(strokes?: Stroke[] | null, image?: Blob) {
    if (pasting.current || !canPaste(null)) return;
    pasting.current = true;
    onWriting(true);
    try {
      const additions = image ? [await imageStroke(image, live.current.page)] : strokes;
      if (!additions?.length) throw new Error("画像またはMPP Notesでコピーしたストロークを貼り付けてください。");
      await prepareImages(additions);
      insert(additions, true);
    } catch (e) {
      if (alive.current) live.current.onError(e instanceof Error ? e.message : "貼り付けできませんでした。");
    } finally {
      pasting.current = false;
      if (alive.current) live.current.onWriting(false);
    }
  }
  async function pasteFromButton() {
    if (!canPaste(null)) return;
    try {
      const items = await navigator.clipboard.read();
      if (!items.length && localStrokes()) { await pasteContent(localStrokes()); return; }
      // Prefer our editable strokes to a raster clipboard representation.
      for (const item of items) if (item.types.includes("text/plain")) {
        const strokes = decodeStrokes(await (await item.getType("text/plain")).text());
        if (strokes) { await pasteContent(strokes); return; }
      }
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) { await pasteContent(null, await item.getType(type)); return; }
      }
      onError("画像またはMPP Notesでコピーしたストロークを貼り付けてください。");
    } catch {
      const strokes = localStrokes();
      if (strokes) await pasteContent(strokes);
      else onError("貼り付けの許可を確認してから、もう一度お試しください。");
    }
  }
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      if (!canPaste(e.target) || !selectionMode() || !selected.current.size || !e.clipboardData) return;
      e.clipboardData.setData("text/plain", rememberStrokes(selectedStrokes()));
      e.preventDefault();
      if (e.type === "cut") removeSelection();
    };
    const paste = (e: ClipboardEvent) => {
      if (!canPaste(e.target) || !e.clipboardData) return;
      const strokes = decodeStrokes(e.clipboardData.getData("text/plain"));
      const image = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (!strokes && !image) return;
      e.preventDefault();
      void pasteContent(strokes, strokes ? undefined : image || undefined);
    };
    const button = () => { if (isActive) void pasteFromButton(); };
    window.addEventListener("copy", copy);
    window.addEventListener("cut", copy);
    window.addEventListener("paste", paste);
    window.addEventListener("mpp-paste", button);
    return () => {
      window.removeEventListener("copy", copy); window.removeEventListener("cut", copy);
      window.removeEventListener("paste", paste); window.removeEventListener("mpp-paste", button);
    };
  }, [isActive, tool, page.strokes, zoom]);
  useEffect(() => {
    if (!isActive) clearSelection();
  }, [isActive]);
  useEffect(()=>{setButtonSelection(false);},[tool]);
  useEffect(()=>{
    if(incomingSelection?.pageId!==page.id)return;
    if(tool!=="lasso")setButtonSelection(true);
    selected.current=new Set(incomingSelection.ids);setPopupOpen(true);refreshSelection(v=>v+1);schedule();
  },[incomingSelection?.token,page.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.defaultPrevented||!isActive||editableTarget(e.target)||document.querySelector('.modal-backdrop,.busy-overlay,.settings-page,.page-context-menu'))return;
      const action=shortcutAction(shortcuts,e),native=nativeClipboardAction(e);
      if(native&&!action){e.preventDefault();return;}
      if(action==="paste"){
        if(action===native)return;
        e.preventDefault();if(!e.repeat)void pasteFromButton();return;
      }
      if (
        !isActive ||
        !selectionMode() ||
        !selected.current.size ||
        editableTarget(e.target) ||
        document.querySelector('.modal-backdrop,.busy-overlay,.settings-page,.page-context-menu')
      )
        return;
      if (action==="copy"||action==="cut") {
        if(active.current!==null)return;
        if(action===native)return;
        e.preventDefault();if(!e.repeat)void copySelection(action==="cut");
      } else if(action==="duplicate"||action==="rotate"){
        if(active.current!==null)return;e.preventDefault();
        if(action==="duplicate")insert(selectedStrokes());else applyTransform(1,1,Math.PI/2);
      } else if (action === "deleteSelection") {
        if(active.current!==null)return;
        e.preventDefault();
        removeSelection();
      } else if (action === "clearSelection") {
        e.preventDefault();
        const pointer=active.current;
        if(pointer!==null){
          if(moving.current)onSelectionDrag({phase:"cancel",strokes:dragStrokes.current,start:moving.current,client:{x:0,y:0}});
          working.current=original.current;moving.current=null;transform.current=null;lasso.current=[];active.current=null;
          discardBacking();setEditingSelection(false);onWriting(false);
          if(ink.current?.hasPointerCapture(pointer))ink.current.releasePointerCapture(pointer);
        }
        clearSelection();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [isActive, tool, page.strokes,shortcuts]);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  useEffect(() => {
    const resize = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const pixels = renderScale(page.width, page.height, zoom, dpr);
  function paint(force=false) {
    const c = ink.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    if(erasing.current&&!dirty.current&&!force)return;
    ctx.setTransform(c.width / page.width, 0, 0, c.height / page.height, 0, 0);
    if(erasing.current&&dirty.current&&spatial.current){
      const b=dirty.current;dirty.current=null;
      // Clip both clearing and repainting so distant ink is never redrawn.
      ctx.save();ctx.beginPath();ctx.rect(b.left-2,b.top-2,b.right-b.left+4,b.bottom-b.top+4);ctx.clip();
      ctx.clearRect(b.left-2,b.top-2,b.right-b.left+4,b.bottom-b.top+4);
      const nearby=spatial.current.query({left:b.left-2,top:b.top-2,right:b.right+2,bottom:b.bottom+2});
      for(const s of working.current)if(nearby.has(s))drawStroke(ctx,s);
      ctx.restore();return;
    }
    ctx.clearRect(0, 0, page.width, page.height);
    if(active.current!==null&&!erasing.current){
      const omit=!!moving.current||!!transform.current,source=omit?original.current:working.current;
      if(!backing.current||backing.current.source!==source||backing.current.omit!==omit||backing.current.canvas.width!==c.width||backing.current.canvas.height!==c.height){
        discardBacking();const canvas=document.createElement("canvas");canvas.width=c.width;canvas.height=c.height;
        const base=canvas.getContext("2d")!;base.setTransform(c.width/page.width,0,0,c.height/page.height,0,0);
        for(const s of source)if(!omit||!selected.current.has(s.id))drawStroke(base,s);
        backing.current={canvas,source,omit};
      }
      ctx.drawImage(backing.current.canvas,0,0,page.width,page.height);
      if(transform.current)for(const s of working.current)if(selected.current.has(s.id))drawStroke(ctx,s);
    }else working.current.forEach((s) => drawStroke(ctx, s));
    const draft=shapePreview.current??current.current;
    if(draft)drawStroke(ctx,draft);
    if (selectionMode()) {
      ctx.save();
      ctx.strokeStyle = isDarkColor(paperColor) ? "#acd49a" : "#397956";
      ctx.lineWidth = 1.3 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      const b = moving.current?null:selectionBounds(working.current, selected.current);
      if (b) {
        ctx.fillStyle = isDarkColor(paperColor) ? "#a9d39420" : "#427b5812";
        ctx.fillRect(
          b.left - 6,
          b.top - 6,
          b.right - b.left + 12,
          b.bottom - b.top + 12,
        );
        ctx.strokeRect(
          b.left - 6,
          b.top - 6,
          b.right - b.left + 12,
          b.bottom - b.top + 12,
        );
      }
      if (b) {
        ctx.setLineDash([]);
        const size = 7 / zoom;
        ctx.fillStyle = isDarkColor(paperColor) ? "#c9e4b9" : "#fffefa";
        for (const {x,y} of selectionHandles(b)) {
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        }
        const cx = (b.left + b.right) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, b.top);
        ctx.lineTo(cx, b.top - 22 / zoom);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, b.top - 22 / zoom, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (lasso.current.length) {
        ctx.beginPath();
        lasso.current.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function schedule() {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        paint();
      });
  }
  function clearShapePreview(){
    clearTimeout(shapeTimer.current);shapeTimer.current=undefined;shapePreview.current=null;
  }
  function armShapePreview(){
    if(!shapeCorrection||shapeHoldMs===0||shapeTimer.current!==undefined)return;
    const check=()=>{
      shapeTimer.current=undefined;
      const stroke=current.current;
      if(!stroke||active.current===null)return;
      const remaining=shapeHold.current.remaining(performance.now(),shapeHoldMs);
      // Let an outstanding timer follow the latest endpoint, without creating
      // a timer for every sample of a moving stroke.
      if(remaining>0){shapeTimer.current=setTimeout(check,remaining);return;}
      shapePreview.current=recognizeHeldShape(stroke,original.current,shapeHold.current.endpointCount);
      if(shapePreview.current!==stroke)paint();
    };
    shapeTimer.current=setTimeout(check,shapeHold.current.remaining(performance.now(),shapeHoldMs));
  }
  useEffect(()=>{
    const hadPreview=!!shapePreview.current;
    clearShapePreview();
    if(hadPreview)paint();
    if(current.current&&current.current.points.length>1)armShapePreview();
  },[shapeCorrection,shapeHoldMs]);
  useEffect(() => {
    discardBacking();
    setPopupOpen(true);
    working.current = page.strokes;
    const existing=new Set(page.strokes.map(s=>s.id));
    selected.current = new Set([...selected.current].filter(id=>existing.has(id)));
    refreshSelection((v) => v + 1);
    paint();
  }, [page.strokes, page.id, pixels, tool]);
  useEffect(() => {
    let disposed = false;
    if(!page.strokes.some(s=>s.image)){decodedImages.current=[];return;}
    void prepareImages(page.strokes).then((images) => {
      if (!disposed) { decodedImages.current = images; paint(); }
    })
      .catch(() => { if (!disposed) onError("保存された画像を読み込めません。"); });
    return () => { disposed = true; decodedImages.current = []; };
  }, [page.strokes]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearShapePreview();
      discardBacking();
      onWriting(false);
    },
    [],
  );
  useEffect(() => {
    const canvas = paper.current!;
    let disposed = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(
      canvas.width / page.width,
      0,
      0,
      canvas.height / page.height,
      0,
      0,
    );
    drawPaper(ctx, page, paperColor);
    if (page.backgroundImage && page.pdfIndex === undefined) void loadInkImage(page.backgroundImage).then((image) => {if (!disposed) {decodedImages.current.push(image);drawPaper(ctx,page,paperColor);}}).catch(()=>{if(!disposed) onError("背景画像を読み込めません。");});
    if (page.pdfIndex !== undefined) {
      setPdfLoading(true);
      if (pdfDocument)
        void (async () => {
          try {
            const p = await pdfDocument.getPage(page.pdfIndex! + 1);
            if (disposed) return;
            const v = p.getViewport({ scale: pixels });
            canvas.width = Math.ceil(v.width);
            canvas.height = Math.ceil(v.height);
            render = p.render({ canvasContext: ctx, canvas, viewport: v });
            await render.promise;
          } catch {
            if (!disposed) onError("PDFページを表示できません。");
          } finally {
            if (!disposed) setPdfLoading(false);
          }
        })();
    } else setPdfLoading(false);
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [page.id, page.paper, page.paperColor, page.backgroundImage, paperColor, pdfDocument, pixels]);
  const point = (e: {
    clientX: number;
    clientY: number;
    pressure: number;
    pointerType?: string;
  },rect=ink.current!.getBoundingClientRect()) =>
    pagePoint(
      e.clientX,
      e.clientY,
      rect,
      page,
      pressureValue(e.pointerType === "mouse" ? 0.5 : e.pressure, pressure),
    );
  function applyEraser(a: Point, b: Point) {
    working.current = erase(
      working.current,
      a,
      b,
      eraserSize / 2 / zoom,
      eraserMode,
      spatial.current||undefined,
      stroke=>{const b=strokeBounds(stroke);dirty.current=dirty.current?unionBounds(dirty.current,b):b;},
    );
  }
  function down(e: RPointerEvent<HTMLCanvasElement>) {
    const buttonTool=penButtonTool(e,selectionButton,eraserButton);
    if(e.pointerType==="pen"&&!penInContact(e)){if(buttonTool){e.preventDefault();e.stopPropagation();}return;}
    if(e.pointerType==="mouse"&&e.button!==0)return;
    const action=buttonTool||(e.pointerType==="touch"&&buttonSelection.current?"lasso":tool);
    const p = point(e);
    const hit = action === "lasso" ? selectionHit(selectionBounds(page.strokes, selected.current), p, zoom) : null;
    const image = action === "lasso" && !hit ? imageAtPoint(page.strokes, p) : undefined;
    if (
      (e.pointerType === "touch" && !hit && !image) ||
      action === "hand" ||
      e.button === 1
    )
      return;
    if (active.current !== null) return;
    inputTool.current=action;
    if(buttonTool==="lasso")setButtonSelection(true);
    else if(e.pointerType!=="touch"&&buttonSelection.current){setButtonSelection(false);clearSelection();}
    e.preventDefault();
    e.stopPropagation();
    onActivate();
    active.current = e.pointerId;
    onWriting(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    working.current = page.strokes;
    original.current = page.strokes;
    discardBacking();dirty.current=null;
    erasing.current = action === "eraser";
    spatial.current=erasing.current||action==="lasso"?new StrokeIndex(page.strokes):null;
    last.current = p;
    setPopupOpen(true);
    if (erasing.current) {selected.current.clear();paint(true);applyEraser(p, p);}
    else if (action === "lasso") {
      if (hit?.kind === "rotate") {
        transform.current = {kind:"rotate",start:p,cx:hit.cx,cy:hit.cy};
        setEditingSelection(true);
      } else if (hit && hit.kind !== "move") {
        transform.current = {kind:"scale",start:p,cx:hit.cx,cy:hit.cy,handle:hit};
        setEditingSelection(true);
      } else if (hit?.kind === "move" || image) {
        if (image) {
          selected.current = new Set([image.id]);
          refreshSelection(v => v + 1);
        }
        moving.current = p;
        dragStrokes.current=page.strokes.filter(s=>selected.current.has(s.id));
        onSelectionDrag({phase:"start",strokes:dragStrokes.current,start:p,client:{x:e.clientX,y:e.clientY}});
        setEditingSelection(true);
      } else {
        selected.current.clear();
        lasso.current = [p];
        refreshSelection((v) => v + 1);
      }
    } else {
      current.current = {
        id: uid(),
        tool: action === "marker" ? "marker" : "pen",
        color:autoColor?.enabled?strokeStartColor(autoColor,paper.current,p,page,paperColor,imageLayers):color,
        pressure,
        dotted,
        dashed,
        width: action === "marker" ? width * 5 : width,
        points: [p],
      };
      shapeHold.current.start(e.clientX,e.clientY,e.timeStamp);
    }
    schedule();
  }
  function move(e: RPointerEvent<HTMLCanvasElement>) {
    const buttonTool=penButtonTool(e,selectionButton,eraserButton);
    if(active.current===null&&penInContact(e)&&buttonTool)down(e);
    if (cursor.current) {
      const show =
        e.pointerType !== "touch" &&
        (active.current===e.pointerId?inputTool.current:buttonTool??tool)==="eraser";
      cursor.current.style.display = show ? "block" : "none";
      if (show) {
        const rect = e.currentTarget.getBoundingClientRect();
        cursor.current.style.transform = `translate(${e.clientX - rect.left - eraserSize / 2}px,${e.clientY - rect.top - eraserSize / 2}px)`;
      }
    }

    if (active.current !== e.pointerId) return;
    if(e.pointerType==="pen"&&!penInContact(e)){finish(e);return;}
    e.preventDefault();
    e.stopPropagation();
    const samples = e.nativeEvent.getCoalescedEvents?.() || [];
    const rect=ink.current!.getBoundingClientRect();
    const events=samples.length?samples:[e.nativeEvent];
    for (const sample of inputTool.current==="lasso"&&(moving.current||transform.current)?events.slice(-1):events) {
      const p = point(sample,rect);
      if (erasing.current) {
        applyEraser(last.current || p, p);
        last.current = p;
      } else if (inputTool.current === "lasso") {
        if (transform.current) {
          const t = transform.current;
          if (t.kind === "rotate") {
            const angle =
              Math.atan2(p.y - t.cy, p.x - t.cx) -
              Math.atan2(t.start.y - t.cy, t.start.x - t.cx);
            working.current = transformSelection(
              original.current,
              selected.current,
              { angle, cx: t.cx, cy: t.cy },
            );
          } else {
            const scale = selectionScale(t.handle!, p.x-t.start.x, p.y-t.start.y);
            working.current = transformSelection(
              original.current,
              selected.current,
              { ...scale, cx: t.cx, cy: t.cy },
            );
          }
        } else if (moving.current)
          onSelectionDrag({phase:"move",strokes:dragStrokes.current,start:moving.current,client:{x:sample.clientX,y:sample.clientY}});
        else {const previous=lasso.current.at(-1);if(!previous||Math.hypot(p.x-previous.x,p.y-previous.y)>=2/zoom)lasso.current.push(p);}
      } else if(current.current){
        current.current.points.push(p);
        if(shapeHold.current.move(sample.clientX,sample.clientY,sample.timeStamp,current.current.points.length)){
          shapePreview.current=null;armShapePreview();
        }
      }
    }
    if(!moving.current)schedule();
  }
  function finish(e: RPointerEvent<HTMLCanvasElement>) {
    if (active.current !== e.pointerId) return;
    e.stopPropagation();
    const cancel =
      e.type === "pointercancel" || e.type === "lostpointercapture";
    if (inputTool.current === "lasso" && !erasing.current) {
      if(moving.current){const target=onSelectionDrag({phase:cancel?"cancel":"end",strokes:dragStrokes.current,start:moving.current,client:{x:e.clientX,y:e.clientY}});if(target&&target!==page.id)selected.current.clear();}
      if (cancel) working.current = original.current;
      else if (!moving.current && !transform.current)
        selected.current = selectLasso(working.current, lasso.current,spatial.current||undefined);
      moving.current = null;
      transform.current = null;
      setEditingSelection(false);
      refreshSelection((v) => v + 1);
      lasso.current = [];
    }
    if (current.current) {
      const stroke=current.current;
      const held=shapeHold.current.ready(e.clientX,e.clientY,e.timeStamp,shapeHoldMs);
      const corrected=!cancel&&shapeCorrection
        ? (held?shapePreview.current:null)??correctHeldShape(stroke,page.strokes,shapeHold.current,e,shapeHoldMs)
        : stroke;
      const erased=!cancel && corrected===stroke && inputTool.current === "pen" && scratchErase
        ? eraseScratch(original.current,current.current.points,zoom) : null;
      working.current = erased || [
        ...working.current,
        corrected,
      ];
    }
    current.current = null;
    clearShapePreview();
    shapeHold.current.reset();
    active.current = null;
    inputTool.current=null;
    if(cancel)working.current=original.current;
    erasing.current=false;dirty.current=null;spatial.current=null;discardBacking();
    last.current = null;
    onWriting(false);
    if (working.current !== page.strokes) onCommit(working.current);
    paint();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const bounds = selectionBounds(page.strokes, selected.current);
  return (
    <div
      className="sheet"
      style={{
        width: `calc(${page.width}px * var(--notebook-zoom, ${zoom}))`,
        height: `calc(${page.height}px * var(--notebook-zoom, ${zoom}))`,
        background: paperColor,
      }}
    >
      <canvas
        ref={paper}
        width={Math.ceil(page.width * pixels)}
        height={Math.ceil(page.height * pixels)}
        aria-label="用紙・PDF背景"
      />
      <canvas
        className={"ink " + tool}
        ref={ink}
        width={Math.ceil(page.width * pixels)}
        height={Math.ceil(page.height * pixels)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerLeave={() => {
          if (cursor.current) cursor.current.style.display = "none";
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="手書き用紙"
      />
      <div
        ref={cursor}
        className="eraser-cursor"
        style={{ width: eraserSize, height: eraserSize, display: "none" }}
      />
      {pdfLoading && <div className="page-loading">PDFを読み込み中…</div>}
      {isActive && selectionMode() && bounds && popupOpen && !editingSelection && (
        <SelectionPopup onDismiss={()=>setPopupOpen(false)} canvas={ink} bounds={bounds} zoom={zoom}
          strokes={selectedStrokes().filter(stroke=>!stroke.image)} onStyle={changeSelectionStyle}
          onCopy={() => void copySelection()}
          onCut={() => void copySelection(true)}
          onDuplicate={() => insert(selectedStrokes())}
          onRotate={() => applyTransform(1, 1, Math.PI / 2)}
          onDelete={removeSelection}/>
      )}
    </div>
  );
}
