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
import { isDarkColor } from "./paper";
import { pressureValue } from "./preferences";
import { SelectionPopup } from "./SelectionPopup";
import { cloneStrokes, decodeStrokes, editableTarget, localStrokes, rememberStrokes } from "./clipboard";
import { imageStroke, prepareImages, loadInkImage } from "./images";
export type Tool = "pen" | "marker" | "eraser" | "lasso" | "hand";
type Props = {
  page: Page;
  onPasted: () => void;
  paperColor: string;
  isActive: boolean;
  pdfDocument?: PDFDocumentProxy;
  pressure: boolean;
  dotted: boolean;
  dashed: boolean;
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
  onPasted,
  paperColor,
  isActive,
  pdfDocument,
  pressure,
  dotted,
  dashed,
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
  // Keep decoded images alive only while their page is mounted.
  const decodedImages = useRef<HTMLImageElement[]>([]);
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
      onError(cut ? "クリップボードへ書き込めないため切り取りませんでした。Ctrl+Xをお試しください。" : "アプリ内にコピーしました。ほかのアプリへのコピーにはクリップボードの許可が必要です。");
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
      !document.querySelector('.modal-backdrop,.busy-overlay,.settings-page');
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
      else onError("貼り付けの許可を確認するか、Ctrl+Vで貼り付けてください。");
    }
  }
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      if (!canPaste(e.target) || tool !== "lasso" || !selected.current.size || !e.clipboardData) return;
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !isActive ||
        tool !== "lasso" ||
        !selected.current.size ||
        editableTarget(e.target) ||
        document.querySelector('.modal-backdrop,.busy-overlay,.settings-page')
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
  useEffect(() => {
    let disposed = false;
    void prepareImages(page.strokes).then((images) => {
      if (!disposed) { decodedImages.current = images; paint(); }
    })
      .catch(() => { if (!disposed) onError("保存された画像を読み込めません。"); });
    return () => { disposed = true; decodedImages.current = []; };
  }, [page.strokes]);
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
        dotted,
        dashed,
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
          ? correctShape(current.current, page.strokes)
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
  const bounds = selectionBounds(page.strokes, selected.current);
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
      {pdfLoading && <div className="page-loading">PDFを読み込み中…</div>}
      {isActive && tool === "lasso" && bounds && !editingSelection && (
        <SelectionPopup canvas={ink} bounds={bounds} zoom={zoom}
          onCopy={() => void copySelection()}
          onCut={() => void copySelection(true)}
          onDuplicate={() => insert(selectedStrokes())}
          onRotate={() => applyTransform(1, 1, Math.PI / 2)}
          onDelete={removeSelection}/>
      )}
    </div>
  );
}
