import { useCallback, useEffect, useRef, useState } from "react";
import { DriveSession, authorize, loadGoogleIdentity } from "./client";
import {
  synchronize,
  newSyncState,
  SyncRetry,
  type SyncState,
  type LibrarySnapshot,
} from "./sync";
import { loadSetting, saveSetting } from "../storage";
import { DEFAULT_GOOGLE_CLIENT_ID } from "./config";
import {SYNC_IDLE_MS,SYNC_POLL_MS,syncCheckpoint} from "../syncScheduling";
import {SyncWorkInterrupted,cancelSyncWork} from "../syncWork";
import {SyncConflictRequired,type NoteConflict,type ConflictChoice} from "./conflicts";
export type SyncProps = {
  enabled?: boolean;
  isIdle?:()=>boolean;
  activityVersion?:()=>number;
  resolveConflict?:(conflict:NoteConflict)=>ConflictChoice|undefined;
  onConflict?:(conflict:NoteConflict)=>void;
  snapshot: LibrarySnapshot;
  ready: boolean;
  canSync: () => boolean;
  apply: (
    snapshot: LibrarySnapshot,
    state: SyncState,
    expected: LibrarySnapshot,
    key: string,
  ) => Promise<boolean>;
};
export function useDriveSync(props: SyncProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  const [status, setStatus] = useState("未接続"),
    [message, setMessage] = useState(""),
    [account, setAccount] = useState(""),
    [connected, setConnected] = useState(false),
    [authReady, setAuthReady] = useState(false),
    [conflicts, setConflicts] = useState(0),
    [working, setWorking] = useState(false);
  const session = useRef<DriveSession | null>(null),
    state = useRef<SyncState>(newSyncState()),
    stateKey = useRef(""),
    running = useRef(false),
    generation = useRef(0),
    retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => {
      generation.current++;
      clearTimeout(retry.current);
    };
  }, []);
  const tick = useCallback(async (manual=false) => {
    const repo = session.current;
    if (
      running.current ||
      !repo ||
      callbacks.current.enabled === false ||
      !callbacks.current.ready
    )
      return;
    if(!callbacks.current.canSync()||(!manual&&callbacks.current.isIdle?.()===false)){
      clearTimeout(retry.current);retry.current=setTimeout(()=>void tick(),SYNC_IDLE_MS);return;
    }
    clearTimeout(retry.current);
    if (!navigator.onLine) {
      setStatus("オフライン・端末内に保存");
      return;
    }
    if (repo.expired) {
      setStatus("再接続が必要");
      setMessage(
        "Google認証の有効期限が切れました。再接続すると自動同期を再開します。",
      );
      return;
    }
    const epoch = generation.current;
    running.current = true;
    setWorking(true);
    setStatus("同期中…");
    setMessage("");
    const checkpoint=syncCheckpoint(()=>callbacks.current,manual);
    try {
      const result = await synchronize({
        repository: repo,
        state: state.current,
        checkpoint,
        resolveConflict:callbacks.current.resolveConflict,
        getLocal: () => callbacks.current.snapshot,
        persistState: async (next) => {
          if (epoch !== generation.current || callbacks.current.enabled === false) throw new SyncRetry();
          await saveSetting(stateKey.current, next);
          state.current = structuredClone(next);
        },
        apply: async (next, nextState, expected) => {
          if (epoch !== generation.current || callbacks.current.enabled === false) return false;
          const applied = await callbacks.current.apply(
            next,
            nextState,
            expected,
            stateKey.current,
          );
          if (applied) state.current = structuredClone(nextState);
          return applied;
        },
      });
      if (epoch !== generation.current) return;
      state.current = result.state;
      setConflicts((n) => n + result.conflicts);
      setStatus(
        "同期済み " +
          new Date().toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
      if (result.conflicts)
        setMessage(
          "同期の競合を解決しました。両方を残した場合は競合コピーを確認してください。",
        );
    } catch (error) {
      if (epoch !== generation.current) return;
      if(error instanceof SyncConflictRequired){clearTimeout(retry.current);setStatus("競合の確認が必要");setMessage("残す内容を選んでください。");callbacks.current.onConflict?.(error.conflict);}
      else if (error instanceof SyncRetry || error instanceof SyncWorkInterrupted) {
        setStatus("編集中・次回同期で再試行");
        clearTimeout(retry.current);retry.current = setTimeout(() => void tick(), SYNC_IDLE_MS);
      } else {
        setStatus("同期を再試行してください");
        setMessage(
          error instanceof Error
            ? error.message
            : "同期に失敗しました。端末内のノートは保持しています。",
        );
      }
    } finally {
      running.current = false;
      if (epoch === generation.current) setWorking(false);
    }
  }, []);
  useEffect(() => {
    if (!clientId || props.enabled === false) return;
    let active = true;
    setAuthReady(false);
    void loadGoogleIdentity()
      .then(() => {
        if (active) setAuthReady(true);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [clientId, props.enabled]);
  useEffect(() => {
    const timeout = setTimeout(() => void tick(), SYNC_IDLE_MS);
    return () => clearTimeout(timeout);
  }, [props.snapshot.notes, props.snapshot.folders, connected, tick, props.enabled]);
  useEffect(() => {
    const timer = setInterval(() => void tick(), SYNC_POLL_MS),
      wake = () => {clearTimeout(retry.current);retry.current=setTimeout(()=>void tick(),SYNC_IDLE_MS);};
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [tick]);
  function connect() {
    if (!authReady || !clientId || running.current || callbacks.current.enabled === false) return;
    const epoch = ++generation.current;
    setWorking(true);
    setStatus("Googleに接続中…");
    void authorize(clientId)
      .then(async (token) => {
        const nextSession = new DriveSession(token.token, token.expires);
        const user = await nextSession.account();
        if (epoch !== generation.current) {
          nextSession.disconnect();
          return;
        }
        const key = "google-sync:" + clientId + ":" + user.permissionId;
        const saved = await loadSetting<SyncState>(key);
        if (epoch !== generation.current) return;
        stateKey.current = key;
        state.current =
          saved?.version === 1 && saved.known && saved.device
            ? saved
            : newSyncState();
        session.current = nextSession;
        setAccount(user.emailAddress || user.displayName || "Googleアカウント");
        setConnected(true);
        setWorking(false);
        setStatus("接続済み");
        void tick(true);
      })
      .catch((error) => {
        if (epoch === generation.current) {
          setWorking(false);
          setStatus(session.current ? "再接続が必要" : "未接続");
          setMessage(
            error instanceof Error ? error.message : "接続に失敗しました。",
          );
        }
      });
  }
  function disconnect() {
    generation.current++;
    cancelSyncWork(true);
    clearTimeout(retry.current);
    session.current?.disconnect();
    session.current = null;
    setConnected(false);
    setAccount("");
    setWorking(false);
    setStatus("未接続");
    setMessage("");
  }
  return {
    clientId,
    status,
    message,
    account,
    connected,
    authReady,
    conflicts,
    working,
    connect,
    disconnect,
    sync: () => void tick(true),
  };
}
