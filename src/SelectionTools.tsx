import { useState } from "react";
import { Trash2, RotateCw, FlipHorizontal2, X } from "lucide-react";
export function SelectionTools({
  count,
  left,
  top,
  maxWidth,
  onTransform,
  onDelete,
  onClear,
}: {
  count: number;
  left: number;
  top: number;
  maxWidth: number;
  onTransform: (sx: number, sy: number, angle: number) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [sx, setSx] = useState("100"),
    [sy, setSy] = useState("100"),
    [angle, setAngle] = useState("0");
  return (
    <div
      className="selection-tools"
      style={{
        left: Math.max(3, Math.min(left, maxWidth - 390)),
        top: Math.max(3, top),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span>{count} 本を選択</span>
      <label>
        横
        <input
          aria-label="横倍率（%）"
          type="number"
          min="5"
          max="2000"
          value={sx}
          onChange={(e) => setSx(e.target.value)}
        />
        %
      </label>
      <label>
        縦
        <input
          aria-label="縦倍率（%）"
          type="number"
          min="5"
          max="2000"
          value={sy}
          onChange={(e) => setSy(e.target.value)}
        />
        %
      </label>
      <label>
        回転
        <input
          aria-label="回転角度（度）"
          type="number"
          min="-360"
          max="360"
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
        />
        °
      </label>
      <button
        disabled={
          !sx ||
          !sy ||
          !angle ||
          !Number.isFinite(+sx) ||
          !Number.isFinite(+sy) ||
          !Number.isFinite(+angle) ||
          +sx < 5 ||
          +sy < 5 ||
          +sx > 2000 ||
          +sy > 2000 ||
          Math.abs(+angle) > 360
        }
        onClick={() => {
          onTransform(+sx / 100, +sy / 100, (+angle * Math.PI) / 180);
          setSx("100");
          setSy("100");
          setAngle("0");
        }}
      >
        適用
      </button>
      <button
        title="選択を90度回転"
        onClick={() => onTransform(1, 1, Math.PI / 2)}
      >
        <RotateCw size={15} />
      </button>
      <button title="選択を左右反転" onClick={() => onTransform(-1, 1, 0)}>
        <FlipHorizontal2 size={15} />
      </button>
      <button title="選択したストロークを削除" onClick={onDelete}>
        <Trash2 size={15} />
      </button>
      <button title="選択解除" onClick={onClear}>
        <X size={15} />
      </button>
    </div>
  );
}
