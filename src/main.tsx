import {useDismiss} from "./useDismiss";
import { flushSync } from "react-dom";
import { useDriveSync } from "./drive/useDriveSync";
import { DrivePanel } from "./drive/DrivePanel";
import type { SyncState, LibrarySnapshot } from "./drive/sync";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Cloud,
  Plus,
  FileUp,
  Download,
  Upload,
  PenLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Trash2,
  X,
  Maximize2,
  Minus,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LoaderCircle,
} from "lucide-react";
import {
  newNote,
  record,
  travel,
  type History,
  type Note,
  type Page,
  type Stroke,
} from "./model";
import {
  loadNotes,
  saveSyncSnapshot,
  loadPreferences,
  savePreferences,
  loadFolders,
  saveFolders,
  saveNote,
  saveMany,
  saveSnapshot,
  deleteNote,
  storageMessage,
} from "./storage";
import { makeBackup, readBackupBundle, download } from "./backup";
import { importPDF, exportPDF } from "./pdf";
import type { Tool } from "./Sheet";
import { ContinuousNotebook } from "./ContinuousNotebook";
import { Library } from "./Library";
import { useTheme } from "./ThemeControl";
import { Breadcrumb, displayPath } from "./Breadcrumb";
import { pagePaperColor, penColor, isDarkColor, darkPenColors } from "./paper";
import { normalizeFolders, relocateFolder } from "./folders";
import {
  defaultPreferences,
  readPreferences,
  type Preferences,
  type PenId,
  type PenSettings,
} from "./preferences";
import "./style.css";
import { FolderNav } from "./FolderNav";
import { HelpContent } from "./HelpContent";
import { SettingsPage } from "./SettingsPage";
import { imageStroke } from "./images";
import { PWAControls } from "./PWAControls";
import { clampZoom } from "./scrolling";
import { PageSidebar } from "./PageSidebar";
import { reorderPages, duplicatePage, insertedPage } from "./pages";
import { EditorToolbar } from "./EditorToolbar";
import { newPageFrom, applyPaperTemplate } from "./paper";
type Dialog = {
  kind: "new" | "rename" | "deleteNote" | "deletePage" | "help";
  value?: string;
  pageId?: string;
};
function App() {
  const [settingsOpen, setSettingsOpen] = useState(()=>/\/settings\/?$/.test(location.pathname)||location.hash==="#/settings");
  const settingsReturn = useRef(location.pathname + location.search + location.hash);
  function openSettings(){settingsReturn.current=location.pathname+location.search+location.hash;window.history.pushState(null,"",new URL("settings",document.baseURI));setSettingsOpen(true);}
  function closeSettings(){window.history.pushState(null,"",settingsReturn.current.includes("settings")?new URL("./#/library",document.baseURI):settingsReturn.current);setSettingsOpen(false);window.dispatchEvent(new PopStateEvent("popstate"));}

  const [view, setView] = useState<"library" | "editor">("library");
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const dark = useTheme(preferences.theme,preferences.accent);
  useEffect(()=>{document.documentElement.dataset.accent=preferences.accent;},[preferences.accent]);
  function freshNote(title?:string){const n=newNote(title);const p=preferencesRef.current;n.pages[0]={...n.pages[0],paper:p.paperPattern,paperColor:p.paperColor==="auto"?undefined:p.paperColor,backgroundImage:p.paperImage};return n;}
  function backupAction(){void run("バックアップを作成中",async()=>download(makeBackup(notes,folders),`mpp-notes-${new Date().toISOString().slice(0,10)}.zip`,"application/zip"));}

  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const { width, pressure, dotted, dashed } = preferences.pens[preferences.activePen];
  const [jump, setJump] = useState({ id: "", token: 0 });

  const [notes, setNotes] = useState<Note[]>([]),
    [noteId, setNoteId] = useState(""),
    [pageId, setPageId] = useState(""),
    [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(false);
  const [tool, setTool] = useState<Tool>("pen"),
    [zoom, setZoom] = useState(0.7),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 650);
  const [saveStatus, setSaveStatus] = useState("保存済み"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [menu, setMenu] = useState(false),
    [historyRevision, setHistoryRevision] = useState(0);
  const noteMenu=useRef<HTMLDivElement>(null);
  useDismiss(menu,[noteMenu],()=>setMenu(false));
  const [folders, setFolders] = useState<string[]>([]),
    [folder, setFolder] = useState("*");
  const eraserMode = preferences.eraserMode;
  const [eraserSize, setEraserSize] = useState(24);
  const activeRouteNote=useRef(noteId);activeRouteNote.current=noteId;
  const histories = useRef(new Map<string, History>()),
    queue = useRef(Promise.resolve()),
    pending = useRef(0),
    failed = useRef(false),
    writing = useRef(false),
    pdfInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null);
  const note = notes.find((n) => n.id === noteId),
    page = note?.pages.find((p) => p.id === pageId) || note?.pages[0],
    pageIndex = note && page ? note.pages.indexOf(page) : 0;
  const currentPaperColor = page
    ? pagePaperColor(page, dark)
    : dark
      ? "#1e2822"
      : "#fffefa";
  const color = penColor(
    preferences.pens[preferences.activePen],
    preferences.activePen,
    isDarkColor(currentPaperColor),
  );
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const drive = useDriveSync({
    snapshot: { notes, folders },
    ready,
    canSync: () =>
      pending.current === 0 && !failed.current && !writing.current && !busy,
    apply: applyIncoming,
  });
  async function applyIncoming(
    next: LibrarySnapshot,
    state: SyncState,
    expected: LibrarySnapshot,
    key: string,
  ) {
    if (
      writing.current ||
      busy ||
      notesRef.current !== expected.notes ||
      foldersRef.current !== expected.folders
    )
      return false;
    flushSync(() => setBusy("Google Driveの変更を反映中"));
    try {
      await queue.current;
      if (
        notesRef.current !== expected.notes ||
        foldersRef.current !== expected.folders
      )
        return false;
      await saveSyncSnapshot(next.notes, next.folders, key, state);
      notesRef.current = next.notes;
      foldersRef.current = next.folders;
      setNotes(next.notes);
      setFolders(next.folders);
      histories.current.clear();
      setHistoryRevision((v) => v + 1);
      const current = next.notes.find((n) => n.id === noteId);
      if (!current && view === "editor") library();
      else if (current && !current.pages.some((p) => p.id === pageId))
        goPage(current.pages[0].id);
      return true;
    } finally {
      setBusy("");
    }
  }

  function retrySave() {
    failed.current = false;
    enqueue(async () => {
      await saveSnapshot(notes, folders);
      await savePreferences(preferencesRef.current);
    });
    setError("");
  }
  function library() {
    setView("library");
    window.location.hash = "/library";
  }
  function goPage(id: string) {
    setPageId(id);
    setJump((prev) => ({ id, token: prev.token + 1 }));
  }
  function storePreferences(next: Preferences) {
    preferencesRef.current = next;
    setPreferences(next);
    enqueue(() => savePreferences(next));
  }
  function setPen(patch: Partial<PenSettings>) {
    const prev = preferencesRef.current;
    storePreferences({
      ...prev,
      pens: {
        ...prev.pens,
        [prev.activePen]: { ...prev.pens[prev.activePen], ...patch },
      },
    });
  }
  function setColor(color: string) {
    setPen({ color, customColor: true });
  }
  function choosePen(id: PenId) {
    storePreferences({ ...preferencesRef.current, activePen: id });
    setTool(id === "marker" ? "marker" : "pen");
  }
  useEffect(() => {
    const route = () => {
      if (!ready) return;
      const settings=/\/settings\/?$/.test(location.pathname)||location.hash==="#/settings";setSettingsOpen(settings);if(settings)return;
      const match = window.location.hash.match(/^#\/note\/(.+)$/);
      const found = match && notesRef.current.find((n) => n.id === match[1]);
      if (found) {
        setNoteId(found.id);
        if(activeRouteNote.current!==found.id)goPage(found.pages[0].id);
        setView("editor");
      } else setView("library");
    };
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    route();
    return () => {window.removeEventListener("hashchange", route);window.removeEventListener("popstate", route);};
  }, [ready]);
  const history = page ? histories.current.get(page.id) : undefined;
  function enqueue(op: () => Promise<unknown>) {
    pending.current++;
    setSaveStatus("保存中…");
    queue.current = queue.current.then(async () => {
      try {
        await op();
      } catch (e) {
        failed.current = true;
        setError(storageMessage(e));
      } finally {
        pending.current--;
        setSaveStatus(
          failed.current
            ? "保存失敗"
            : pending.current
              ? "保存中…"
              : "保存済み",
        );
      }
    });
  }
  useEffect(() => {
    let alive = true;
    let release: () => void = () => {};
    const init = async () => {
      try {
        const [found, storedFolders, storedPreferences] = await Promise.all([
          loadNotes(),
          loadFolders(),
          loadPreferences(),
        ]);
        setFolders(
          normalizeFolders([
            ...storedFolders,
            ...found.flatMap((n) => (n.folder ? [n.folder] : [])),
          ]),
        );
        const pref = readPreferences(storedPreferences);
        setPreferences(pref);
        preferencesRef.current = pref;
        setTool(pref.activePen === "marker" ? "marker" : "pen");
        if (!alive) return;
        if (found.length) {
          setNotes(found.sort((a, b) => b.updated - a.updated));
          setNoteId(found[0].id);
          setPageId(found[0].pages[0].id);
        } else {
          const first = freshNote("はじめのノート");
          setNotes([first]);
          setNoteId(first.id);
          setPageId(first.pages[0].id);
          enqueue(() => saveNote(first));
        }
        setReady(true);
      } catch (e) {
        setError(
          "ノートを読み込めません。ブラウザーの保存設定を確認し、再読み込みしてください。",
        );
      }
    };
    if (navigator.locks)
      void navigator.locks.request(
        "mpp-notes-editor",
        { ifAvailable: true },
        async (lock) => {
          if (!alive) return;
          if (!lock) {
            setBlocked(true);
            return;
          }
          await init();
          await new Promise<void>((r) => {
            release = r;
          });
        },
      );
    else void init();
    return () => {
      alive = false;
      release();
    };
  }, []);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (pending.current || failed.current || writing.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, []);
  function updateNote(next: Note) {
    next = { ...next, updated: Date.now() };
    setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
    enqueue(() => saveNote(next));
  }
  function updatePage(next: Page) {
    if (!note) return;
    updateNote({
      ...note,
      pages: note.pages.map((p) => (p.id === next.id ? next : p)),
    });
  }
  function commit(strokes: Stroke[], targetId = page?.id) {
    const target = note?.pages.find((p) => p.id === targetId);
    if (!target || strokes === target.strokes) return;
    histories.current.set(
      target.id,
      record(
        histories.current.get(target.id) || { past: [], future: [] },
        target.strokes,
      ),
    );
    setHistoryRevision((v) => v + 1);
    updatePage({
      ...target,
      paperColor:
        target.pdfIndex === undefined
          ? pagePaperColor(target, dark)
          : undefined,
      strokes,
    });
  }
  function undo(redo = false) {
    if (!page) return;
    const result = travel(
      histories.current.get(page.id) || { past: [], future: [] },
      page.strokes,
      redo,
    );
    histories.current.set(page.id, result.history);
    setHistoryRevision((v) => v + 1);
    if (result.strokes !== page.strokes)
      updatePage({ ...page, strokes: result.strokes });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        dialog || settingsOpen || document.querySelector(".page-context-menu,.page-template-dialog") ||
        busy
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        undo(true);
      } else if (!e.ctrlKey && !e.metaKey) {
        const t: Record<string, Tool> = {
          p: "pen",
          h: "marker",
          e: "eraser",
          l: "lasso",
          v: "hand",
        };
        if (e.key.toLowerCase() === "p")
          choosePen(
            preferencesRef.current.activePen === "marker"
              ? "pen1"
              : preferencesRef.current.activePen,
          );
        else if (e.key.toLowerCase() === "h") choosePen("marker");
        else if (t[e.key.toLowerCase()]) setTool(t[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, dialog, busy, historyRevision, settingsOpen]);
  function select(n: Note) {
    // Async imports can navigate before React commits their new note list.
    if (!notesRef.current.some((existing) => existing.id === n.id))
      notesRef.current = [n, ...notesRef.current];
    setNoteId(n.id);
    goPage(n.pages[0].id);
    setView("editor");
    window.location.hash = "/note/" + n.id;
    setMenu(false);
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "操作に失敗しました。もう一度お試しください。",
      );
    } finally {
      setBusy("");
    }
  }
  function add(n: Note) {
    n = { ...n, folder: folder === "*" ? undefined : folder || undefined };
    setNotes((prev) => [n, ...prev]);
    select(n);
    enqueue(() => saveNote(n));
  }
  async function pdfFile(file: File) {
    await run("PDFを取り込み中", async () => {
      const n = await importPDF(
        new Uint8Array(await file.arrayBuffer()),
        file.name.replace(/\.pdf$/i, "").slice(0, 300),
      );
      add(n);
    });
  }
  async function restore(file: File) {
    await run("バックアップを復元中", async () => {
      const bundle = readBackupBundle(new Uint8Array(await file.arrayBuffer()));
      const restored = bundle.notes;
      const mergedFolders = normalizeFolders([...folders, ...bundle.folders]);
      for (const n of restored)
        if (n.pdf) {
          const verified = await importPDF(n.pdf, n.title);
          if (
            n.pages.some(
              (p) =>
                p.pdfIndex !== undefined && p.pdfIndex >= verified.pages.length,
            )
          )
            throw new Error("バックアップのPDFページ情報が無効です。");
        }
      await queue.current;
      await saveMany(restored, mergedFolders);
      setFolders(mergedFolders);
      setFolder("*");
      setNotes((prev) => [...restored, ...prev]);
      if (restored[0]) select(restored[0]);
    });
  }
  function submitDialog() {
    if (!dialog) return;
    const title = dialog.value?.trim();
    if (dialog.kind === "new" && title) add(freshNote(title));
    if (dialog.kind === "rename" && title && note)
      updateNote({ ...note, title });
    if (dialog.kind === "deleteNote" && note) {
      const rest = notes.filter((n) => n.id !== note.id);
      setNotes(rest);
      enqueue(() => deleteNote(note.id));
      if (rest[0]) {
        setNoteId(rest[0].id);
        setPageId(rest[0].pages[0].id);
      } else {
        setNoteId("");
        setPageId("");
      }
      library();
    }
    if(dialog.kind === "deletePage" && note && note.pages.length>1){
      const id=dialog.pageId||page?.id; const index=note.pages.findIndex(p=>p.id===id);
      if(index>=0){const pages=note.pages.filter(p=>p.id!==id);updateNote({...note,pages});goPage(pages[Math.min(index,pages.length-1)].id);histories.current.delete(id!);}
    }
    setDialog(null);
  }
  function addPage() {
    if (!note) return;
    const next = newPageFrom(note.pages.at(-1), dark);
    updateNote({ ...note, pages: [...note.pages, next] });
    goPage(next.id);
  }
  function storeFolders(next: string[]) {
    const normalized = normalizeFolders(next);
    setFolders(normalized);
    enqueue(() => saveFolders(normalized));
  }
  function changeFolder(from: string, to?: string) {
    try {
      const result = relocateFolder(folders, notes, from, to);
      setNotes(result.notes);
      setFolders(result.folders);
      setFolder(to || "*");
      enqueue(() => saveSnapshot(result.notes, result.folders));
    } catch (e) {
      setError(e instanceof Error ? e.message : "フォルダーを変更できません。");
    }
  }
  const colors = dark
    ? ["#e3efdf", "#d0d9e9", "#8ec5ff", "#ffa5ad", "#e9c968", "#c1a7ef"]
    : ["#243d35", "#202b39", "#376fac", "#bd6263", "#bd8d39", "#8466a5"];
  return (
    <div className={"app view-" + view + (!sidebar ? " collapsed" : "")}>
      {view === "library" && !settingsOpen && (
        <aside className="sidebar">
          <a className="brand" href="./">
            <span className="brand-icon">
              <PenLine size={21} />
            </span>
            <span>
              MPP <strong>Notes</strong>
              <small>書く、考える。</small>
            </span>
          </a>
          <button
            className="new-note"
            disabled={!ready}
            onClick={() => setDialog({ kind: "new", value: "" })}
          >
            <Plus size={18} />
            新しいノート
          </button>
          <div className="section-heading">
            ライブラリ <span>{notes.length}</span>
          </div>
          <FolderNav
            folders={folders}
            notes={notes}
            selected={folder}
            onSelect={setFolder}
            onCreate={(name) => {
              storeFolders([...folders, name]);
              setFolder(name);
            }}
            onRename={(from, to) => changeFolder(from, to)}
            onDelete={(name) => changeFolder(name)}
          />
          <button
            className="import-button"
            disabled={!ready}
            onClick={() => pdfInput.current?.click()}
          >
            <FileUp size={17} />
            PDFを取り込む
          </button>
          <button className="import-button" onClick={openSettings}>⚙ 設定</button>
        </aside>
      )}
      <main hidden={settingsOpen}>
        {view === "library" ? (
          <Library
            driveControl={<button className="export-button" onClick={openSettings}>⚙ 設定</button>}
            themeControl={null}
            dark={dark}
            onCover={(n,file)=>{if(!file){updateNote({...n,coverImage:undefined});return;}void run("表紙画像を読み込み中",async()=>{const image=await imageStroke(file,{width:794,height:1123});const current=notesRef.current.find(x=>x.id===n.id);if(current)updateNote({...current,coverImage:image.image});});}}
            onToggleSidebar={() => setSidebar(!sidebar)}
            notes={notes}
            folders={folders}
            folder={folder}
            ready={ready}
            onFolder={setFolder}
            onOpen={select}
            onRename={(n) => {
              setNoteId(n.id);
              setDialog({ kind: "rename", value: n.title });
            }}
            onDelete={(n) => {
              setNoteId(n.id);
              setDialog({ kind: "deleteNote" });
            }}
            onMove={(n, f) => updateNote({ ...n, folder: f || undefined })}
            onNew={() => setDialog({ kind: "new", value: "" })}
            onImport={() => pdfInput.current?.click()}
            error={error}
            onDismiss={() => setError("")}
            onRetry={retrySave}
          />
        ) : (
          <>
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="library-back"
                  aria-label="ノート管理へ戻る"
                  title="ノート管理へ戻る"
                  onClick={library}
                >
                  <BookOpen size={18} />
                  <span>ノート管理</span>
                </button>
                <span className="breadcrumb-library">
                  <Breadcrumb folder={note?.folder} />
                  <ChevronRight className="path-separator" size={13} aria-hidden="true"/>
                </span>
                <strong>{note?.title || "ノートをはじめよう"}</strong>
                {note && (
                  <div className="menu-wrap" ref={noteMenu}>
                    <button
                      className="icon-button"
                      title="ノートの操作"
                      onClick={() => setMenu(!menu)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menu && (
                      <div className="dropdown">
                        <label className="folder-move">
                          フォルダーへ移動
                          <select
                            aria-label="ノートのフォルダー"
                            value={note.folder || ""}
                            onChange={(e) => {
                              updateNote({
                                ...note,
                                folder: e.target.value || undefined,
                              });
                              setFolder(e.target.value);
                              setMenu(false);
                            }}
                          >
                            <option value="">未分類</option>
                            {folders.map((f) => (
                              <option key={f} value={f}>
                                {displayPath(f)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() => {
                            setDialog({ kind: "rename", value: note.title });
                            setMenu(false);
                          }}
                        >
                          名前を変更
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            setDialog({ kind: "deleteNote" });
                            setMenu(false);
                          }}
                        >
                          ノートを削除
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="top-actions">
                <button className="icon-button" title="設定" onClick={openSettings}>⚙</button>
                <span
                  className={
                    "save-status " + (saveStatus === "保存失敗" ? "failed" : "")
                  }
                  role="status"
                >
                  {saveStatus === "保存中…" ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <Check size={14} />
                  )}{" "}
                  {saveStatus}
                </span>
                <button
                  className="export-button"
                  disabled={!note || !!busy}
                  onClick={() =>
                    note &&
                    void run("PDFを書き出し中", async () =>
                      download(
                        await exportPDF({
                          ...note,
                          pages: note.pages.map((p) => ({
                            ...p,
                            paperColor: pagePaperColor(p, dark),
                          })),
                        }),
                        `${note.title.replace(/[\\/:*?"<>|]/g, "_")}.pdf`,
                        "application/pdf",
                      ),
                    )
                  }
                >
                  <Download size={15} />
                  <span>PDF書き出し</span>
                </button>
              </div>
            </header>
            <EditorToolbar tool={tool} preferences={preferences} dark={dark} color={color} colors={colors}
              eraserMode={eraserMode} eraserSize={eraserSize}
              canUndo={!!history?.past.length} canRedo={!!history?.future.length}
              onUndo={undo} onTool={setTool} onPen={choosePen} onSettings={setPen} onColor={setColor}
              onEraserMode={(eraserMode) => storePreferences({...preferencesRef.current, eraserMode})} onEraserSize={setEraserSize}
              onScratchErase={scratchErase=>storePreferences({...preferencesRef.current,scratchErase})}
              onShapeCorrection={(shapeCorrection) => storePreferences({...preferencesRef.current, shapeCorrection})}/>
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                {failed.current && <button onClick={retrySave}>再保存</button>}
                <button title="メッセージを閉じる" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {ready && page && note ? (
              <div className="workspace">
                <PageSidebar key={note.id} pages={note.pages} active={page.id} dark={dark} onSelect={goPage} onAdd={addPage}
                  onInsert={(id,after)=>{const result=insertedPage(note.pages,id,after,dark);if(result){updateNote({...note,pages:result.pages});goPage(result.page.id);}}}
                  onDuplicate={(id)=>{const source=note.pages.find(p=>p.id===id);if(!source)return;const copy=duplicatePage(source),index=note.pages.indexOf(source)+1;updateNote({...note,pages:[...note.pages.slice(0,index),copy,...note.pages.slice(index)]});goPage(copy.id);}}
                  onDelete={(id)=>setDialog({kind:"deletePage",pageId:id})}
                  onReorder={(from,to,after)=>{const pages=reorderPages(note.pages,from,to,after);if(pages!==note.pages){updateNote({...note,pages});goPage(from);}}}
                  onTemplate={(id,patch)=>{const current=notesRef.current.find(n=>n.id===note.id);if(!current)return;updateNote({...current,pages:current.pages.map(p=>p.id===id&&p.pdfIndex===undefined?{...p,...patch}:p)});}}
                  onApply={(id)=>{const source=note.pages.find(p=>p.id===id);if(source)updateNote({...note,pages:applyPaperTemplate(note.pages,source,dark)});}}
                  onError={setError}/>
                <section className="desk">
                  <ContinuousNotebook
                    dark={dark}
                    activePageId={page.id}
                    onPasted={() => setTool("lasso")}
                    key={note.id}
                    note={note}
                    jump={jump}
                    zoom={zoom}
                    setZoom={setZoom}
                    tool={tool}
                    color={color}
                    width={width}
                    pressure={pressure}
                    dotted={!!dotted}
                    dashed={!!dashed}
                    scratchErase={preferences.scratchErase}
                    shapeCorrection={preferences.shapeCorrection}
                    eraserMode={eraserMode}
                    eraserSize={eraserSize}
                    onActive={setPageId}
                    onAddPage={addPage}
                    onCommit={(id, strokes) => commit(strokes, id)}
                    onError={setError}
                    onWriting={(b) => {
                      writing.current = b;
                    }}
                  />
                  <div className="floating-zoom">
                    <button
                      title="縮小"
                      onClick={() => setZoom(clampZoom(zoom - 0.1))}
                    >
                      <Minus size={15} />
                    </button>
                    <select aria-label="表示倍率" value={Math.round(zoom * 100)} onChange={(e) => setZoom(clampZoom(Number(e.target.value) / 100))}>
                      {[...new Set([25,50,70,100,150,200,300,400,600,800,Math.round(zoom*100)])].sort((a,b) => a-b).map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                    <button
                      title="拡大"
                      onClick={() => setZoom(clampZoom(zoom + 0.1))}
                    >
                      <Plus size={15} />
                    </button>
                    <i />
                    <button
                      title="幅に合わせる"
                      onClick={() => {
                        const el = document.querySelector(".viewport");
                        if (el)
                          setZoom(
                            Math.max(
                              0.25,
                              clampZoom((el.clientWidth - 96) / page.width),
                            ),
                          );
                      }}
                    >
                      <Maximize2 size={15} />
                    </button>
                  </div>

                </section>
              </div>
            ) : (
              <div className="empty">
                <BookOpen size={48} />
                <h1>
                  {ready
                    ? "あなたの考えを、最初の一冊に。"
                    : "ノートを読み込み中…"}
                </h1>
                {ready && (
                  <button
                    className="new-note"
                    onClick={() => setDialog({ kind: "new", value: "" })}
                  >
                    <Plus size={18} />
                    新しいノート
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <input
        ref={pdfInput}
        hidden
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pdfFile(f);
        }}
      />
      <input
        ref={backupInput}
        hidden
        type="file"
        accept="application/zip,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void restore(f);
        }}
      />
      {settingsOpen && <SettingsPage ready={ready} onApply={view==="editor"&&note?.pages.some(p=>p.pdfIndex===undefined)?()=>{if(!note||!page)return;const p=preferencesRef.current;updateNote({...note,pages:applyPaperTemplate(note.pages,{...page,pdfIndex:undefined,paper:p.paperPattern,paperColor:p.paperColor==="auto"?(dark?"#1e2822":"#fffefa"):p.paperColor,backgroundImage:p.paperImage},dark)});}:undefined} value={preferences} onChange={storePreferences} onClose={closeSettings}
        drive={<DrivePanel drive={drive}/>}
        backup={backupAction} restore={()=>backupInput.current?.click()} help={<HelpContent/>}
        pwa={<PWAControls canReload={()=>pending.current===0&&!failed.current&&!writing.current}/>} onError={setError} error={error}/>}
      {busy && (
        <div className="busy-overlay" role="status">
          <LoaderCircle className="spin" size={25} />
          {busy}…
        </div>
      )}
      {blocked && (
        <div className="modal-backdrop">
          <div className="modal">
            <BookOpen />
            <h2>別のタブで開いています</h2>
            <p>
              ノートを安全に保存するため、編集は1つのタブで行ってください。ほかのタブを閉じて再読み込みしてください。
            </p>
            <button className="primary" onClick={() => location.reload()}>
              再読み込み
            </button>
          </div>
        </div>
      )}
      {dialog && (
        <div
          className="modal-backdrop"
          onPointerDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDialog(null);
          }}
        >
          <form
            className={"modal " + (dialog.kind === "help" ? "help-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onSubmit={(e) => {
              e.preventDefault();
              submitDialog();
            }}
          >
            <button
              type="button"
              className="modal-close icon-button"
              title="閉じる"
              onClick={() => setDialog(null)}
            >
              <X size={18} />
            </button>
            <span className="modal-symbol">
              <PenLine size={23} />
            </span>
            <h2 id="dialog-title">
              {
                {
                  new: "新しいノート",
                  rename: "ノートの名前を変更",
                  deleteNote: "ノートを削除しますか？",
                  deletePage: "ページを削除しますか？",
                  help: "MPP Notesの使い方",
                }[dialog.kind]
              }
            </h2>
            {["new", "rename"].includes(dialog.kind) ? (
              <>
                <p>思いついたことを、自由に書き留めましょう。</p>
                <label className="title-label">
                  ノート名
                  <input
                    autoFocus
                    required
                    maxLength={300}
                    placeholder="例：アイデアのスケッチ"
                    value={dialog.value || ""}
                    onChange={(e) =>
                      setDialog({ ...dialog, value: e.target.value })
                    }
                  />
                </label>
              </>
            ) : dialog.kind === "help" ? (
              <div className="help-content">
                <p>
                  <b>連続ページ</b>
                  　上下のスクロールだけでページ間を移動できます。左のページ一覧で任意のページへジャンプします。
                </p>
                <p>
                  <b>ペン設定</b>
                  　3本のペンと蛍光ペンそれぞれに色・太さ・筆圧の設定を保存します。
                </p>
                <p>
                  <b>図形補正</b>
                  　オンにすると、書き終えた直線・円・楕円・長方形を整えます。通常の筆記ではオフにもでき、補正後はUndoで消せます。
                </p>
                <p>
                  <b>書く</b>
                  　MPPペンで用紙に書けます。筆圧で線の太さが変わります。マウスでもそのまま描画できます。
                </p>
                <p>
                  <b>移動する</b>
                  　指で移動、2本指で拡大縮小。「移動」ツールならマウスでも移動できます。
                </p>
                <p>
                  <b>ツール</b>　P：ペン / H：蛍光ペン / E：消しゴム /
                  L：なげなわ /
                  V：移動。Ctrl+Zで元に戻せます。対応端末ではペンの消しゴム側・サイドボタンでも消せます。
                </p>
                <p>
                  <b>保存する</b>
                  　このブラウザーに自動保存します。ブラウザーデータの削除で消えるため、定期的にZIPバックアップを保存してください。別端末へはZIPを復元して移せます。
                </p>
                <p>
                  <b>PDF</b>　パスワード保護のない100
                  MB以下のPDFを取り込めます。書き出したPDFの手書きは画像になります。編集の続きはこのアプリかZIPバックアップを使ってください。
                </p>
                <p>
                  <b>消す・選ぶ</b>
                  　消しゴムは線全体とエリア消去を切り替えられます。なげなわで囲んだ線を選び、選択枠の内側をドラッグして移動します。Ctrl+Zで戻せます。
                </p>
                <p>
                  <b>ページを追加</b>
                  　最終ページの一番下で指を上にスワイプ。「離して新しいページを追加」が出てから指を離すと追加します。
                </p>
                <p>
                  <b>フォルダー</b>
                  　ノート管理ページで階層フォルダーを作成・変更できます。配下もまとめて移動・名前変更でき、削除時もノートは親フォルダーに残ります。
                </p>
                <p>
                  <b>オフライン</b>
                  　PWAをインストールできます。初回のオフライン準備が完了した後は、通信なしでもノートとPDFを開けます。
                </p>
                <p className="help-note">
                  MPPの筆圧・手のひら除外・ボタンの認識は、端末・ドライバー・ブラウザーに依存します。Google
                  Driveを接続するとノートとフォルダーを同期します。未接続では端末内に保存します。
                </p>
              </div>
            ) : (
              <p>
                この操作は取り消せません。必要な内容は先にバックアップしてください。
              </p>
            )}
            <div className="modal-actions">
              {dialog.kind === "help" ? (
                <button
                  className="primary"
                  type="button"
                  onClick={() => setDialog(null)}
                >
                  書きはじめる
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setDialog(null)}>
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className={
                      dialog.kind.startsWith("delete")
                        ? "danger-button"
                        : "primary"
                    }
                    disabled={
                      ["new", "rename"].includes(dialog.kind) &&
                      !dialog.value?.trim()
                    }
                  >
                    {dialog.kind.startsWith("delete")
                      ? "削除する"
                      : dialog.kind === "new"
                        ? "ノートを作成"
                        : "変更する"}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
