import { useState } from "react";
import { Folder, FolderPlus, Pencil, Trash2, Check, X } from "lucide-react";
import { folderName, parentFolder, isWithin } from "./folders";
import { displayPath } from "./Breadcrumb";
import type { Note } from "./model";
type Props = {
  folders: string[];
  notes: Note[];
  selected: string;
  onSelect: (folder: string) => void;
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
};
export function FolderNav({
  folders,
  notes,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [edit, setEdit] = useState<{
      from?: string;
      name: string;
      parent: string;
    } | null>(null),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  function submit() {
    const name = edit?.name.trim();
    if (!name || name === "*" || name.includes("/") || name.length > 100) {
      setError(
        "1〜100文字の名前を入力してください（* と / は使用できません）。",
      );
      return;
    }
    const path = edit?.parent ? edit.parent + "/" + name : name;
    if (path.split("/").length > 20) {
      setError("フォルダーは20階層まで作成できます。");
      return;
    }
    if (folders.includes(path) && path !== edit?.from) {
      setError("同じ名前のフォルダーがあります。");
      return;
    }
    if (edit?.from) onRename(edit.from, path);
    else onCreate(path);
    setEdit(null);
    setError("");
  }
  return (
    <div className="folder-nav">
      <div className="folder-heading">
        <span>フォルダー</span>
        <button
          title="フォルダーを作成"
          onClick={() => {
            setEdit({ name: "", parent: selected === "*" ? "" : selected });
            setError("");
          }}
        >
          <FolderPlus size={16} />
        </button>
      </div>
      <div className="folder-list">
        {[
          { id: "*", name: "すべてのノート" },
          { id: "", name: "未分類" },
          ...folders.map((name) => ({ id: name, name: folderName(name) })),
        ].map((f) => (
          <button
            key={f.id}
            title={f.id === "*" ? f.name : displayPath(f.id) || "未分類"}
            style={{
              paddingLeft: 8 + Math.max(0, f.id.split("/").length - 1) * 14,
            }}
            className={selected === f.id ? "selected" : ""}
            onClick={() => {
              onSelect(f.id);
              setConfirm(false);
            }}
          >
            <Folder size={14} />
            <span>{f.name}</span>
            <small>
              {
                notes.filter(
                  (n) =>
                    f.id === "*" ||
                    (f.id === ""
                      ? !n.folder
                      : !!n.folder && isWithin(n.folder, f.id)),
                ).length
              }
            </small>
          </button>
        ))}
      </div>
      {selected && selected !== "*" && (
        <div className="folder-actions">
          <button
            title="フォルダー名を変更"
            onClick={() => {
              setEdit({
                from: selected,
                name: folderName(selected),
                parent: parentFolder(selected),
              });
              setError("");
            }}
          >
            <Pencil size={12} />
            名前変更
          </button>
          <button title="フォルダーを削除" onClick={() => setConfirm(true)}>
            <Trash2 size={12} />
            削除
          </button>
        </div>
      )}
      {confirm && (
        <div className="folder-confirm">
          このフォルダーと配下のフォルダーを削除します。ノートは削除せず、一つ上のフォルダー（最上位なら未分類）へ移します。
          <div>
            <button
              onClick={() => {
                onDelete(selected);
                setConfirm(false);
              }}
            >
              削除する
            </button>
            <button onClick={() => setConfirm(false)}>キャンセル</button>
          </div>
        </div>
      )}
      {edit && (
        <form
          className="folder-editor"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <select
            aria-label="親フォルダー"
            value={edit.parent}
            onChange={(e) => setEdit({ ...edit, parent: e.target.value })}
          >
            <option value="">最上位</option>
            {folders
              .filter((f) => !edit.from || !isWithin(f, edit.from))
              .map((f) => (
                <option key={f} value={f}>
                  {displayPath(f)}
                </option>
              ))}
          </select>
          <input
            autoFocus
            aria-label="フォルダー名"
            maxLength={100}
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
          <button title="フォルダーを保存" type="submit">
            <Check size={15} />
          </button>
          <button
            title="キャンセル"
            type="button"
            onClick={() => {
              setEdit(null);
              setError("");
            }}
          >
            <X size={15} />
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
