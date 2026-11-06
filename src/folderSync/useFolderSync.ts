import {useCallback, useEffect, useRef, useState} from "react";
import {loadSetting, saveSetting} from "../storage";
import {newSyncState, synchronize, SyncRetry, type SyncState} from "../drive/sync";
import type {SyncProps} from "../drive/useDriveSync";
import {FolderRepository} from "./repository";
import {FolderPending, folderError, folderSyncSupported, pickSyncDirectory, type SyncDirectory} from "./files";
import {SYNC_IDLE_MS,SYNC_POLL_MS,syncCheckpoint} from "../syncScheduling";
import {SyncWorkInterrupted} from "../syncWork";
import {SyncConflictRequired} from "../drive/conflicts";

export const CONNECTION_KEY = "folder-sync-connection";
type Connection = {version: 1; folder: SyncDirectory; key: string};
const readState = (value: SyncState | undefined) => value?.version === 1 && typeof value.device === "string" && value.known && typeof value.known === "object" ? value : newSyncState();
export function useFolderSync(props: SyncProps) {
  const callbacks = useRef(props);callbacks.current = props;
  const [supported] = useState(folderSyncSupported), [initialized, setInitialized] = useState(false);
  const [folderName, setFolderName] = useState(""), [status, setStatus] = useState("未設定");
  const [message, setMessage] = useState(""), [working, setWorking] = useState(false), [permissionNeeded, setPermissionNeeded] = useState(false), [conflicts, setConflicts] = useState(0);
  const connection = useRef<Connection | null>(null), repository = useRef<FolderRepository | null>(null), state = useRef<SyncState>(newSyncState());
  const running = useRef(false), generation = useRef(0), alive = useRef(true);
  const retry=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const tick = useCallback(async (manual=false) => {
    const config = connection.current;
    if (!config || !supported || running.current || callbacks.current.enabled === false || !callbacks.current.ready) return;
    if(!callbacks.current.canSync()||(!manual&&callbacks.current.isIdle?.()===false)){
      clearTimeout(retry.current);retry.current=setTimeout(()=>void tick(),SYNC_IDLE_MS);return;
    }
    clearTimeout(retry.current);
    running.current = true;const epoch = generation.current;
    setWorking(true);setMessage("");
    const active = () => alive.current && epoch === generation.current && callbacks.current.enabled !== false;
    const checkpoint=syncCheckpoint(()=>callbacks.current,manual);
    try {
      await checkpoint();
      if (await config.folder.queryPermission({mode: "readwrite"}) !== "granted") {setPermissionNeeded(true);setStatus("アクセス許可が必要");return;}
      setPermissionNeeded(false);setStatus("フォルダーと同期中…");
      const repo = repository.current || await FolderRepository.open(config.folder);
      if (!active()) return;repository.current = repo;
      repo.setCheckpoint(checkpoint);
      await repo.verifyKnown(state.current);
      const result = await synchronize({
        repository: repo, state: state.current, getLocal: () => callbacks.current.snapshot,checkpoint,resolveConflict:callbacks.current.resolveConflict,
        persistState: async next => {if (!active()) throw new SyncRetry();await saveSetting(config.key, next);state.current = structuredClone(next);},
        apply: async (next, nextState, expected) => {
          if (!active()) return false;
          const result = await callbacks.current.apply(next, nextState, expected, config.key);
          if (result) state.current = structuredClone(nextState);return result;
        },
      });
      if (!active()) return;
      state.current = result.state;setConflicts(n => n + result.conflicts);
      setStatus("フォルダー保存済み " + new Date().toLocaleTimeString("ja-JP", {hour: "2-digit", minute: "2-digit"}));
      if (result.conflicts) setMessage("同期の競合を解決しました。両方を残した場合は競合コピーを確認してください。");
    } catch (error) {
      if (!active()) return;
      if(error instanceof SyncConflictRequired){clearTimeout(retry.current);setStatus("競合の確認が必要");setMessage("残す内容を選んでください。");callbacks.current.onConflict?.(error.conflict);}
      else if (error instanceof SyncRetry || error instanceof SyncWorkInterrupted) {setStatus("編集中・次回同期で再試行");clearTimeout(retry.current);retry.current=setTimeout(()=>void tick(),SYNC_IDLE_MS);}
      else if (error instanceof FolderPending) {setStatus("PCの同期完了待ち");setMessage(error.message);}
      else {
        setStatus("フォルダーへの同期を再試行してください");setMessage(folderError(error));
        if (error instanceof Error && ["NotAllowedError", "SecurityError"].includes(error.name)) setPermissionNeeded(true);
      }
    } finally {running.current = false;if (alive.current && epoch === generation.current) setWorking(false);}
  }, [supported]);
  useEffect(() => {
    alive.current = true;let cancelled = false;
    void (async () => {
      try {
        const config = await loadSetting<Connection>(CONNECTION_KEY);
        if (!config || config.version !== 1 || config.folder?.kind !== "directory" || typeof config.key !== "string") return;
        const saved = await loadSetting<SyncState>(config.key);if (cancelled) return;
        connection.current = config;state.current = readState(saved);setFolderName(config.folder.name);
        const permission = supported ? await config.folder.queryPermission({mode: "readwrite"}) : "prompt";
        if (!cancelled) {setPermissionNeeded(permission !== "granted");setStatus(permission === "granted" ? "保存先を復元しました" : "アクセス許可が必要");}
      } catch (error) {if (!cancelled) setMessage(folderError(error));}
      finally {if (!cancelled) setInitialized(true);}
    })();
    return () => {cancelled = true;alive.current = false;generation.current++;clearTimeout(retry.current);repository.current?.stop();};
  }, [supported]);
  useEffect(() => {
    if (!initialized) return;
    const timer = setTimeout(() => void tick(), SYNC_IDLE_MS);return () => clearTimeout(timer);
  }, [initialized, props.snapshot.notes, props.snapshot.folders, props.enabled, tick]);
  useEffect(() => {
    const timer = setInterval(() => void tick(), SYNC_POLL_MS), wake = () => {clearTimeout(retry.current);retry.current=setTimeout(()=>void tick(),SYNC_IDLE_MS);};
    window.addEventListener("focus", wake);window.addEventListener("online", wake);
    return () => {clearInterval(timer);window.removeEventListener("focus", wake);window.removeEventListener("online", wake);};
  }, [tick]);
  function choose() {
    if (!supported || running.current) return;
    // Invoke the picker synchronously inside the user's click gesture.
    const picked = pickSyncDirectory();let selected=false;running.current = true;setWorking(true);setMessage("");
    void picked.then(async folder => {
      const old = connection.current;
      const same = old?.folder.isSameEntry ? await old.folder.isSameEntry(folder) : false;
      const config: Connection = same ? old! : {version: 1, folder, key: "folder-sync:" + crypto.randomUUID()};
      const saved = await loadSetting<SyncState>(config.key);
      await saveSetting(CONNECTION_KEY, config);
      generation.current++;repository.current?.stop();repository.current = null;
      connection.current = config;state.current = readState(saved);setFolderName(folder.name);setPermissionNeeded(false);setConflicts(0);setStatus("保存先を設定しました");
      selected=true;
    }).catch(error => {if (!(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error&&error.name==="NotAllowedError"?"フォルダーへのアクセスは許可されませんでした。保存先を選択し直して読み書きを許可してください。":folderError(error));})
      .finally(() => {running.current = false;if (alive.current) {setWorking(false);if(selected)void tick(true);}});
  }
  function resume() {
    if (running.current || !connection.current) return;
    const permission = connection.current.folder.requestPermission({mode: "readwrite"});
    let permitted=false;
    setMessage("");setWorking(true);running.current = true;
    void permission.then(result => {
      setPermissionNeeded(result !== "granted");
      permitted=result==="granted";
      if (result !== "granted") setMessage("アクセスは許可されませんでした。端末内のノートはそのまま利用できます。");
    }).catch(error => setMessage(folderError(error))).finally(() => {running.current = false;if (alive.current) {setWorking(false);if(permitted)void tick(true);}});
  }
  async function disconnect() {
    if (running.current) return;
    generation.current++;repository.current?.stop();repository.current = null;
    clearTimeout(retry.current);
    connection.current = null;setFolderName("");setPermissionNeeded(false);setConflicts(0);setStatus("未設定");setMessage("");
    try {await saveSetting(CONNECTION_KEY, undefined);} catch (error) {setMessage(folderError(error));}
  }
  return {supported, initialized, folderName, status, message, working, permissionNeeded, conflicts, choose, resume, disconnect, sync: () => void tick(true)};
}
