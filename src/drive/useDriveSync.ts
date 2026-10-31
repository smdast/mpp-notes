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
type Props = {
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
export function useDriveSync(props: Props) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const [clientId, setClientId] = useState(""),
    [status, setStatus] = useState("未接続"),
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
    void loadSetting<string>("google-client-id").then((value) =>
      setClientId(value || import.meta.env.VITE_GOOGLE_CLIENT_ID || ""),
    );
    return () => {
      generation.current++;
      clearTimeout(retry.current);
    };
  }, []);
  const tick = useCallback(async () => {
    const repo = session.current;
    if (
      running.current ||
      !repo ||
      !callbacks.current.ready ||
      !callbacks.current.canSync()
    )
      return;
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
    try {
      const result = await synchronize({
        repository: repo,
        state: state.current,
        getLocal: () => callbacks.current.snapshot,
        persistState: async (next) => {
          if (epoch !== generation.current) throw new SyncRetry();
          await saveSetting(stateKey.current, next);
          state.current = structuredClone(next);
        },
        apply: async (next, nextState, expected) => {
          if (epoch !== generation.current) return false;
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
          "同時編集を検出し、競合コピーを作成しました。両方の内容を確認してください。",
        );
    } catch (error) {
      if (epoch !== generation.current) return;
      if (error instanceof SyncRetry) {
        setStatus("編集中・次回同期で再試行");
        retry.current = setTimeout(() => void tick(), 3000);
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
    if (!clientId) return;
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
  }, [clientId]);
  useEffect(() => {
    const timeout = setTimeout(() => void tick(), 3000);
    return () => clearTimeout(timeout);
  }, [props.snapshot.notes, props.snapshot.folders, connected, tick]);
  useEffect(() => {
    const timer = setInterval(() => void tick(), 30000),
      wake = () => void tick();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [tick]);
  async function configure(id: string) {
    const clean = id.trim();
    if (clean && !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clean))
      throw new Error(
        "ウェブアプリ用のOAuthクライアントIDを入力してください。",
      );
    if (connected) throw new Error("設定を変える前に接続を解除してください。");
    await saveSetting("google-client-id", clean);
    setClientId(clean);
    setMessage("");
    if (clean)
      void loadGoogleIdentity()
        .then(() => setAuthReady(true))
        .catch((error) => setMessage(error.message));
  }
  function connect() {
    if (!authReady || !clientId || running.current) return;
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
        void tick();
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
    configure,
    connect,
    disconnect,
    sync: () => void tick(),
  };
}
