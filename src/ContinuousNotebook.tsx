import {observePage} from "./pageVisibility";
import {VStack} from "@astryxdesign/core/VStack";
import {HStack} from "@astryxdesign/core/HStack";
import {Text} from "@astryxdesign/core/Text";
import {ArrowUp,ArrowLeft,Check} from "lucide-react";
import {PagePreview} from "./PagePreview";
import {nextPaperGeometry,pagePullOffset,pagePullHandoff,advanceVerticalPagePull,isForeignPointerCaptureLoss,type PullGeometry,type VerticalPullAnchor} from "./pagePull";
import {previewWork} from "./previewWork";
import {
  memo,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type PointerEvent as RPointerEvent,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Note, Page, Stroke } from "./model";
import { ScrollMotion } from "./motion";
import { pagePaperColor,newPageFrom } from "./paper";
import { zoomScrollTop, zoomScrollLeft, clampZoom, touchGeometry, pinchViewport, horizontalZoomPosition, horizontalPageIndex, verticalPageInset, pageAfterSwipe, PAGE_LABEL, PAGE_GAP, type PinchAnchor, type ScrollDirection } from "./scrolling";
import { Sheet, type Tool } from "./Sheet";
import { pdfjs, pdfOptions } from "./pdf";
import { shouldAddPage, type EraserMode } from "./editing";
import {selectionBounds,renderScale} from "./editing";
import {drawStroke} from "./draw";
import {createPortal} from "react-dom";
import {transferSelection,type SelectionDrag,type IncomingSelection} from "./selectionTransfer";
import type {PageChange} from "./notebookHistory";
import type {ShortcutMap} from "./shortcuts";
import type {FillSettings} from "./fill";
import type {AutoPenColor} from "./preferences";
import type {SelectionButtonAction} from "./penInput";
import {readNoteView,captureNoteView,restoreNoteView,saveNoteView,type NoteView} from "./noteView";
type PageSwipe = {
  x:number;y:number;left:number;index:number;starts:number[];max:number;
  axis?:"horizontal"|"vertical";
  deltaX:number;
};
const notePageIds=(note:Note)=>new Set(note.pages.map(p=>p.id));
type PullVisual={geometry:PullGeometry;page:Page;offset:number;returning:boolean};
type Props = {
  selectionButton:SelectionButtonAction;
  eraserButton:SelectionButtonAction;
  shortcuts:ShortcutMap;
  note: Note;
  onPasted: () => void;
  dark: boolean;
  activePageId: string;
  jump: { id: string; token: number };
  zoom: number;
  setZoom: (zoom: number) => void;
  tool: Tool;
  color: string;
  autoColor?:AutoPenColor;
  markerOpacity?:number;
  fill?:FillSettings;
  width: number;
  pressure: boolean;
  wavy: boolean;
  dotted: boolean;
  dashed: boolean;
  shapeCorrection: boolean;
  shapeHoldMs: number;
  direction: ScrollDirection;
  settingsOpen: boolean;
  scratchErase:boolean;
  eraserMode: EraserMode;
  eraserSize: number;
  onActive: (id: string) => void;
  onAddPage: () => void;
  onCommit: (id: string, strokes: Stroke[]) => void;
  onCommitPages:(changes:PageChange[])=>void;
  onError: (s: string) => void;
  onWriting: (b: boolean) => void;
};
type PageSettings=Omit<Props,"note"|"activePageId"|"jump"|"setZoom"|"onWriting"|"onAddPage"|"onCommitPages"|"settingsOpen"|"direction">&{pageCount:number};
const PageSlot=memo(function PageSlot({
  page,
  index,
  isActive,
  isNew,
  root,
  document,
  props,
  onWriting,
  incoming,
  onSelectionDrag,
}: {
  page: Page;
  index: number;
  isActive:boolean;
  isNew:boolean;
  root: RefObject<HTMLDivElement | null>;
  document?: PDFDocumentProxy;
  props: PageSettings;
  onWriting: (id: string, b: boolean) => void;
  incoming?:IncomingSelection;
  onSelectionDrag:(id:string,drag:SelectionDrag)=>string|undefined;
}) {
  const slot = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(index === 0),
    [pinned, setPinned] = useState(false);
  useEffect(() => {
    if(root.current&&slot.current)return observePage(root.current,slot.current,setVisible);
  }, [root]);
  return (
    <div
      ref={slot}
      className={"continuous-page"+(isNew?" page-added":"")}
      data-page-id={page.id}
      style={{
        "--paper-width": `calc(${page.width}px * var(--notebook-zoom, ${props.zoom}))`,
        width: "var(--page-frame-width, var(--paper-width))",
        height: `calc(${page.height}px * var(--notebook-zoom, ${props.zoom}) + 24px)`,
      } as CSSProperties}
    >
      <div className="page-label">
        {index + 1} / {props.pageCount}
      </div>
      {visible || pinned ? (
        <Sheet
          selectionButton={props.selectionButton}
          eraserButton={props.eraserButton}
          shortcuts={props.shortcuts}
          page={page}
          onPasted={props.onPasted}
          paperColor={pagePaperColor(page, props.dark)}
          isActive={isActive}
          pdfDocument={document}
          zoom={props.zoom}
          tool={props.tool}
          color={props.color}
          autoColor={props.autoColor}
          markerOpacity={props.markerOpacity}
          fill={props.fill}
          width={props.width}
          pressure={props.pressure}
          wavy={props.wavy}
          dotted={props.dotted}
          dashed={props.dashed}
          shapeCorrection={props.shapeCorrection}
          shapeHoldMs={props.shapeHoldMs}
          scratchErase={props.scratchErase}
          eraserMode={props.eraserMode}
          eraserSize={props.eraserSize}
          onActivate={() => props.onActive(page.id)}
          onCommit={(strokes) => props.onCommit(page.id, strokes)}
          incomingSelection={incoming}
          onSelectionDrag={drag=>onSelectionDrag(page.id,drag)}
          onError={props.onError}
          onWriting={(b) => {
            setPinned(b);
            onWriting(page.id, b);
          }}
        />
      ) : (
        <div
          className="page-placeholder"
          style={{
            height: `calc(${page.height}px * var(--notebook-zoom, ${props.zoom}))`,
            background: pagePaperColor(page, props.dark),
          }}
        >
          ページ {index + 1}
        </div>
      )}
    </div>
  );
});
export function ContinuousNotebook(props: Props) {
  const [initialView]=useState(()=>readNoteView(props.note.id));
  const viewPosition=useRef<NoteView|undefined>(initialView),positionTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const positionReady=useRef(false),positionFailed=useRef(false),writtenPosition=useRef("");
  const firstJump=useRef(true);
  const ghost=useRef<HTMLCanvasElement>(null),dragging=useRef<{id:string;drag:SelectionDrag;bounds:{left:number;top:number;right:number;bottom:number}}|null>(null);
  const dragFrame=useRef(0),dropTarget=useRef<HTMLElement|null>(null),dragTime=useRef(0);
  const [incoming,setIncoming]=useState<IncomingSelection>();
  const latest=useRef(props);latest.current=props;
  const slotEvents=useRef({writing,selectionDrag});slotEvents.current={writing,selectionDrag};
  const callbacks=useMemo(()=>({
    onActive:(id:string)=>latest.current.onActive(id),
    onCommit:(id:string,strokes:Stroke[])=>latest.current.onCommit(id,strokes),
    onError:(message:string)=>latest.current.onError(message),
    onPasted:()=>latest.current.onPasted(),
    onWriting:(id:string,b:boolean)=>slotEvents.current.writing(id,b),
    onSelectionDrag:(id:string,drag:SelectionDrag)=>slotEvents.current.selectionDrag(id,drag),
  }),[]);
  const pageSettings=useMemo<PageSettings>(()=>({
    ...callbacks,pageCount:props.note.pages.length,
    dark:props.dark,zoom:props.zoom,tool:props.tool,color:props.color,autoColor:props.autoColor,
    markerOpacity:props.markerOpacity,fill:props.fill,width:props.width,pressure:props.pressure,
    wavy:props.wavy,dotted:props.dotted,dashed:props.dashed,shapeCorrection:props.shapeCorrection,
    shapeHoldMs:props.shapeHoldMs,scratchErase:props.scratchErase,eraserMode:props.eraserMode,
    eraserSize:props.eraserSize,selectionButton:props.selectionButton,eraserButton:props.eraserButton,shortcuts:props.shortcuts,
  }),[callbacks,props.note.pages.length,props.dark,props.zoom,props.tool,props.color,props.autoColor,
    props.markerOpacity,props.fill,props.width,props.pressure,props.wavy,props.dotted,props.dashed,
    props.shapeCorrection,props.shapeHoldMs,props.scratchErase,props.eraserMode,props.eraserSize,
    props.selectionButton,props.eraserButton,props.shortcuts]);

  const viewport = useRef<HTMLDivElement>(null),
    [document, setDocument] = useState<PDFDocumentProxy>(),
    [pull, setPullValue] = useState(0),
    drawing = useRef(new Set<string>());
  const stack=useRef<HTMLDivElement>(null),[pullVisual,setPullVisual]=useState<PullVisual>();
  const pullVisualRef=useRef<PullVisual|undefined>(undefined),pullTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const pullHandoff=useRef<{id:string;left:number;top:number}|null>(null),swipeArrival=useRef<string|undefined>(undefined);
  const touches = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{ x: number; y: number; distance: number } | null>(null),
    swipe = useRef<{distance:number;multi:boolean;vertical:VerticalPullAnchor|null}>({ distance: 0, multi: false,vertical:null }),
    frame = useRef(0);
  const pageSwipe=useRef<PageSwipe|null>(null);
  const previousPages=useRef<Set<string>|undefined>(undefined),[addedPage,setAddedPage]=useState<string>();
  previousPages.current??=notePageIds(props.note);
  const { note, zoom, onActive, onError } = props;
  const horizontal=props.direction==="horizontal";
  const previousDirection=useRef(props.direction);
  const layoutKey=useMemo(()=>note.pages.map(p=>`${p.id}:${p.width}:${p.height}`).join("|"),[note.pages]);
  const maxPageWidth=Math.max(...note.pages.map(p=>p.width));
  const maxPageHeight=Math.max(...note.pages.map(p=>p.height));
  const pagesHeight=useMemo(()=>({height:note.pages.reduce((sum,p)=>sum+p.height,0),spacing:note.pages.length*PAGE_LABEL+Math.max(0,note.pages.length-1)*PAGE_GAP}),[layoutKey]);
  const liveZoom=useRef(zoom),pinchAnchor=useRef<PinchAnchor|null>(null),zoomFrame=useRef(0);
  const pendingZoom=useRef<{anchor:PinchAnchor;point:{x:number;y:number;distance:number}}|null>(null),committedZoom=useRef<number|null>(null);
  const scrollPosition=useRef({left:0,top:0}),viewportSize=useRef({width:0,height:0});
  const motion = useRef<ScrollMotion | null>(null),
    velocity = useRef({ x: 0, y: 0, time: 0 });
  function resetPull(animate=false){
    if(animate&&pullVisualRef.current?.returning)return;
    clearTimeout(pullTimer.current);setPullValue(0);
    const visual=pullVisualRef.current;
    const returning=animate&&visual&&visual.offset>0;
    stack.current?.classList.toggle("pull-returning",!!returning);
    if(stack.current)stack.current.style.transform="";
    if(returning){
      const next={...visual,offset:0,returning:true};pullVisualRef.current=next;setPullVisual(next);
      pullTimer.current=setTimeout(()=>{stack.current?.classList.remove("pull-returning");pullVisualRef.current=undefined;setPullVisual(undefined);},240);
    }else{pullVisualRef.current=undefined;setPullVisual(undefined);}
  }
  function setPull(distance:number){
    if(distance<=0){resetPull(true);return;}
    const v=viewport.current,s=stack.current;if(!v||!s)return;
    let visual=pullVisualRef.current;
    if(!visual||visual.returning){
      resetPull();
      const slot=v.querySelector<HTMLElement>(".continuous-page:last-child"),paper=slot?.querySelector<HTMLElement>(".sheet,.page-placeholder");
      if(!slot||!paper)return;
      visual={geometry:nextPaperGeometry(latest.current.direction,v.getBoundingClientRect(),slot.getBoundingClientRect(),paper.getBoundingClientRect()),page:newPageFrom(latest.current.note.pages.at(-1),latest.current.dark),offset:0,returning:false};
    }
    const offset=pagePullOffset(distance,visual.geometry),next={...visual,offset,returning:false};
    s.style.transform=latest.current.direction==="horizontal"?`translate3d(${-offset}px,0,0)`:`translate3d(0,${-offset}px,0)`;
    pullVisualRef.current=next;setPullVisual(next);setPullValue(distance);
  }
  function measureViewport(v:HTMLDivElement){
    if(!v.clientWidth||!v.clientHeight)return;
    v.style.setProperty("--viewport-width",`${v.clientWidth}px`);
    v.style.setProperty("--viewport-height",`${v.clientHeight}px`);
  }
  function capturePosition(v=viewport.current){
    if(!positionReady.current||!v||v.clientWidth<=0||v.clientHeight<=0||previousDirection.current!==latest.current.direction)return;
    if(latest.current.direction==="horizontal"&&viewportSize.current.width&&viewportSize.current.width!==v.clientWidth)return;
    viewPosition.current=captureNoteView(latest.current.note.pages,liveZoom.current,v.scrollLeft,v.scrollTop,v.clientWidth,latest.current.direction,v.clientHeight);
  }
  function persistPosition(v?:HTMLDivElement|null){
    if(v)capturePosition(v);clearTimeout(positionTimer.current);
    const value=viewPosition.current;if(!value)return;
    const serialized=JSON.stringify(value);if(serialized===writtenPosition.current)return;
    if(saveNoteView(latest.current.note.id,value))writtenPosition.current=serialized;
    else if(!positionFailed.current){positionFailed.current=true;latest.current.onError("表示位置を保存できません。ブラウザーのサイトデータ設定を確認してください。ノート本文の保存とは別の設定です。");}
  }
  function rememberPosition(){
    capturePosition();clearTimeout(positionTimer.current);
    positionTimer.current=setTimeout(()=>persistPosition(),500);
  }
  function targetAt(x:number,y:number){
    const v=viewport.current;if(!v)return;
    const vr=v.getBoundingClientRect();if(x<vr.left||x>vr.right||y<vr.top||y>vr.bottom)return;
    for(const slot of v.querySelectorAll<HTMLElement>("[data-page-id]")){
      const surface=slot.querySelector<HTMLElement>(".sheet,.page-placeholder");if(!surface)continue;
      const rect=surface.getBoundingClientRect();if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return {slot,rect,id:slot.dataset.pageId!};
    }
  }
  function stopDrag(){
    cancelAnimationFrame(dragFrame.current);dragFrame.current=0;dragging.current=null;
    if(ghost.current){ghost.current.style.display="none";ghost.current.width=1;ghost.current.height=1;}
    dropTarget.current?.classList.remove("selection-drop-target");dropTarget.current=null;
  }
  function dragTick(time:number){
    const item=dragging.current,v=viewport.current,c=ghost.current;if(!item||!v||!c)return;
    const {drag,bounds}=item,zoom=latest.current.zoom,r=v.getBoundingClientRect();
    const dt=Math.min(32,Math.max(0,time-dragTime.current));dragTime.current=time;
    const speed=(p:number,lo:number,hi:number)=>p<lo+56?-Math.min(1,(lo+56-p)/56):p>hi-56?Math.min(1,(p-hi+56)/56):0;
    v.scrollTop+=speed(drag.client.y,r.top,r.bottom)*dt*.8;
    v.scrollLeft+=speed(drag.client.x,r.left,r.right)*dt*.8;
    c.style.transform=`translate3d(${drag.client.x-(drag.start.x-bounds.left)*zoom}px,${drag.client.y-(drag.start.y-bounds.top)*zoom}px,0)`;
    const target=targetAt(drag.client.x,drag.client.y)?.slot||null;
    if(target!==dropTarget.current){dropTarget.current?.classList.remove("selection-drop-target");target?.classList.add("selection-drop-target");dropTarget.current=target;}
    dragFrame.current=requestAnimationFrame(dragTick);
  }
  function selectionDrag(id:string,drag:SelectionDrag):string|undefined {
    if(drag.phase==="start"){
      stopDrag();const ids=new Set(drag.strokes.map(s=>s.id)),b=selectionBounds(drag.strokes,ids),c=ghost.current;if(!b||!c)return;
      const margin=10/zoom,bounds={left:b.left-margin,top:b.top-margin,right:b.right+margin,bottom:b.bottom+margin};
      const w=bounds.right-bounds.left,h=bounds.bottom-bounds.top,scale=renderScale(w,h,zoom,window.devicePixelRatio||1);
      c.width=Math.max(1,Math.ceil(w*scale));c.height=Math.max(1,Math.ceil(h*scale));c.style.width=`${w*zoom}px`;c.style.height=`${h*zoom}px`;
      const ctx=c.getContext("2d")!;ctx.setTransform(c.width/w,0,0,c.height/h,-bounds.left*c.width/w,-bounds.top*c.height/h);
      drag.strokes.forEach(s=>drawStroke(ctx,s));ctx.strokeStyle="#70ac83";ctx.lineWidth=1.5/zoom;ctx.setLineDash([5/zoom,4/zoom]);ctx.strokeRect(b.left-3/zoom,b.top-3/zoom,b.right-b.left+6/zoom,b.bottom-b.top+6/zoom);
      c.style.display="block";c.style.transform=`translate3d(${drag.client.x-(drag.start.x-bounds.left)*zoom}px,${drag.client.y-(drag.start.y-bounds.top)*zoom}px,0)`;
      dragging.current={id,drag,bounds};dragTime.current=performance.now();dragFrame.current=requestAnimationFrame(dragTick);return;
    }
    if(!dragging.current)return;
    if(drag.phase==="move"){dragging.current.drag=drag;return;}
    if(drag.phase==="cancel"){stopDrag();return;}
    const target=targetAt(drag.client.x,drag.client.y),current=latest.current;
    stopDrag();if(!target)return;
    const page=current.note.pages.find(p=>p.id===target.id);if(!page)return;
    const end={x:(drag.client.x-target.rect.left)*page.width/target.rect.width,y:(drag.client.y-target.rect.top)*page.height/target.rect.height,p:drag.start.p};
    const changes=transferSelection(current.note.pages,id,target.id,drag.strokes,drag.start,end);if(!changes.length)return;
    const ids=target.id===id?drag.strokes.map(s=>s.id):changes.find(c=>c.id===target.id)!.strokes.slice(page.strokes.length).map(s=>s.id);
    current.onCommitPages(changes);current.onActive(target.id);setIncoming({pageId:target.id,ids,token:performance.now()});return target.id;
  }
  useEffect(()=>()=>stopDrag(),[]);
  useEffect(() => {
    if (viewport.current) motion.current = new ScrollMotion(viewport.current,undefined,()=>latest.current.direction);
    return () => {
      motion.current?.destroy();
      motion.current = null;
    };
  }, []);
  function flushZoom() {
    cancelAnimationFrame(zoomFrame.current);zoomFrame.current=0;
    const pending=pendingZoom.current,v=viewport.current;if(!pending||!v)return;
    pendingZoom.current=null;
    const next=clampZoom(pending.anchor.zoom*pending.point.distance/pending.anchor.distance);
    // Resize the existing surfaces together; never resize their canvas buffers
    // or restart PDF rendering while the fingers are moving.
    v.style.setProperty("--notebook-zoom",String(next));
    measureViewport(v);
    const target=horizontal
      ? horizontalZoomPosition(latest.current.note.pages,pending.anchor,next,pending.point,v.clientHeight,v.clientWidth)
      : pinchViewport(latest.current.note.pages,maxPageWidth,v.clientWidth,pending.anchor,pending.point,v.clientHeight);
    liveZoom.current=next;
    v.scrollLeft=target.left;v.scrollTop=target.top;
    scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
    rememberPosition();
  }
  function finishZoom() {
    flushZoom();pinchAnchor.current=null;
    const v=viewport.current;if(!v)return;
    measureViewport(v);
    if(liveZoom.current!==latest.current.zoom){committedZoom.current=liveZoom.current;latest.current.setZoom(liveZoom.current);}
    else {v.style.removeProperty("--notebook-zoom");v.classList.remove("zooming");v.dispatchEvent(new Event("notebook-zoom-settled"));}
    scroll();
  }
  const previousZoom = useRef(zoom);
  useLayoutEffect(()=>{
    const v=viewport.current;if(!v)return;
    const openingZoom=initialView?.zoom??.7;
    v.style.setProperty("--notebook-zoom",String(openingZoom));
    measureViewport(v);
    liveZoom.current=openingZoom;
    if(initialView){
      const restored=restoreNoteView(latest.current.note.pages,initialView,v.clientWidth,props.direction,v.clientHeight);
      v.scrollLeft=restored.left;v.scrollTop=restored.top;latest.current.onActive(restored.pageId);
    }
    if(openingZoom!==latest.current.zoom){committedZoom.current=openingZoom;latest.current.setZoom(openingZoom);}
    else v.style.removeProperty("--notebook-zoom");
    scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};positionReady.current=true;
    rememberPosition();
    // Ancestor layout may already have changed to the library at unmount.
    // Persist the last editor snapshot rather than measuring that transition.
    return()=>{persistPosition();positionReady.current=false;};
  },[]);
  useLayoutEffect(() => {
    const v = viewport.current;
    if (v && previousZoom.current !== zoom) {
      resetPull();
      motion.current?.stop();
      if(committedZoom.current!==zoom){
        cancelAnimationFrame(zoomFrame.current);zoomFrame.current=0;pendingZoom.current=null;
        pinchAnchor.current=null;gesture.current=null;touches.current.clear();pageSwipe.current=null;
        const from=liveZoom.current,position=scrollPosition.current,size=viewportSize.current;
        const ax=(size.width||v.clientWidth)/2,ay=(size.height||v.clientHeight)/2;
        v.style.setProperty("--notebook-zoom",String(zoom));
        measureViewport(v);
        if(horizontal){
          const target=horizontalZoomPosition(note.pages,
            {...position,zoom:from,x:ax,y:ay,distance:1,viewportWidth:size.width,viewportHeight:size.height||v.clientHeight},
            zoom,{x:v.clientWidth/2,y:v.clientHeight/2},v.clientHeight,v.clientWidth);
          v.scrollLeft=target.left;v.scrollTop=target.top;
        }else{
          v.scrollLeft=zoomScrollLeft(maxPageWidth,size.width||v.clientWidth,from,zoom,position.left,ax,v.clientWidth)+ax-v.clientWidth/2;
          v.scrollTop=zoomScrollTop(note.pages,from,zoom,position.top,ay,undefined,v.clientHeight/2,
            verticalPageInset(note.pages,from,size.height),verticalPageInset(note.pages,zoom,v.clientHeight));
        }
      }
      liveZoom.current=zoom;committedZoom.current=null;
      v.style.removeProperty("--notebook-zoom");v.classList.remove("zooming");
      v.dispatchEvent(new Event("notebook-zoom-settled"));
      scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
    }
    previousZoom.current = zoom;
    if(v)viewportSize.current={width:v.clientWidth,height:v.clientHeight};
    rememberPosition();
  }, [zoom, layoutKey]);
  useLayoutEffect(()=>{
    const v=viewport.current;
    if(!v||props.settingsOpen||previousDirection.current===props.direction)return;
    previousDirection.current=props.direction;
    resetPull();
    motion.current?.stop();
    const saved=viewPosition.current;
    if(saved){
      const restored=restoreNoteView(note.pages,saved,v.clientWidth,props.direction,v.clientHeight);
      v.scrollLeft=restored.left;v.scrollTop=restored.top;
      onActive(restored.pageId);
    }
    scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
    viewportSize.current={width:v.clientWidth,height:v.clientHeight};
    rememberPosition();
  },[props.direction,props.settingsOpen]);
  useEffect(()=>{
    const leave=()=>persistPosition(viewport.current),visibility=()=>{if(window.document.visibilityState==="hidden")leave();};
    const beforeAction=()=>capturePosition();
    window.addEventListener("pagehide",leave);window.document.addEventListener("visibilitychange",visibility);
    window.addEventListener("pointerdown",beforeAction,true);window.addEventListener("keydown",beforeAction,true);
    return()=>{window.removeEventListener("pagehide",leave);window.document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pointerdown",beforeAction,true);window.removeEventListener("keydown",beforeAction,true);clearTimeout(positionTimer.current);};
  },[]);
  useEffect(()=>{
    const v=viewport.current;if(!v)return;
    const observer=new ResizeObserver(()=>{
      if(!v.clientWidth||!v.clientHeight)return;
      const old=viewportSize.current,saved=viewPosition.current;
      measureViewport(v);
      if(latest.current.direction==="horizontal"&&old.width&&old.width!==v.clientWidth&&saved&&!pinchAnchor.current){
        motion.current?.stop();
        const restored=restoreNoteView(latest.current.note.pages,saved,v.clientWidth,"horizontal",v.clientHeight);
        v.scrollLeft=restored.left;v.scrollTop=restored.top;
      }
      viewportSize.current={width:v.clientWidth,height:v.clientHeight};
      scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};rememberPosition();
    });
    observer.observe(v);return()=>observer.disconnect();
  },[]);
  useEffect(() => {
    if (!note.pdf) {
      setDocument(undefined);
      return;
    }
    let disposed = false;
    const task = pdfjs.getDocument({ ...pdfOptions(), data: note.pdf.slice() });
    void task.promise
      .then((doc) => {
        if (!disposed) setDocument(doc);
      })
      .catch(() => {
        if (!disposed) onError("PDFを開けません。");
      });
    return () => {
      disposed = true;
      setDocument(undefined);
      void task.destroy();
    };
  }, [note.id, note.pdf]);
  useEffect(() => {
    if(firstJump.current){firstJump.current=false;return;}
    const id = requestAnimationFrame(() => {
      const v = viewport.current;
      if (!v) return;
      const page = [...v.querySelectorAll<HTMLElement>("[data-page-id]")].find(
        (e) => e.dataset.pageId === props.jump.id,
      );
      if (page) {
        const rect=page.getBoundingClientRect(),area=v.getBoundingClientRect();
        const left=horizontal?v.scrollLeft+rect.left-area.left:v.scrollLeft;
        const top=horizontal?v.scrollTop:v.scrollTop+rect.top-area.top-verticalPageInset(note.pages,liveZoom.current,v.clientHeight);
        if (motion.current) motion.current.easeTo(left,top);
        else {v.scrollLeft=left;v.scrollTop=top;}
        scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
      }
    });
    return () => cancelAnimationFrame(id);
  }, [props.jump.token, note.id]);
  useLayoutEffect(()=>{
    const last=note.pages.at(-1)?.id;
    const before=previousPages.current!;previousPages.current=notePageIds(note);
    if(last&&note.pages.length>before.size&&!before.has(last)){
      const handoff=pullHandoff.current,v=viewport.current;
      if(handoff&&v){
        resetPull();
        const old=[...v.querySelectorAll<HTMLElement>("[data-page-id]")].find(p=>p.dataset.pageId===handoff.id);
        if(old){
          const rect=old.getBoundingClientRect(),area=v.getBoundingClientRect();
          if(horizontal)v.scrollLeft=pagePullHandoff(v.scrollLeft,handoff.left,rect.left-area.left);
          else v.scrollTop=pagePullHandoff(v.scrollTop,handoff.top,rect.top-area.top);
        }
        swipeArrival.current=last;pullHandoff.current=null;
        scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
      }
      setAddedPage(last);
    }
  },[layoutKey]);
  useEffect(()=>{
    if(!addedPage)return;
    const timer=setTimeout(()=>setAddedPage(undefined),1100);
    return()=>clearTimeout(timer);
  },[addedPage]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(zoomFrame.current);
      clearTimeout(pullTimer.current);
      previewWork.setWriting(false);props.onWriting(false);
    },
    [],
  );
  function writing(id: string, b: boolean) {
    if (b) {
      motion.current?.stop();
      if(pinchAnchor.current||pendingZoom.current||liveZoom.current!==latest.current.zoom)finishZoom();
      drawing.current.add(id);
      touches.current.clear();
      pageSwipe.current=null;
      gesture.current = null;
      resetPull();
    } else drawing.current.delete(id);
    previewWork.setWriting(drawing.current.size>0);
    latest.current.onWriting(drawing.current.size > 0);
  }
  function scroll() {
    const v=viewport.current;
    if(!v||!v.clientWidth||!v.clientHeight)return;
    scrollPosition.current={left:v.scrollLeft,top:v.scrollTop};
    rememberPosition();
    if(pinchAnchor.current)return;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const v = viewport.current;
      if (!v?.clientWidth || drawing.current.size || pinchAnchor.current) return;
      const across=latest.current.direction==="horizontal",area=v.getBoundingClientRect();
      if(across&&viewportSize.current.width!==v.clientWidth)return;
      const edge=across?area.left:area.top;
      const probe=edge+(across?v.clientWidth/2:Math.min(v.clientHeight*0.3,150));
      const pages=[...v.querySelectorAll<HTMLElement>("[data-page-id]")];
      const active=pages.find(e=>e.getBoundingClientRect()[across?"right":"bottom"]>probe)||pages.at(-1);
      if (active?.dataset.pageId) onActive(active.dataset.pageId);
    });
  }
  function down(e: RPointerEvent<HTMLDivElement>) {
    if (drawing.current.size || e.button===2) return;
    if (e.pointerType !== "touch" && props.tool !== "hand" && e.button !== 1)
      return;
    motion.current?.stop();
    if(pullVisualRef.current?.returning)resetPull();
    flushZoom();
    velocity.current = { x: 0, y: 0, time: e.timeStamp };
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size > 1) {
      pageSwipe.current=null;
      swipe.current.multi = true;
      swipe.current.distance = 0;
      swipe.current.vertical=null;
      resetPull();
    } else {
      const pageGesture=e.pointerType==="touch"||(e.pointerType==="mouse"&&props.tool==="hand"&&e.button===0);
      swipe.current={distance:0,multi:!pageGesture,vertical:null};
      if(horizontal&&pageGesture){
        const v=e.currentTarget,edge=v.getBoundingClientRect().left,left=v.scrollLeft;
        const starts=[...v.querySelectorAll<HTMLElement>("[data-page-id]")]
          .map(slot=>left+slot.getBoundingClientRect().left-edge);
        const index=horizontalPageIndex(starts,left+v.clientWidth/2);
        if(starts.length)pageSwipe.current={x:e.clientX,y:e.clientY,left,index,starts,max:Math.max(0,v.scrollWidth-v.clientWidth),deltaX:0};
      }
    }
    rebaseGesture();
  }
  function rebaseGesture() {
    const current=touchGeometry([...touches.current.values()]),v=viewport.current!;
    gesture.current=current;
    pinchAnchor.current=null;
    if(current&&touches.current.size>=2){
      const r=v.getBoundingClientRect();
      pinchAnchor.current={zoom:liveZoom.current,left:v.scrollLeft,top:v.scrollTop,x:current.x-r.left,y:current.y-r.top,distance:Math.max(1,current.distance),viewportWidth:v.clientWidth,viewportHeight:v.clientHeight};
      v.classList.add("zooming");
    }
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId) || drawing.current.size) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...touches.current.values()],v=viewport.current!,current=touchGeometry(points)!;
    const {x,y}=current,prev=gesture.current;
    if(pinchAnchor.current&&points.length>=2){
      const r=v.getBoundingClientRect();
      pendingZoom.current={anchor:pinchAnchor.current,point:{...current,x:x-r.left,y:y-r.top}};
      if(!zoomFrame.current)zoomFrame.current=requestAnimationFrame(flushZoom);
      gesture.current=current;return;
    }
    const paged=pageSwipe.current;
    if(paged){
      paged.deltaX=x-paged.x;
      const deltaY=y-paged.y;
      if(!paged.axis&&Math.max(Math.abs(paged.deltaX),Math.abs(deltaY))>=12)
        paged.axis=Math.abs(paged.deltaX)>Math.abs(deltaY)?"horizontal":"vertical";
      if(!paged.axis)return;
      if(paged.axis==="horizontal"){
        const {starts,index,left,deltaX}=paged;
        const first=starts[Math.max(0,index-1)],last=index===starts.length-1?paged.max:starts[index+1];
        v.scrollLeft=Math.min(Math.max(left,last),Math.max(Math.min(left,first),left-deltaX));
        swipe.current.distance=index===starts.length-1?Math.max(0,left-deltaX-last):0;
        setPull(swipe.current.distance);
        rememberPosition();
        gesture.current=current;
        return;
      }
    }
    if (prev) {
      const dx=paged?0:x-prev.x,dy=y-prev.y;
      v.scrollLeft -= dx;
      if(!horizontal&&points.length===1&&!swipe.current.multi){
        const next=advanceVerticalPagePull(swipe.current.vertical,prev.y,y,v.scrollTop,v.scrollHeight-v.clientHeight);
        swipe.current.vertical=next.anchor;swipe.current.distance=next.distance;
        v.scrollTop=next.scrollTop;setPull(next.distance);
      }else v.scrollTop-=dy;
      rememberPosition();
      const dt = Math.max(1, e.timeStamp - velocity.current.time);
      velocity.current = {
        x: velocity.current.x * 0.4 + (-(x - prev.x) / dt) * 0.6,
        y: velocity.current.y * 0.4 + (-dy / dt) * 0.6,
        time: e.timeStamp,
      };
    }
    gesture.current = current;
  }
  function end(e: RPointerEvent<HTMLDivElement>) {
    if(isForeignPointerCaptureLoss(e.type,e.target,e.currentTarget,e.currentTarget.hasPointerCapture(e.pointerId)))return;
    if (!touches.current.has(e.pointerId)) return;
    flushZoom();
    const v=viewport.current!;
    const paged=pageSwipe.current;
    pageSwipe.current=null;
    const cancelled=e.type!=="pointerup";
    const add = shouldAddPage(
        true,
        horizontal ? !!paged&&paged.index===paged.starts.length-1 : !!swipe.current.vertical,
        swipe.current.distance,
        cancelled,
        swipe.current.multi,
      );
    touches.current.delete(e.pointerId);
    if(touches.current.size<2)finishZoom();
    rebaseGesture();
    swipe.current.distance = 0;
    if (add) {
      touches.current.clear();
      const slot=v.querySelector<HTMLElement>(".continuous-page:last-child");
      if(slot){const rect=slot.getBoundingClientRect(),area=v.getBoundingClientRect();pullHandoff.current={id:slot.dataset.pageId!,left:rect.left-area.left,top:rect.top-area.top};}
      props.onAddPage();
    } else {
      setPull(0);
      if(paged?.axis==="horizontal"){
      const target=cancelled?paged.left:paged.starts[pageAfterSwipe(paged.index,paged.deltaX,paged.starts.length)];
      if(motion.current)motion.current.easeTo(target,v.scrollTop);
      else v.scrollLeft=target;
    } else if (
      e.type === "pointerup" &&
      !swipe.current.multi &&
      !touches.current.size &&
      e.timeStamp - velocity.current.time < 90
    ) {
      motion.current?.fling(velocity.current.x, velocity.current.y);
      }
    }
  }
  return (
    <>
    <div
      className={
        "viewport continuous-viewport " + (horizontal?"horizontal ":"") +
        (props.tool === "hand" ? "panning" : "")
      }
      ref={viewport}
      style={{"--page-gap":`${PAGE_GAP}px`} as CSSProperties}
      onScroll={scroll}
      onPointerDownCapture={() => motion.current?.stop()}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        ref={stack}
        className="continuous-stack"
        style={horizontal?{
          height:`calc(${maxPageHeight}px * var(--notebook-zoom, ${zoom}) + 24px)`,
        } as CSSProperties:{
          width: `calc(${maxPageWidth}px * var(--notebook-zoom, ${zoom}))`,
          "--pages-height":`calc(${pagesHeight.height}px * var(--notebook-zoom, ${zoom}) + ${pagesHeight.spacing}px)`,
        } as CSSProperties}
      >
        {note.pages.map((page, index) => (
          <PageSlot
            key={page.id}
            page={page}
            index={index}
            isActive={props.activePageId===page.id}
            isNew={addedPage===page.id&&swipeArrival.current!==page.id}
            root={viewport}
            document={document}
            props={pageSettings}
            onWriting={callbacks.onWriting}
            incoming={incoming?.pageId===page.id?incoming:undefined}
            onSelectionDrag={callbacks.onSelectionDrag}
          />
        ))}
      </div>
    </div>
    {pullVisual&&<VStack className="page-pull-layer" aria-hidden="true">
      <VStack className={"page-pull-paper "+(pullVisual.returning?"returning":"")+(pull>=90?" armed":"")} style={{left:pullVisual.geometry.left,top:pullVisual.geometry.top,width:pullVisual.geometry.width,height:pullVisual.geometry.height,transform:`translate3d(${horizontal?-pullVisual.offset:0}px,${horizontal?0:-pullVisual.offset}px,0)`}}>
        <PagePreview page={pullVisual.page} dark={props.dark} number={note.pages.length+1}/>
        <VStack className="page-pull-caption" hAlign="center" gap={2}>
          {pull>=90?<Check size={28}/>:horizontal?<ArrowLeft size={28}/>:<ArrowUp size={28}/>}
          <Text weight="semibold">{pull>=90?"離して追加":"新しいページ"}</Text>
        </VStack>
      </VStack>
    </VStack>}
    {(pull>0||addedPage)&&<section className={"pull-indicator "+(horizontal?"pull-horizontal ":"")+(addedPage?"added":pull>=90?"armed":"")} role="status" aria-live="polite">
      <HStack gap={3} vAlign="center">
          <Text size="sm" weight="semibold">{addedPage?"ページを追加しました":pull>=90?"離して新しいページを追加":`さらに${horizontal?"左":"上"}へスワイプ`}</Text>
        {!addedPage&&(pull>=90?<Check className="pull-ready-icon" size={20}/>:horizontal?<ArrowLeft size={20}/>:<ArrowUp size={20}/>)}
      </HStack>
    </section>}
    {createPortal(<canvas ref={ghost} className="selection-drag-ghost" aria-hidden="true"/>,window.document.body)}
    </>
  );
}
