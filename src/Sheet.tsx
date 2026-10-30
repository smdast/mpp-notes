import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { drawPaper, drawStroke } from "./draw";
import { pagePoint, uid, type Page, type Point, type Stroke } from "./model";
import {
  erase,
  selectLasso,
  moveSelection,
  selectionBounds,
  renderScale,
  shouldAddPage,
  type EraserMode,
} from "./editing";
import { pdfjs, pdfOptions } from "./pdf";
export type Tool = "pen" | "marker" | "eraser" | "lasso" | "hand";
type Props = {
  page: Page;
  pdf?: Uint8Array;
  zoom: number;
  setZoom: (v: number) => void;
  tool: Tool;
  color: string;
  width: number;
  mouse: boolean;
  eraserMode: EraserMode;
  eraserSize: number;
  isLastPage: boolean;
  onAddPage: () => void;
  onCommit: (strokes: Stroke[]) => void;
  onError: (message: string) => void;
  onWriting: (writing: boolean) => void;
};
export function Sheet({
  page,
  pdf,
  zoom,
  setZoom,
  tool,
  color,
  width,
  mouse,
  eraserMode,
  eraserSize,
  isLastPage,
  onAddPage,
  onCommit,
  onError,
  onWriting,
}: Props) {
  const cursor = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLCanvasElement>(null),
    ink = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
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
  const touches = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const swipe = useRef({ distance: 0, multi: false }),
    [pull, setPull] = useState(0),
    [pdfLoading, setPdfLoading] = useState(false);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  useEffect(() => {
    const resize = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const pixels = renderScale(page.width, page.height, zoom, dpr);
  function paint() {
    const c = ink.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(c.width / page.width, 0, 0, c.height / page.height, 0, 0);
    ctx.clearRect(0, 0, page.width, page.height);
    working.current.forEach((s) => drawStroke(ctx, s));
    if (current.current) drawStroke(ctx, current.current);
    if (tool === "lasso") {
      ctx.save();
      ctx.strokeStyle = "#397956";
      ctx.lineWidth = 1.3 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      const b = selectionBounds(working.current, selected.current);
      if (b) {
        ctx.fillStyle = "#427b5812";
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
  useEffect(() => {
    working.current = page.strokes;
    selected.current = new Set(
      [...selected.current].filter((id) =>
        page.strokes.some((s) => s.id === id),
      ),
    );
    paint();
  }, [page.strokes, page.id, pixels, tool]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      onWriting(false);
    },
    [],
  );
  useEffect(() => {
    const canvas = paper.current!;
    let disposed = false;
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    let render: { cancel: () => void } | undefined;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(
      canvas.width / page.width,
      0,
      0,
      canvas.height / page.height,
      0,
      0,
    );
    drawPaper(ctx, page);
    if (pdf && page.pdfIndex !== undefined) {
      setPdfLoading(true);
      task = pdfjs.getDocument({ ...pdfOptions(), data: pdf.slice() });
      void (async () => {
        try {
          const document = await task!.promise;
          const p = await document.getPage(page.pdfIndex! + 1);
          if (disposed) return;
          const v = p.getViewport({ scale: pixels });
          canvas.width = Math.ceil(v.width);
          canvas.height = Math.ceil(v.height);
          render = p.render({ canvasContext: ctx, canvas, viewport: v });
          await (render as ReturnType<typeof p.render>).promise;
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
      void task?.destroy();
    };
  }, [page.id, page.paper, pdf, pixels]);
  const point = (e: {
    clientX: number;
    clientY: number;
    pressure: number;
    pointerType?: string;
  }) =>
    pagePoint(
      e.clientX,
      e.clientY,
      ink.current!.getBoundingClientRect(),
      page,
      e.pointerType === "mouse" ? 0.5 : e.pressure,
    );
  function applyEraser(a: Point, b: Point) {
    working.current = erase(
      working.current,
      a,
      b,
      eraserSize / 2 / zoom,
      eraserMode,
    );
  }
  function down(e: RPointerEvent<HTMLCanvasElement>) {
    if (
      e.pointerType === "touch" ||
      tool === "hand" ||
      (e.pointerType === "mouse" && !mouse && tool !== "lasso") ||
      e.button === 1
    )
      return;
    if (active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    touches.current.clear();
    gesture.current = null;
    swipe.current = { distance: 0, multi: false };
    setPull(0);
    active.current = e.pointerId;
    onWriting(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    working.current = page.strokes;
    original.current = page.strokes;
    erasing.current =
      tool === "eraser" || (e.buttons & 32) !== 0 || (e.buttons & 2) !== 0;
    const p = point(e);
    last.current = p;
    if (erasing.current) applyEraser(p, p);
    else if (tool === "lasso") {
      const b = selectionBounds(page.strokes, selected.current);
      if (
        b &&
        p.x >= b.left - 8 &&
        p.x <= b.right + 8 &&
        p.y >= b.top - 8 &&
        p.y <= b.bottom + 8
      )
        moving.current = p;
      else {
        selected.current.clear();
        lasso.current = [p];
      }
    } else
      current.current = {
        id: uid(),
        tool: tool === "marker" ? "marker" : "pen",
        color,
        width: tool === "marker" ? width * 5 : width,
        points: [p],
      };
    schedule();
  }
  function move(e: RPointerEvent<HTMLCanvasElement>) {
    if (cursor.current) {
      const show =
        e.pointerType !== "touch" &&
        (tool === "eraser" || (active.current !== null && erasing.current));
      cursor.current.style.display = show ? "block" : "none";
      if (show) {
        const rect = e.currentTarget.getBoundingClientRect();
        cursor.current.style.transform = `translate(${e.clientX - rect.left - eraserSize / 2}px,${e.clientY - rect.top - eraserSize / 2}px)`;
      }
    }

    if (active.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const samples = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample);
      if (erasing.current) {
        applyEraser(last.current || p, p);
        last.current = p;
      } else if (tool === "lasso") {
        if (moving.current)
          working.current = moveSelection(
            original.current,
            selected.current,
            p.x - moving.current.x,
            p.y - moving.current.y,
          );
        else lasso.current.push(p);
      } else current.current?.points.push(p);
    }
    schedule();
  }
  function finish(e: RPointerEvent<HTMLCanvasElement>) {
    if (active.current !== e.pointerId) return;
    e.stopPropagation();
    const cancel =
      e.type === "pointercancel" || e.type === "lostpointercapture";
    if (tool === "lasso" && !erasing.current) {
      if (cancel) working.current = original.current;
      else if (!moving.current)
        selected.current = selectLasso(working.current, lasso.current);
      moving.current = null;
      lasso.current = [];
    }
    if (current.current)
      working.current = [...working.current, current.current];
    current.current = null;
    active.current = null;
    last.current = null;
    onWriting(false);
    if (working.current !== page.strokes) onCommit(working.current);
    paint();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function gestureDown(e: RPointerEvent<HTMLDivElement>) {
    if (active.current !== null) return;
    if (e.pointerType !== "touch" && tool !== "hand" && e.button !== 1) return;
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
  function gestureMove(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId) || active.current !== null) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...touches.current.values()],
      v = viewport.current!;
    const x = points.reduce((s, p) => s + p.x, 0) / points.length,
      y = points.reduce((s, p) => s + p.y, 0) / points.length,
      distance =
        points.length > 1
          ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          : 0;
    const prev = gesture.current;
    if (prev) {
      const dy = y - prev.y;
      const maxScroll = Math.max(0, v.scrollHeight - v.clientHeight),
        before = v.scrollTop;
      v.scrollLeft -= x - prev.x;
      v.scrollTop -= dy;
      if (points.length === 1 && !swipe.current.multi && isLastPage) {
        if (dy < 0 && v.scrollTop >= maxScroll - 3)
          swipe.current.distance += Math.max(0, -dy - (maxScroll - before));
        else if (dy > 0)
          swipe.current.distance = Math.max(0, swipe.current.distance - dy);
        if (Math.abs(x - prev.x) > Math.abs(dy) * 2) swipe.current.distance = 0;
        setPull(swipe.current.distance);
      }
      if (distance && prev.distance) {
        const next = Math.max(
          0.25,
          Math.min(2.5, (zoom * distance) / prev.distance),
        );
        const rect = v.getBoundingClientRect();
        const ax = x - rect.left,
          ay = y - rect.top,
          sx = (v.scrollLeft + ax - 48) / zoom,
          sy = (v.scrollTop + ay - 48) / zoom;
        setZoom(next);
        requestAnimationFrame(() => {
          v.scrollLeft = sx * next + 48 - ax;
          v.scrollTop = sy * next + 48 - ay;
        });
      }
    }
    gesture.current = { x, y, distance };
  }
  function gestureEnd(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId)) return;
    const v = viewport.current!;
    const add = shouldAddPage(
      isLastPage,
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
      onAddPage();
    }
  }
  return (
    <div
      className={"viewport " + (tool === "hand" ? "panning" : "")}
      ref={viewport}
      onPointerDown={gestureDown}
      onPointerMove={gestureMove}
      onPointerUp={gestureEnd}
      onPointerCancel={gestureEnd}
      onLostPointerCapture={gestureEnd}
    >
      <div
        className="sheet-space"
        style={{
          width: page.width * zoom + 96,
          minHeight: page.height * zoom + 96,
        }}
      >
        <div
          className="sheet"
          style={{ width: page.width * zoom, height: page.height * zoom }}
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
        </div>
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
    </div>
  );
}
