import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as RPointerEvent,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Note, Page, Stroke } from "./model";
import { ScrollMotion } from "./motion";
import { pagePaperColor } from "./paper";
import { zoomScrollTop, clampZoom } from "./scrolling";
import { Sheet, type Tool } from "./Sheet";
import { pdfjs, pdfOptions } from "./pdf";
import { shouldAddPage, type EraserMode } from "./editing";
import {selectionBounds,renderScale} from "./editing";
import {drawStroke} from "./draw";
import {createPortal} from "react-dom";
import {transferSelection,type SelectionDrag,type IncomingSelection} from "./selectionTransfer";
import type {PageChange} from "./notebookHistory";
type Props = {
  note: Note;
  onPasted: () => void;
  dark: boolean;
  activePageId: string;
  jump: { id: string; token: number };
  zoom: number;
  setZoom: (zoom: number) => void;
  tool: Tool;
  color: string;
  width: number;
  pressure: boolean;
  dotted: boolean;
  dashed: boolean;
  shapeCorrection: boolean;
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
function PageSlot({
  page,
  index,
  root,
  document,
  props,
  onWriting,
  incoming,
  onSelectionDrag,
}: {
  page: Page;
  index: number;
  root: RefObject<HTMLDivElement | null>;
  document?: PDFDocumentProxy;
  props: Props;
  onWriting: (id: string, b: boolean) => void;
  incoming?:IncomingSelection;
  onSelectionDrag:(id:string,drag:SelectionDrag)=>string|undefined;
}) {
  const slot = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(index === 0),
    [pinned, setPinned] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: root.current, rootMargin: "600px" },
    );
    if (slot.current) observer.observe(slot.current);
    return () => observer.disconnect();
  }, [root]);
  return (
    <div
      ref={slot}
      className="continuous-page"
      data-page-id={page.id}
      style={{
        width: page.width * props.zoom,
        height: page.height * props.zoom + 24,
      }}
    >
      <div className="page-label">
        {index + 1} / {props.note.pages.length}
      </div>
      {visible || pinned ? (
        <Sheet
          page={page}
          onPasted={props.onPasted}
          paperColor={pagePaperColor(page, props.dark)}
          isActive={props.activePageId === page.id}
          pdfDocument={document}
          zoom={props.zoom}
          tool={props.tool}
          color={props.color}
          width={props.width}
          pressure={props.pressure}
          dotted={props.dotted}
          dashed={props.dashed}
          shapeCorrection={props.shapeCorrection}
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
            height: page.height * props.zoom,
            background: pagePaperColor(page, props.dark),
          }}
        >
          ページ {index + 1}
        </div>
      )}
    </div>
  );
}
export function ContinuousNotebook(props: Props) {
  const ghost=useRef<HTMLCanvasElement>(null),dragging=useRef<{id:string;drag:SelectionDrag;bounds:{left:number;top:number;right:number;bottom:number}}|null>(null);
  const dragFrame=useRef(0),dropTarget=useRef<HTMLElement|null>(null),dragTime=useRef(0);
  const [incoming,setIncoming]=useState<IncomingSelection>();
  const latest=useRef(props);latest.current=props;
  const viewport = useRef<HTMLDivElement>(null),
    [document, setDocument] = useState<PDFDocumentProxy>(),
    [pull, setPull] = useState(0),
    drawing = useRef(new Set<string>());
  const touches = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{ x: number; y: number; distance: number } | null>(null),
    swipe = useRef({ distance: 0, multi: false }),
    frame = useRef(0);
  const { note, zoom, setZoom, onActive, onError } = props;
  const motion = useRef<ScrollMotion | null>(null),
    velocity = useRef({ x: 0, y: 0, time: 0 });
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
    if (viewport.current) motion.current = new ScrollMotion(viewport.current);
    return () => {
      motion.current?.destroy();
      motion.current = null;
    };
  }, []);
  const previousZoom = useRef(zoom),
    scrollY = useRef(0),
    zoomAnchor = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const v = viewport.current;
    if (v && previousZoom.current !== zoom) {
      motion.current?.stop();
      v.scrollTop = zoomScrollTop(
        note.pages,
        previousZoom.current,
        zoom,
        scrollY.current,
        zoomAnchor.current ?? v.clientHeight / 2,
      );
      scrollY.current = v.scrollTop;
    }
    previousZoom.current = zoom;
    zoomAnchor.current = undefined;
  }, [zoom, note.pages]);
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
    const id = requestAnimationFrame(() => {
      const v = viewport.current;
      if (!v) return;
      const page = [...v.querySelectorAll<HTMLElement>("[data-page-id]")].find(
        (e) => e.dataset.pageId === props.jump.id,
      );
      if (page) {
        const top =
          v.scrollTop +
          page.getBoundingClientRect().top -
          v.getBoundingClientRect().top -
          16;
        if (motion.current) motion.current.easeTo(v.scrollLeft, top);
        else v.scrollTop = top;
        scrollY.current = v.scrollTop;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [props.jump.token, note.id]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      props.onWriting(false);
    },
    [],
  );
  function writing(id: string, b: boolean) {
    if (b) {
      motion.current?.stop();
      drawing.current.add(id);
      touches.current.clear();
      gesture.current = null;
      setPull(0);
    } else drawing.current.delete(id);
    props.onWriting(drawing.current.size > 0);
  }
  function scroll() {
    if (viewport.current) scrollY.current = viewport.current.scrollTop;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const v = viewport.current;
      if (!v || drawing.current.size) return;
      const y =
        v.getBoundingClientRect().top + Math.min(v.clientHeight * 0.3, 150);
      const pages = [...v.querySelectorAll<HTMLElement>("[data-page-id]")];
      const active =
        pages.find((e) => e.getBoundingClientRect().bottom > y) || pages.at(-1);
      if (active?.dataset.pageId) onActive(active.dataset.pageId);
    });
  }
  function down(e: RPointerEvent<HTMLDivElement>) {
    if (drawing.current.size) return;
    if (e.pointerType !== "touch" && props.tool !== "hand" && e.button !== 1)
      return;
    motion.current?.stop();
    velocity.current = { x: 0, y: 0, time: e.timeStamp };
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size > 1) {
      swipe.current.multi = true;
      swipe.current.distance = 0;
      setPull(0);
    } else swipe.current = { distance: 0, multi: e.pointerType !== "touch" };
    gesture.current = { x: e.clientX, y: e.clientY, distance: 0 };
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId) || drawing.current.size) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...touches.current.values()],
      v = viewport.current!,
      x = points.reduce((s, p) => s + p.x, 0) / points.length,
      y = points.reduce((s, p) => s + p.y, 0) / points.length,
      distance =
        points.length > 1
          ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          : 0,
      prev = gesture.current;
    if (prev) {
      const dy = y - prev.y,
        max = Math.max(0, v.scrollHeight - v.clientHeight),
        before = v.scrollTop;
      v.scrollLeft -= x - prev.x;
      v.scrollTop -= dy;
      const dt = Math.max(1, e.timeStamp - velocity.current.time);
      velocity.current = {
        x: velocity.current.x * 0.4 + (-(x - prev.x) / dt) * 0.6,
        y: velocity.current.y * 0.4 + (-dy / dt) * 0.6,
        time: e.timeStamp,
      };
      if (points.length === 1 && !swipe.current.multi) {
        if (dy < 0 && v.scrollTop >= max - 3)
          swipe.current.distance += Math.max(0, -dy - (max - before));
        else if (dy > 0)
          swipe.current.distance = Math.max(0, swipe.current.distance - dy);
        if (Math.abs(x - prev.x) > Math.abs(dy) * 2) swipe.current.distance = 0;
        setPull(swipe.current.distance);
      }
      if (distance && prev.distance) {
        const next = clampZoom((zoom * distance) / prev.distance),
          r = v.getBoundingClientRect(),
          ax = x - r.left,
          ay = y - r.top,
          sx = (v.scrollLeft + ax) / zoom;
        scrollY.current = v.scrollTop;
        zoomAnchor.current = ay;
        setZoom(next);
        requestAnimationFrame(() => {
          v.scrollLeft = sx * next - ax;
        });
      }
    }
    gesture.current = { x, y, distance };
  }
  function end(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId)) return;
    const v = viewport.current!,
      add = shouldAddPage(
        true,
        v.scrollTop + v.clientHeight >= v.scrollHeight - 3,
        swipe.current.distance,
        e.type !== "pointerup",
        swipe.current.multi,
      );
    touches.current.delete(e.pointerId);
    gesture.current = null;
    swipe.current.distance = 0;
    setPull(0);
    if (add) {
      touches.current.clear();
      props.onAddPage();
    } else if (
      e.type === "pointerup" &&
      !swipe.current.multi &&
      !touches.current.size &&
      e.timeStamp - velocity.current.time < 90
    ) {
      motion.current?.fling(velocity.current.x, velocity.current.y);
    }
  }
  return (
    <div
      className={
        "viewport continuous-viewport " +
        (props.tool === "hand" ? "panning" : "")
      }
      ref={viewport}
      onScroll={scroll}
      onPointerDownCapture={() => motion.current?.stop()}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        className="continuous-stack"
        style={{
          width: Math.max(...note.pages.map((p) => p.width)) * zoom + 96,
        }}
      >
        {note.pages.map((page, index) => (
          <PageSlot
            key={page.id}
            page={page}
            index={index}
            root={viewport}
            document={document}
            props={props}
            onWriting={writing}
            incoming={incoming}
            onSelectionDrag={selectionDrag}
          />
        ))}
      </div>
      {pull > 0 && (
        <div
          className={"pull-indicator " + (pull >= 90 ? "armed" : "")}
          role="status"
        >
          {pull >= 90
            ? "離して新しいページを追加"
            : "さらに上へスワイプしてページを追加"}
          <progress max={90} value={Math.min(90, pull)} />
        </div>
      )}
      {createPortal(<canvas ref={ghost} className="selection-drag-ghost" aria-hidden="true"/>,window.document.body)}
    </div>
  );
}
