import {Selector} from "@astryxdesign/core/Selector";
import {Button} from "@astryxdesign/core/Button";
import {TextInput} from "@astryxdesign/core/TextInput";
import { ChevronRight as PathChevron } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Folder,
  Search,
  ChevronRight,
  Plus,
  FileUp,
  PanelLeft,
} from "lucide-react";
import {LibraryNoteMenu} from "./LibraryNoteMenu";
import { NoteCover } from "./NoteCover";
import {formatUpdated} from "./formatTime";
import { displayPath } from "./Breadcrumb";
import type { Note } from "./model";
import { folderName, parentFolder, isWithin } from "./folders";
type Props = {
  dark: boolean;
  onCover: (note:Note,file?:File)=>void;
  themeControl: ReactNode;
  driveControl: ReactNode;
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
  onImportNote:()=>void;
  error: string;
  onDismiss: () => void;
  onRetry: () => void;
  onToggleSidebar: () => void;
};
export function Library({
  dark, onCover,
  themeControl,
  driveControl,
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
  onImportNote,
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
          <h1>ライブラリ</h1>
        </div>
        <div>
          {themeControl}
          {driveControl}
          <Button label="ノート取り込み" aria-label="ノートファイルを取り込む" icon={<FileUp size={16}/>} isDisabled={!ready} onClick={onImportNote}/>
          <Button label="PDF取り込み" icon={<FileUp size={16}/>} isDisabled={!ready} onClick={onImport}/>
          <Button label="新しいノート" variant="primary" icon={<Plus size={16}/>} isDisabled={!ready} onClick={onNew}/>

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
        <button data-library-target="*" onClick={() => onFolder("*")}>すべてのノート</button>
        {folder === "" ? (
          <>
            <PathChevron className="path-separator" size={13} aria-hidden="true"/>
            <span data-library-target="">未分類</span>
          </>
        ) : (
          folder !== "*" &&
          folder.split("/").map((part, i) => (
            <span key={i}>
              <PathChevron className="path-separator" size={13} aria-hidden="true"/>
              <button
                data-library-target={folder.split("/").slice(0,i+1).join("/")}
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
        <TextInput label="ノートを検索" isLabelHidden type="search" placeholder="ノート名で検索" startIcon={<Search size={17}/>} value={query} onChange={setQuery} hasClear containerClassName="library-search"/>
        <Selector label="ノートの並べ替え" isLabelHidden variant="ghost" value={sort} onChange={v=>{if(v)setSort(v);}} options={[{value:"updated",label:"更新が新しい順"},{value:"title",label:"名前順"}]} containerClassName="library-sort"/>

      </div>
      <div className="library-content">
        {!query && children.length > 0 && (
          <>
            <h2>フォルダー</h2>
            <div className="folder-cards">
              {children.map((f) => (
                <button key={f} draggable data-library-kind="folder" data-library-id={f} data-library-label={folderName(f)}
                  data-library-target={f} onClick={() => onFolder(f)}>
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
              <button className="note-open" draggable data-library-kind="note" data-library-id={n.id}
                data-library-label={n.title} onClick={() => onOpen(n)}>
                <div className={"note-cover " + (n.pdf ? "pdf" : "")}>
                  <NoteCover note={n} dark={dark}/>
                </div>
                <div>
                  <h3>{n.title}</h3>
                  <p>
                    {n.pages.length} ページ <span>·</span>{" "}
                    <time dateTime={Number.isFinite(new Date(n.updated).getTime())?new Date(n.updated).toISOString():undefined}>最終更新：{formatUpdated(n.updated)}</time>
                  </p>
                  <small>{n.folder ? displayPath(n.folder) : "未分類"}</small>
                </div>
              </button>
              <LibraryNoteMenu note={n} folders={folders} onRename={()=>onRename(n)} onDelete={()=>onDelete(n)}
                onCover={file=>onCover(n,file)} onMove={target=>onMove(n,target)}/>
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
