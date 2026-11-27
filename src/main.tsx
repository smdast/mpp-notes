import {Text} from "@astryxdesign/core/Text";
import {ToastViewport} from "@astryxdesign/core/Toast";
import {Toolbar} from "@astryxdesign/core/Toolbar";
import {ErrorBanner} from "./ErrorBanner";
import {Selector} from "@astryxdesign/core/Selector";
import {InternationalizationProvider} from "@astryxdesign/core/i18n";
import jaJP from "@astryxdesign/core/locales/ja-JP.json";
import {AppDialog} from "./AppDialog";
import {FilePickerDialog} from "./FilePicker";
import {TextInput} from "@astryxdesign/core/TextInput";
import {VStack} from "@astryxdesign/core/VStack";
import {HStack} from "@astryxdesign/core/HStack";
import {ActionButton} from "./ActionButton";
import {useLibraryDrag} from "./useLibraryDrag";
import {moveLibraryItem} from "./libraryMove";
import {defaultFill} from "./fill";
import {useDismiss} from "./useDismiss";
import { flushSync } from "react-dom";
import { useDriveSync } from "./drive/useDriveSync";
import {SyncPanel,type SyncMethod} from "./SyncPanel";
import {useFolderSync} from "./folderSync/useFolderSync";
import {SyncActivity} from "./syncScheduling";
import {cancelSyncWork} from "./syncWork";
import {ShareMenu} from "./ShareMenu";
import {makeNoteFile,readNoteFile,noteFilename,NOTE_MIME,NOTE_EXTENSION} from "./noteFile";
import {ConflictDialog} from "./ConflictDialog";
import type {NoteConflict,ConflictChoice} from "./drive/conflicts";
import type { SyncState, LibrarySnapshot } from "./drive/sync";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  House,
  BookOpen,
  Cloud,
  FolderSync,
  Settings,
  CircleAlert,
  Plus,
  FileUp,
  Download,
  Upload,
  PenLine,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  Check,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Trash2,
  Maximize2,
  Minus,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LoaderCircle,
} from "lucide-react";
import {
  newNote,
  type Note,
  type Stroke,
} from "./model";
import {recordPages,travelPages,forgetPage,type NotebookHistory,type PageChange} from "./notebookHistory";
import {
  loadNotes,
  saveSyncSnapshot,
  loadPreferences,
  loadSetting,
  saveSetting,
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
  addPen,
  deletePen,
  penIds,
  penKind,
  type PenKind,
  readPreferences,
  type Preferences,
  type PenId,
  type PenSettings,
} from "./preferences";
import {Theme} from "@astryxdesign/core/theme";
import {Button} from "@astryxdesign/core/Button";
import {noteThemes} from "./astryxThemes";
import "./astryx.css";
import { FolderNav } from "./FolderNav";
import { HelpContent } from "./HelpContent";
import { SettingsPage } from "./SettingsPage";
import { imageStroke } from "./images";
import { PWAControls } from "./PWAControls";
import { clampZoom } from "./scrolling";
import {shortcutAction} from "./shortcuts";
import {editableTarget} from "./clipboard";
import {forgetNoteView} from "./noteView";
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
  const { width, pressure, dotted, dashed, wavy } = preferences.pens[preferences.activePen];
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
  const histories = useRef(new Map<string, NotebookHistory>()),
    queue = useRef(Promise.resolve()),
    pending = useRef(0),
    failed = useRef(false),
    writing = useRef(false);
  const [importKind,setImportKind]=useState<"pdf"|"backup"|"note"|null>(null);
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
  const [syncMethod,setSyncMethod]=useState<SyncMethod>("google");
  const [conflictPending,setConflictPending]=useState<{conflict:NoteConflict;method:SyncMethod}|null>(null);
  const conflictPendingRef=useRef<typeof conflictPending>(null),conflictChoices=useRef(new Map<string,ConflictChoice>());
  const syncActivity=useRef(new SyncActivity());
  useEffect(()=>{
    const record=(event:Event)=>{
      const pointer=event as PointerEvent;
      if(event.type==="pointermove"&&!pointer.buttons&&pointer.pointerType!=="pen")return;
      syncActivity.current.record();cancelSyncWork();
    };
    const events=["pointerdown","pointermove","pointerup","pointercancel","wheel","keydown"];
    for(const type of events)window.addEventListener(type,record,{capture:true,passive:true});
    return()=>{for(const type of events)window.removeEventListener(type,record,true);cancelSyncWork(true);};
  },[]);
  const syncSaving=useRef(false);
  const syncProps={
    snapshot: { notes, folders },
    ready,
    isIdle:()=>syncActivity.current.isIdle(),
    activityVersion:()=>syncActivity.current.version,
    canSync: () =>
      pending.current === 0 && !failed.current && !writing.current && !busy && !conflictPendingRef.current,
    resolveConflict:(conflict:NoteConflict)=>conflictChoices.current.get(conflict.key),
    onConflict:(conflict:NoteConflict)=>{const request={conflict,method:syncMethod};conflictPendingRef.current=request;setConflictPending(request);},
    apply: applyIncoming,
  };
  const drive = useDriveSync({...syncProps,enabled:ready&&syncMethod==="google"});
  const folderSync = useFolderSync({...syncProps,enabled:ready&&syncMethod==="folder"});
  syncSaving.current=drive.working||folderSync.working;
  const activeSync=syncMethod==="google"
    ? (drive.connected||drive.working?drive:null)
    : (folderSync.folderName?folderSync:null);
  const displaySync=!!activeSync&&saveStatus!=="保存失敗";
  const editorStatus=displaySync?activeSync.status:saveStatus;
  const StatusIcon=editorStatus==="保存中…"||(displaySync&&activeSync.working) ? LoaderCircle
    : editorStatus==="保存失敗" ? CircleAlert
    : displaySync ? (syncMethod==="google"?Cloud:FolderSync) : Check;
  function changeSyncMethod(method:SyncMethod){setSyncMethod(method);enqueue(()=>saveSetting("sync-method",method));}
  function chooseConflict(choice:ConflictChoice){
    const request=conflictPendingRef.current;if(!request)return;
    conflictChoices.current.set(request.conflict.key,choice);
    if(conflictChoices.current.size>50)conflictChoices.current.delete(conflictChoices.current.keys().next().value!);
    conflictPendingRef.current=null;setConflictPending(null);
    queueMicrotask(()=>request.method==="google"?drive.sync():folderSync.sync());
  }
  function deferConflict(){conflictPendingRef.current=null;setConflictPending(null);}
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
    flushSync(() => setBusy("同期の変更を反映中"));
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
  function registerPen(kind:PenKind):PenId {
    const next=addPen(preferencesRef.current,kind);
    storePreferences(next);setTool(kind);return next.activePen;
  }
  function choosePen(id: PenId) {
    storePreferences({ ...preferencesRef.current, activePen: id });
    setTool(penKind(id,preferencesRef.current.pens[id]));
  }
  function removePen() {
    const next=deletePen(preferencesRef.current,preferencesRef.current.activePen);
    storePreferences(next);setTool(penKind(next.activePen,next.pens[next.activePen]));
  }
  useEffect(() => {
    const route = () => {
      if (!ready) return;
      const settings=/\/settings\/?$/.test(location.pathname)||location.hash==="#/settings";setSettingsOpen(settings);if(settings)return;
      const match = window.location.hash.match(/^#\/note\/(.+)$/);
      const found = match && notesRef.current.find((n) => n.id === match[1]);
      if (found) {
        setNoteId(found.id);
        if(activeRouteNote.current!==found.id){activeRouteNote.current=found.id;goPage(found.pages[0].id);}
        setView("editor");
      } else setView("library");
    };
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    route();
    return () => {window.removeEventListener("hashchange", route);window.removeEventListener("popstate", route);};
  }, [ready]);
  const history = note ? histories.current.get(note.id) : undefined;
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
        const [found, storedFolders, storedPreferences, storedSyncMethod] = await Promise.all([
          loadNotes(),
          loadFolders(),
          loadPreferences(),
          loadSetting<SyncMethod>("sync-method"),
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
        setTool(penKind(pref.activePen,pref.pens[pref.activePen]));
        setSyncMethod(storedSyncMethod==="folder"?"folder":"google");
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
      if (pending.current || failed.current || writing.current || syncSaving.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, []);
  function updateNote(next: Note) {
    const previous=notesRef.current.find(n=>n.id===next.id);
    next = { ...next, updated: Date.now() };
    setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
    enqueue(() => saveNote(next,previous));
  }
  function commit(strokes: Stroke[], targetId = page?.id) {
    if(targetId)commitPages([{id:targetId,strokes}]);
  }
  function commitPages(changes:PageChange[]) {
    const current=notesRef.current.find(n=>n.id===note?.id);if(!current)return;
    const prev=histories.current.get(current.id)||{past:[],future:[]};
    const next=recordPages(prev,current.pages,changes);if(next===prev)return;
    histories.current.set(current.id,next);setHistoryRevision(v=>v+1);
    const replacements=new Map(changes.map(c=>[c.id,c.strokes]));
    updateNote({...current,pages:current.pages.map(p=>replacements.has(p.id)?{...p,strokes:replacements.get(p.id)!,paperColor:p.pdfIndex===undefined?pagePaperColor(p,dark):undefined}:p)});
  }
  function undo(redo = false) {
    if (!page||!note) return;
    const result = travelPages(histories.current.get(note.id)||{past:[],future:[]},note.pages,redo);
    histories.current.set(note.id, result.history);
    setHistoryRevision((v) => v + 1);
    if(result.pages!==note.pages){updateNote({...note,pages:result.pages});const targetId=redo?result.ids.at(-1):result.ids[0];if(targetId!==page.id&&result.pages.some(p=>p.id===targetId))goPage(targetId!);}
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented || e.isComposing || editableTarget(e.target) || view!=="editor" || blocked ||
        dialog || settingsOpen || document.querySelector("dialog[open],.page-context-menu,.page-template-dialog") ||
        busy || writing.current || conflictPendingRef.current
      )
        return;
      const pref=preferencesRef.current,action=shortcutAction(pref.shortcuts,e);
      if(action==="undo"||action==="redo"){e.preventDefault();undo(action==="redo");}
      else if(action==="pen"||action==="marker"){
        e.preventDefault();const id=penKind(pref.activePen,pref.pens[pref.activePen])===action?pref.activePen:penIds(pref,action)[0];if(id)choosePen(id);
      }else if(action==="eraser"||action==="lasso"||action==="hand"){e.preventDefault();setTool(action);}
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, dialog, busy, historyRevision, settingsOpen,view,blocked]);
  function select(n: Note) {
    // Async imports can navigate before React commits their new note list.
    if (!notesRef.current.some((existing) => existing.id === n.id))
      notesRef.current = [n, ...notesRef.current];
    setNoteId(n.id);
    activeRouteNote.current=n.id;
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
  async function importNotebook(file:File){
    await run("ノートを取り込み中",async()=>{
      if(file.size>250*1024*1024)throw new Error("ノートファイルのサイズ上限（250 MB）を超えています。");
      const imported=readNoteFile(new Uint8Array(await file.arrayBuffer()));
      if(imported.pdf){const verified=await importPDF(imported.pdf,imported.title);if(imported.pages.some(p=>p.pdfIndex!==undefined&&p.pdfIndex>=verified.pages.length))throw new Error("ノートファイルのPDFページ情報が無効です。");}
      const next={...imported,folder:folder==="*"?imported.folder:folder||undefined};
      const merged=normalizeFolders([...foldersRef.current,...(next.folder?[next.folder]:[])]);
      await queue.current;await saveMany([next],merged);
      notesRef.current=[next,...notesRef.current];setNotes(notesRef.current);setFolders(merged);select(next);
    });
  }
  function exportNotebook(){if(note&&!writing.current)void run("ノートを書き出し中",async()=>download(makeNoteFile(note),noteFilename(note.title),NOTE_MIME));}
  function exportPdfNote(){if(note&&!writing.current)void run("PDFを書き出し中",async()=>download(await exportPDF({...note,pages:note.pages.map(p=>({...p,paperColor:pagePaperColor(p,dark)}))}),noteFilename(note.title,".pdf"),"application/pdf"));}
  function submitDialog() {
    if (!dialog) return;
    const title = dialog.value?.trim();
    if (dialog.kind === "new" && title) add(freshNote(title));
    if (dialog.kind === "rename" && title && note)
      updateNote({ ...note, title });
    if (dialog.kind === "deleteNote" && note) {
      const rest = notes.filter((n) => n.id !== note.id);
      setNotes(rest);
      enqueue(async() => {await deleteNote(note.id);forgetNoteView(note.id);});
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
      if(index>=0){const pages=note.pages.filter(p=>p.id!==id);updateNote({...note,pages});goPage(pages[Math.min(index,pages.length-1)].id);const h=histories.current.get(note.id);if(h)histories.current.set(note.id,forgetPage(h,id!));}
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
  const libraryDrag=useLibraryDrag({
    enabled:ready&&view==="library"&&!settingsOpen&&!dialog&&!busy,
    notes,folders,onError:setError,
    onMove:(item,target)=>{
      const result=moveLibraryItem(item,target,notesRef.current,foldersRef.current);
      notesRef.current=result.notes;foldersRef.current=result.folders;
      setNotes(result.notes);setFolders(result.folders);
      if(item.kind==="folder")setFolder(target==="*"?"*":target);
      enqueue(()=>saveSnapshot(result.notes,result.folders));
    },
  });
  return (
    <InternationalizationProvider locale="ja-JP" messages={{"ja-JP":jaJP}}><Theme theme={noteThemes[preferences.accent]} mode={dark?"dark":"light"}><ToastViewport position="bottomEnd" maxVisible={3} inset={{bottom:84}}><div ref={libraryDrag} className={"app view-" + view + (!sidebar ? " collapsed" : "")}>
      {view === "library" && !settingsOpen && (
        <aside className="sidebar">
          <a className="brand" href="./">
            <img src="./icon.svg" width="36" height="36" alt=""/>
            <span>MPP <strong>Notes</strong></span>
          </a>
          <ActionButton
            className="new-note"
            disabled={!ready}
            onClick={() => setDialog({ kind: "new", value: "" })}
          >
            <Plus size={18} />
            新しいノート
          </ActionButton>
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
          <ActionButton
            className="import-button"
            disabled={!ready}
            onClick={() => setImportKind("pdf")}
          >
            <FileUp size={17} />
            PDFを取り込む
          </ActionButton>
          <Button label="設定" icon={<Settings size={16}/>} variant="ghost" onClick={openSettings}/>
        </aside>
      )}
      <main hidden={settingsOpen}>
        {view === "library" ? (
          <Library
            driveControl={<Button label="設定" icon={<Settings size={16}/>} variant="ghost" onClick={openSettings}/>}
            themeControl={null}
            dark={dark}
            onRenameFolder={(from,to)=>changeFolder(from,to)} onDeleteFolder={from=>changeFolder(from)}
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
            onMove={(n, f) => {const current=notesRef.current.find(note=>note.id===n.id);if(current)updateNote({...current,folder:f||undefined});}}
            onNew={() => setDialog({ kind: "new", value: "" })}
            onImport={() => setImportKind("pdf")}
            onImportNote={()=>setImportKind("note")}
            error={error}
            onDismiss={() => setError("")}
            onRetry={failed.current?retrySave:undefined}
          />
        ) : (
          <>
            <Toolbar className="topbar note-header-toolbar" label="ノートの操作バー" size="md" gap={3} dividers={["bottom"]} startContent={
              <HStack className="note-heading-actions" vAlign="center" gap={2}>
                <ActionButton
                  className="library-back"
                  aria-label="ライブラリへ戻る"
                  title="ライブラリへ戻る"
                  onClick={library}
                >
                  <House size={20}/>
                </ActionButton>
                <ActionButton className="icon-button note-sidebar-toggle" aria-label={preferences.pagesCollapsed?"ページ一覧を開く":"ページ一覧をたたむ"} title={preferences.pagesCollapsed?"ページ一覧を開く":"ページ一覧をたたむ"} aria-expanded={!preferences.pagesCollapsed} aria-controls="page-preview-list" disabled={!note} onClick={()=>storePreferences({...preferencesRef.current,pagesCollapsed:!preferencesRef.current.pagesCollapsed})}>
                  {preferences.pagesCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}
                </ActionButton>
                <VStack className="note-heading" gap={0.5}>
                  <Breadcrumb folder={note?.folder}/>
                  <Text as="h1" size="lg" weight="semibold" maxLines={1}>{note?.title||"ノートをはじめよう"}</Text>
                </VStack>
                {note && (
                  <div className="menu-wrap" ref={noteMenu}>
                    <ActionButton
                      className="icon-button"
                      title="ノートの操作"
                      onClick={() => setMenu(!menu)}
                    >
                      <MoreHorizontal size={18} />
                    </ActionButton>
                    {menu && (
                      <div className="dropdown">
                        <Selector label="フォルダーへ移動" value={note.folder||""} options={[{value:"",label:"未分類"},...folders.map(f=>({value:f,label:displayPath(f)}))]} onChange={folder=>{if(folder===null)return;updateNote({...note,folder:folder||undefined});setFolder(folder);setMenu(false);}}/>
                        <ActionButton
                          onClick={() => {
                            setDialog({ kind: "rename", value: note.title });
                            setMenu(false);
                          }}
                        >
                          名前を変更
                        </ActionButton>
                        <ActionButton
                          className="danger"
                          onClick={() => {
                            setDialog({ kind: "deleteNote" });
                            setMenu(false);
                          }}
                        >
                          ノートを削除
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )}
              </HStack>} endContent={
              <HStack className="top-actions" vAlign="center" gap={2}>
                <span className={`save-status${displaySync?" sync-status":""}${saveStatus==="保存失敗"?" failed":""}`}
                  role="status" title={editorStatus}>
                  <StatusIcon size={14} className={StatusIcon===LoaderCircle?"spin":undefined} aria-hidden="true"/>
                  <span>{editorStatus}</span>
                </span>
                <ShareMenu disabled={!note||!!busy} onPdf={exportPdfNote} onExport={exportNotebook}/>
                <ActionButton className="icon-button" title="設定" aria-label="設定" onClick={openSettings}><Settings size={17}/></ActionButton>
              </HStack>}/>
            <EditorToolbar suspended={settingsOpen||!!busy} onPlacement={toolbarPlacement=>storePreferences({...preferencesRef.current,toolbarPlacement})} tool={tool} preferences={preferences} dark={dark} color={color}
              fill={preferences.fill??defaultFill} onFill={fill=>storePreferences({...preferencesRef.current,fill})}
              eraserMode={eraserMode} eraserSize={eraserSize}
              canUndo={!!history?.past.length} canRedo={!!history?.future.length}
              onUndo={undo} onTool={setTool} onPen={choosePen} onAddPen={registerPen} onDeletePen={removePen} onSettings={setPen} onColor={setColor}
              onEraserMode={(eraserMode) => storePreferences({...preferencesRef.current, eraserMode})} onEraserSize={setEraserSize}
              onScratchErase={scratchErase=>storePreferences({...preferencesRef.current,scratchErase})}/>
            {error&&<ErrorBanner message={error} onDismiss={()=>setError("")} onRetry={failed.current?retrySave:undefined}/>}
            {ready && page && note ? (
              <div className="workspace">
                <PageSidebar shortcuts={preferences.shortcuts} key={note.id} pdf={note.pdf} collapsed={preferences.pagesCollapsed} pages={note.pages} active={page.id} dark={dark} onSelect={goPage} onAdd={addPage}
                  onInsert={(id,after)=>{const result=insertedPage(note.pages,id,after,dark);if(result){updateNote({...note,pages:result.pages});goPage(result.page.id);}}}
                  onDuplicate={(id)=>{const source=note.pages.find(p=>p.id===id);if(!source)return;const copy=duplicatePage(source),index=note.pages.indexOf(source)+1;updateNote({...note,pages:[...note.pages.slice(0,index),copy,...note.pages.slice(index)]});goPage(copy.id);}}
                  onDelete={(id)=>setDialog({kind:"deletePage",pageId:id})}
                  onReorder={(from,to,after)=>{const pages=reorderPages(note.pages,from,to,after);if(pages!==note.pages){updateNote({...note,pages});goPage(from);}}}
                  onTemplate={(id,patch)=>{const current=notesRef.current.find(n=>n.id===note.id);if(!current)return;updateNote({...current,pages:current.pages.map(p=>p.id===id&&p.pdfIndex===undefined?{...p,...patch}:p)});}}
                  onApply={(id)=>{const source=note.pages.find(p=>p.id===id);if(source)updateNote({...note,pages:applyPaperTemplate(note.pages,source,dark)});}}
                  onError={setError}/>
                <section className="desk">
                  <ContinuousNotebook
                    direction={preferences.scrollDirection}
                    settingsOpen={settingsOpen}
                    shapeHoldMs={preferences.shapeHoldMs}
                    selectionButton={preferences.selectionButton}
                    eraserButton={preferences.eraserButton}
                    shortcuts={preferences.shortcuts}
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
                    autoColor={preferences.pens[preferences.activePen].autoColor}
                    markerOpacity={preferences.pens[preferences.activePen].opacity}
                    fill={preferences.fill??defaultFill}
                    width={width}
                    pressure={pressure}
                    wavy={!!wavy}
                    dotted={!!dotted}
                    dashed={!!dashed}
                    scratchErase={preferences.scratchErase}
                    shapeCorrection={preferences.pens[preferences.activePen].shapeCorrection!==false}
                    eraserMode={eraserMode}
                    eraserSize={eraserSize}
                    onActive={setPageId}
                    onAddPage={addPage}
                    onCommit={(id, strokes) => commit(strokes, id)}
                    onCommitPages={commitPages}
                    onError={setError}
                    onWriting={(b) => {
                      writing.current = b;
                    }}
                  />
                  <div className="floating-zoom">
                    <ActionButton
                      title="縮小"
                      onClick={() => setZoom(clampZoom(zoom - 0.1))}
                    >
                      <Minus size={15} />
                    </ActionButton>
                    <select aria-label="表示倍率" value={Math.round(zoom * 100)} onChange={(e) => setZoom(clampZoom(Number(e.target.value) / 100))}>
                      {[...new Set([25,50,70,100,150,200,300,400,600,800,Math.round(zoom*100)])].sort((a,b) => a-b).map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                    <ActionButton
                      title="拡大"
                      onClick={() => setZoom(clampZoom(zoom + 0.1))}
                    >
                      <Plus size={15} />
                    </ActionButton>
                    <i />
                    <ActionButton
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
                    </ActionButton>
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
                  <ActionButton
                    className="new-note"
                    onClick={() => setDialog({ kind: "new", value: "" })}
                  >
                    <Plus size={18} />
                    新しいノート
                  </ActionButton>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {importKind&&<FilePickerDialog label={importKind==="pdf"?"PDFを取り込む":importKind==="backup"?"バックアップを復元":"ノートを取り込む"} accept={importKind==="pdf"?"application/pdf,.pdf":importKind==="backup"?"application/zip,.zip":`${NOTE_EXTENSION},${NOTE_MIME}`} onClose={()=>setImportKind(null)} onSelect={file=>{if(importKind==="pdf")void pdfFile(file);else if(importKind==="backup")void restore(file);else void importNotebook(file);}}/>}
      {settingsOpen && <SettingsPage ready={ready} onApply={view==="editor"&&note?.pages.some(p=>p.pdfIndex===undefined)?()=>{if(!note||!page)return;const p=preferencesRef.current;updateNote({...note,pages:applyPaperTemplate(note.pages,{...page,pdfIndex:undefined,paper:p.paperPattern,paperColor:p.paperColor==="auto"?(dark?"#1e2822":"#fffefa"):p.paperColor,backgroundImage:p.paperImage},dark)});}:undefined} value={preferences} onChange={storePreferences} onClose={closeSettings}
        sync={<SyncPanel method={syncMethod} onChange={changeSyncMethod} drive={drive} folder={folderSync} ready={ready}/>}
        backup={backupAction} restore={()=>setImportKind("backup")} help={<HelpContent/>}
        pwa={<PWAControls canReload={()=>pending.current===0&&!failed.current&&!writing.current&&!syncSaving.current}/>} onError={setError} error={error}/>}
      {busy && (
        <div className="busy-overlay" role="status">
          <LoaderCircle className="spin" size={25} />
          {busy}…
        </div>
      )}
      {conflictPending&&!busy&&<ConflictDialog key={conflictPending.conflict.key} conflict={conflictPending.conflict} dark={dark} onChoose={chooseConflict} onDefer={deferConflict}/>}
      {blocked&&<AppDialog title="別のタブで開いています" onClose={()=>{}} required><p>ノートを安全に保存するため、編集は1つのタブで行ってください。ほかのタブを閉じて再読み込みしてください。</p><Button label="再読み込み" variant="primary" onClick={()=>location.reload()}/></AppDialog>}
      {dialog&&<AppDialog title={ {new:"新しいノート",rename:"ノートの名前を変更",deleteNote:"ノートを削除しますか？",deletePage:"ページを削除しますか？",help:"MPP Notesの使い方"}[dialog.kind]} onClose={()=>setDialog(null)} width={dialog.kind==="help"?620:440}>
        <VStack as="form" gap={5} onSubmit={e=>{e.preventDefault();submitDialog();}}>
        {["new","rename"].includes(dialog.kind)?<TextInput label="ノート名" hasAutoFocus isRequired placeholder="例：アイデアのスケッチ" value={dialog.value||""} onChange={value=>setDialog({...dialog,value:value.slice(0,300)})}/>:dialog.kind==="help"?<HelpContent/>:<p>この操作は取り消せません。必要な内容は先にバックアップしてください。</p>}
        <HStack gap={2} hAlign="end">{dialog.kind==="help"?<Button label="閉じる" onClick={()=>setDialog(null)}/>:<><Button label="キャンセル" onClick={()=>setDialog(null)}/><Button type="submit" label={dialog.kind.startsWith("delete")?"削除する":dialog.kind==="new"?"ノートを作成":"変更する"} variant={dialog.kind.startsWith("delete")?"destructive":"primary"} isDisabled={["new","rename"].includes(dialog.kind)&&!dialog.value?.trim()}/></>}</HStack>
        </VStack>
      </AppDialog>}
    </div></ToastViewport></Theme></InternationalizationProvider>
  );
}
document.addEventListener("contextmenu",event=>event.preventDefault());
createRoot(document.getElementById("root")!).render(<App />);
