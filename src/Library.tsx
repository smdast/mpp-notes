import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Folder,
  Search,
  PenLine,
  Trash2,
  ChevronRight,
  Plus,
  FileUp,
  PanelLeft,
} from "lucide-react";
import type { Note } from "./model";
import { folderName, parentFolder, isWithin } from "./folders";
type Props = {
  themeControl: ReactNode;
  notes: Note[];
  folders: string[];
  folder: string;
  ready: boolean;
  onFolder: (f: string) => void;
  onOpen: (n: Note) => void;
  onRename: (n: Note) => void;
  onDelete: (n: Note) => void;
  onMove: (n: Note, folder: string) => void;
  onNew: () => void;
  onImport: () => void;
  error: string;
  onDismiss: () => void;
  onRetry: () => void;
  onToggleSidebar: () => void;
};
export function Library({
  themeControl,
  notes,
  folders,
  folder,
  ready,
  onFolder,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onNew,
  onImport,
  error,
  onDismiss,
  onRetry,
  onToggleSidebar,
}: Props) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("updated");
  const visible = notes
    .filter(
      (n) =>
        (folder === "*" ||
          (n.folder || "") === folder ||
          (!!query && !!n.folder && !!folder && isWithin(n.folder, folder))) &&
        (!query ||
          n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "ja")
        : b.updated - a.updated,
    );
  const children = folders.filter(
    (f) => parentFolder(f) === (folder === "*" ? "" : folder) && folder !== "",
  );
  return (
    <section className="library-page">
      <header className="library-header">
        <button
          className="icon-button library-toggle"
          title="フォルダー一覧を切り替え"
          onClick={onToggleSidebar}
        >
          <PanelLeft size={19} />
        </button>
        <div>
          <span className="eyebrow">MY LIBRARY</span>
          <h1>ノート管理</h1>
          <p>ノートを整理して、考えたい一冊を開く。</p>
        </div>
        <div>
          {themeControl}
          <button
            className="export-button"
            disabled={!ready}
            onClick={onImport}
          >
            <FileUp size={16} />
            PDF取り込み
          </button>
          <button className="primary" disabled={!ready} onClick={onNew}>
            <Plus size={16} />
            新しいノート
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={onRetry}>再保存</button>
          <button onClick={onDismiss}>閉じる</button>
        </div>
      )}
      <div className="library-breadcrumb">
        <button onClick={() => onFolder("*")}>すべてのノート</button>
        {folder === "" ? (
          <>
            <ChevronRight size={13} />
            <span>未分類</span>
          </>
        ) : (
          folder !== "*" &&
          folder.split("/").map((part, i) => (
            <span key={i}>
              <ChevronRight size={13} />
              <button
                onClick={() =>
                  onFolder(
                    folder
                      .split("/")
                      .slice(0, i + 1)
                      .join("/"),
                  )
                }
              >
                {part}
              </button>
            </span>
          ))
        )}
      </div>
      <div className="library-tools">
        <label>
          <Search size={17} />
          <input
            aria-label="ノートを検索"
            placeholder="ノート名で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="ノートの並べ替え"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">更新が新しい順</option>
          <option value="title">名前順</option>
        </select>
      </div>
      <div className="library-content">
        {!query && children.length > 0 && (
          <>
            <h2>フォルダー</h2>
            <div className="folder-cards">
              {children.map((f) => (
                <button key={f} onClick={() => onFolder(f)}>
                  <Folder size={24} />
                  <span>
                    {folderName(f)}
                    <small>
                      {
                        notes.filter((n) => n.folder && isWithin(n.folder, f))
                          .length
                      }{" "}
                      ノート ·{" "}
                      {
                        folders.filter((child) => parentFolder(child) === f)
                          .length
                      }{" "}
                      フォルダー
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </>
        )}
        <h2>
          {folder === "*"
            ? "すべてのノート"
            : folder === ""
              ? "未分類のノート"
              : folderName(folder) + " のノート"}
          <span>{visible.length}</span>
        </h2>
        <div className="note-grid">
          {visible.map((n) => (
            <article className="note-card" key={n.id}>
              <button className="note-open" onClick={() => onOpen(n)}>
                <div className={"note-cover " + (n.pdf ? "pdf" : "")}>
                  <BookOpen size={32} />
                  <span>{n.pdf ? "PDF" : "NOTE"}</span>
                </div>
                <div>
                  <h3>{n.title}</h3>
                  <p>
                    {n.pages.length} ページ <span>·</span>{" "}
                    {new Date(n.updated).toLocaleDateString("ja-JP")}
                  </p>
                  <small>{n.folder || "未分類"}</small>
                </div>
              </button>
              <div className="note-card-actions">
                <select
                  aria-label={`${n.title} の移動先`}
                  value={n.folder || ""}
                  onChange={(e) => onMove(n, e.target.value)}
                >
                  <option value="">未分類</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f.replaceAll("/", " / ")}
                    </option>
                  ))}
                </select>
                <button
                  title={`${n.title} の名前を変更`}
                  onClick={() => onRename(n)}
                >
                  <PenLine size={15} />
                </button>
                <button title={`${n.title} を削除`} onClick={() => onDelete(n)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {ready && !visible.length && (
          <div className="library-empty">
            <BookOpen size={37} />
            <h3>
              {query
                ? "一致するノートがありません"
                : "この場所にはまだノートがありません"}
            </h3>
            <p>
              {query
                ? "別の名前で検索してください。"
                : "新しいノートを作成するか、PDFを取り込んでください。"}
            </p>
          </div>
        )}
        {!ready && <div className="library-empty">ノートを読み込み中…</div>}
      </div>
    </section>
  );
}
