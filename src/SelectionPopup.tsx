import {useDismiss} from "./useDismiss";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Copy, Scissors, CopyPlus, RotateCw, Trash2 } from "lucide-react";
type Bounds = {left: number; top: number; right: number; bottom: number};
export function SelectionPopup({canvas, bounds, zoom, onCopy, onCut, onDuplicate, onRotate, onDelete, onDismiss}: {
  canvas: RefObject<HTMLCanvasElement | null>; bounds: Bounds; zoom: number;
  onDismiss:()=>void;
  onCopy: () => void; onCut: () => void; onDuplicate: () => void;
  onRotate: () => void; onDelete: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(true,[popup],onDismiss);
  const [position, setPosition] = useState({left: 0, top: 0, visible: false});
  useLayoutEffect(() => {
    const update = () => {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect || !popup.current) return;
      const {width, height} = popup.current.getBoundingClientRect();
      const viewport = canvas.current?.closest(".viewport")?.getBoundingClientRect();
      const minY = Math.max(8, viewport?.top ?? 8);
      const maxY = Math.min(window.innerHeight - 8, viewport?.bottom ?? window.innerHeight - 8);
      const top = rect.top + bounds.top * zoom, bottom = rect.top + bounds.bottom * zoom;
      const left = rect.left + (bounds.left + bounds.right) / 2 * zoom - width / 2;
      setPosition({left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
        top: Math.max(minY, Math.min(maxY - height, bottom + height + 18 < maxY ? bottom + 14 : top - height - 34)),
        visible: bottom >= minY && top <= maxY && rect.right > 0 && rect.left < window.innerWidth});
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [canvas, bounds.left, bounds.top, bounds.right, bounds.bottom, zoom]);
  return createPortal(<div ref={popup} role="toolbar" aria-label="選択したストロークの操作"
    className="selection-popup" style={{left:position.left, top:position.top, visibility: position.visible ? "visible" : "hidden"}}
    onPointerDown={(e) => e.stopPropagation()}>
    {[
      {label:"コピー", Icon:Copy, run:onCopy}, {label:"切り取り", Icon:Scissors, run:onCut},
      {label:"複製", Icon:CopyPlus, run:onDuplicate}, {label:"90度回転", Icon:RotateCw, run:onRotate},
      {label:"削除", Icon:Trash2, run:onDelete},
    ].map(({label, Icon, run}) => <button key={label} aria-label={label} title={label} onClick={run}>
      <Icon size={18}/><span>{label}</span>
    </button>)}
  </div>, document.body);
}
