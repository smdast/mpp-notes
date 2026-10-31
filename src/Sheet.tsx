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
  transformSelection,
  selectionBounds,
  renderScale,
  type EraserMode,
} from "./editing";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { correctShape } from "./shapes";
import { SelectionTools } from "./SelectionTools";
import { isDarkColor } from "./paper";
import { pressureValue } from "./preferences";
export type Tool = "pen" | "marker" | "eraser" | "lasso" | "hand";
type Props = {
  page: Page;
  paperColor: string;
  isActive: boolean;
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
  paperColor,
  isActive,
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
  const [, refreshSelection] = useState(0),
    [editingSelection, setEditingSelection] = useState(false);
  const transform = useRef<{
    kind: "scale" | "rotate";
    start: Point;
    cx: number;
    cy: number;
    startX: number;
    startY: number;
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
  function removeSelection() {
    if (!selected.current.size) return;
    onActivate();
    working.current = page.strokes.filter((s) => !selected.current.has(s.id));
    selected.current.clear();
    onCommit(working.current);
    refreshSelection((v) => v + 1);
    paint();
  }
  useEffect(() => {
    if (!isActive) clearSelection();
  }, [isActive]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !isActive ||
        tool !== "lasso" ||
        !selected.current.size ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelection();
      } else if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [isActive, tool, page.strokes]);
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
      ctx.strokeStyle = isDarkColor(paperColor) ? "#acd49a" : "#397956";
      ctx.lineWidth = 1.3 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      const b = selectionBounds(working.current, selected.current);
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
        for (const [x, y] of [
          [b.left, b.top],
          [b.right, b.top],
          [b.left, b.bottom],
          [b.right, b.bottom],
        ]) {
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
  useEffect(() => {
    working.current = page.strokes;
    selected.current = new Set(
      [...selected.current].filter((id) =>
        page.strokes.some((s) => s.id === id),
      ),
    );
    refreshSelection((v) => v + 1);
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
    drawPaper(ctx, page, paperColor);
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
  }, [page.id, page.paper, page.paperColor, paperColor, pdfDocument, pixels]);
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
      const corners = b
        ? [
            [b.left, b.top, b.right, b.bottom],
            [b.right, b.top, b.left, b.bottom],
            [b.left, b.bottom, b.right, b.top],
            [b.right, b.bottom, b.left, b.top],
          ]
        : [];
      const corner = corners.find(
        ([x, y]) => Math.hypot(p.x - x, p.y - y) < 12 / zoom,
      );
      const rotate =
        b &&
        Math.hypot(p.x - (b.left + b.right) / 2, p.y - (b.top - 22 / zoom)) <
          12 / zoom;
      if (b && rotate) {
        transform.current = {
          kind: "rotate",
          start: p,
          cx: (b.left + b.right) / 2,
          cy: (b.top + b.bottom) / 2,
          startX: 0,
          startY: 0,
        };
        setEditingSelection(true);
      } else if (corner) {
        const [x, y, cx, cy] = corner;
        transform.current = {
          kind: "scale",
          start: p,
          cx,
          cy,
          startX: x - cx,
          startY: y - cy,
        };
        setEditingSelection(true);
      } else if (
        b &&
        p.x >= b.left - 8 &&
        p.x <= b.right + 8 &&
        p.y >= b.top - 8 &&
        p.y <= b.bottom + 8
      ) {
        moving.current = p;
        setEditingSelection(true);
      } else {
        selected.current.clear();
        lasso.current = [p];
        refreshSelection((v) => v + 1);
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
            const safe = (n: number) =>
              Math.sign(n || 1) * Math.max(0.05, Math.min(20, Math.abs(n)));
            let sx = safe((p.x - t.cx) / (t.startX || 1)),
              sy = safe((p.y - t.cy) / (t.startY || 1));
            if (e.shiftKey) {
              const magnitude = Math.max(Math.abs(sx), Math.abs(sy));
              sx = Math.sign(sx) * magnitude;
              sy = Math.sign(sy) * magnitude;
            }
            working.current = transformSelection(
              original.current,
              selected.current,
              { scaleX: sx, scaleY: sy, cx: t.cx, cy: t.cy },
            );
          }
        } else if (moving.current)
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
      else if (!moving.current && !transform.current)
        selected.current = selectLasso(working.current, lasso.current);
      moving.current = null;
      transform.current = null;
      setEditingSelection(false);
      refreshSelection((v) => v + 1);
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
  const bounds = selectionBounds(working.current, selected.current);
  return (
    <div
      className="sheet"
      style={{
        width: page.width * zoom,
        height: page.height * zoom,
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
      {isActive && tool === "lasso" && bounds && !editingSelection && (
        <SelectionTools
          count={selected.current.size}
          left={bounds.left * zoom}
          top={
            bounds.top * zoom > 120
              ? bounds.top * zoom - 110
              : Math.min(page.height * zoom - 90, bounds.bottom * zoom + 35)
          }
          maxWidth={page.width * zoom}
          onTransform={applyTransform}
          onDelete={removeSelection}
          onClear={clearSelection}
        />
      )}
      {pdfLoading && <div className="page-loading">PDFを読み込み中…</div>}
    </div>
  );
}
