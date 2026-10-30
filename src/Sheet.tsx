import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { drawPaper, drawStroke } from "./draw";
import {
  hits,
  pagePoint,
  uid,
  type Page,
  type Point,
  type Stroke,
} from "./model";
import { pdfjs, pdfOptions } from "./pdf";
export type Tool = "pen" | "marker" | "eraser" | "hand";
type Props = {
  page: Page;
  pdf?: Uint8Array;
  zoom: number;
  setZoom: (v: number) => void;
  tool: Tool;
  color: string;
  width: number;
  mouse: boolean;
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
  onCommit,
  onError,
  onWriting,
}: Props) {
  const paper = useRef<HTMLCanvasElement>(null),
    ink = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const current = useRef<Stroke | null>(null),
    working = useRef<Stroke[]>(page.strokes),
    active = useRef<number | null>(null),
    last = useRef<Point | null>(null),
    erasing = useRef(false),
    frame = useRef(0);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(
    null,
  );
  const [pdfLoading, setPdfLoading] = useState(false);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  function paint() {
    const c = ink.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(c.width / page.width, 0, 0, c.height / page.height, 0, 0);
    ctx.clearRect(0, 0, page.width, page.height);
    working.current.forEach((s) => drawStroke(ctx, s));
    if (current.current) drawStroke(ctx, current.current);
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
    paint();
  }, [page.strokes, page.id]);
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
      (async () => {
        try {
          const document = await task!.promise;
          const p = await document.getPage(page.pdfIndex! + 1);
          if (disposed) return;
          const v = p.getViewport({
            scale: Math.min(ratio, 4096 / Math.max(page.width, page.height)),
          });
          canvas.width = Math.ceil(v.width);
          canvas.height = Math.ceil(v.height);
          render = p.render({ canvasContext: ctx, canvas, viewport: v });
          await (render as ReturnType<typeof p.render>).promise;
        } catch (e) {
          if (!disposed)
            onError(
              "PDFページを表示できません。バックアップを確認してください。",
            );
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
  }, [page.id, page.paper, pdf]);
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
  function down(e: RPointerEvent<HTMLCanvasElement>) {
    if (
      e.pointerType === "touch" ||
      tool === "hand" ||
      (e.pointerType === "mouse" && !mouse) ||
      e.button === 1
    )
      return;
    if (active.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    active.current = e.pointerId;
    onWriting(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    working.current = page.strokes;
    erasing.current =
      tool === "eraser" || (e.buttons & 32) !== 0 || (e.buttons & 2) !== 0;
    const p = point(e);
    last.current = p;
    if (erasing.current)
      working.current = working.current.filter(
        (s) => !hits(s, p, p, 10 / zoom),
      );
    else
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
    if (active.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const samples = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample);
      if (erasing.current) {
        working.current = working.current.filter(
          (s) => !hits(s, last.current || p, p, 10 / zoom),
        );
        last.current = p;
      } else current.current?.points.push(p);
    }
    schedule();
  }
  function finish(e: RPointerEvent<HTMLCanvasElement>) {
    if (active.current !== e.pointerId) return;
    e.stopPropagation();
    if (current.current)
      working.current = [...working.current, current.current];
    current.current = null;
    active.current = null;
    last.current = null;
    onWriting(false);
    onCommit(working.current);
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
    gesture.current = null;
  }
  function gestureMove(e: RPointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId)) return;
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
      v.scrollLeft -= x - prev.x;
      v.scrollTop -= y - prev.y;
      if (distance && prev.distance) {
        const next = Math.max(
          0.25,
          Math.min(2.5, (zoom * distance) / prev.distance),
        );
        const rect = v.getBoundingClientRect();
        const anchorX = x - rect.left,
          anchorY = y - rect.top;
        const sx = (v.scrollLeft + anchorX - 48) / zoom,
          sy = (v.scrollTop + anchorY - 48) / zoom;
        setZoom(next);
        requestAnimationFrame(() => {
          v.scrollLeft = sx * next + 48 - anchorX;
          v.scrollTop = sy * next + 48 - anchorY;
        });
      }
    }
    gesture.current = { x, y, distance };
  }
  function gestureEnd(e: RPointerEvent<HTMLDivElement>) {
    touches.current.delete(e.pointerId);
    gesture.current = null;
  }
  const pixels = Math.min(ratio, 4096 / Math.max(page.width, page.height));
  return (
    <div
      className={"viewport " + (tool === "hand" ? "panning" : "")}
      ref={viewport}
      onPointerDown={gestureDown}
      onPointerMove={gestureMove}
      onPointerUp={gestureEnd}
      onPointerCancel={gestureEnd}
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
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="手書き用紙"
          />
          {pdfLoading && <div className="page-loading">PDFを読み込み中…</div>}
        </div>
      </div>
    </div>
  );
}
