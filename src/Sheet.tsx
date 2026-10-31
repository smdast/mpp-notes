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
  type EraserMode,
} from "./editing";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { correctShape } from "./shapes";
import { pressureValue } from "./preferences";
export type Tool = "pen" | "marker" | "eraser" | "lasso" | "hand";
type Props = {
  page: Page;
  pdfDocument?: PDFDocumentProxy;
  pressure: boolean;
  shapeCorrection: boolean;
  onActivate: () => void;
  zoom: number;
  tool: Tool;
  color: string;
  width: number;
  mouse: boolean;
  eraserMode: EraserMode;
  eraserSize: number;
  onCommit: (strokes: Stroke[]) => void;
  onError: (message: string) => void;
  onWriting: (writing: boolean) => void;
};
export function Sheet({
  page,
  pdfDocument,
  pressure,
  shapeCorrection,
  onActivate,
  zoom,
  tool,
  color,
  width,
  mouse,
  eraserMode,
  eraserSize,
  onCommit,
  onError,
  onWriting,
}: Props) {
  const cursor = useRef<HTMLDivElement>(null);
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
  const [pdfLoading, setPdfLoading] = useState(false);
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
    drawPaper(ctx, page);
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
  }, [page.id, page.paper, pdfDocument, pixels]);
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
      pressureValue(e.pointerType === "mouse" ? 0.5 : e.pressure, pressure),
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
    onActivate();
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
        pressure,
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
      working.current = [
        ...working.current,
        !cancel && shapeCorrection
          ? correctShape(current.current)
          : current.current,
      ];
    current.current = null;
    active.current = null;
    last.current = null;
    onWriting(false);
    if (working.current !== page.strokes) onCommit(working.current);
    paint();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
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
  );
}
