import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { registerSW } from "virtual:pwa-register";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PWAControls({ canReload }: { canReload: () => boolean }) {
  const [install, setInstall] = useState<InstallEvent | null>(null),
    [offline, setOffline] = useState(false),
    [update, setUpdate] = useState(false),
    [message, setMessage] = useState("");
  const reload = useRef<((reload?: boolean) => Promise<void>) | null>(null),
    allowed = useRef(canReload);
  allowed.current = canReload;
  useEffect(() => {
    const handle = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const installed = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", handle);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator)
      reload.current = registerSW({
        immediate: true,
        onOfflineReady: () => setOffline(true),
        onNeedRefresh: () => setUpdate(true),
        onRegisterError: () =>
          setMessage(
            "オフラインの準備に失敗しました。通信できる状態で再読み込みしてください。",
          ),
      });
    return () => {
      window.removeEventListener("beforeinstallprompt", handle);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <div className="pwa-controls">
      {install && (
        <button
          onClick={() =>
            void (async () => {
              await install.prompt();
              await install.userChoice;
              setInstall(null);
            })()
          }
        >
          <Download size={14} />
          アプリをインストール
        </button>
      )}
      {offline && (
        <small>
          <WifiOff size={12} />
          オフライン使用の準備完了
        </small>
      )}
      {update && (
        <button
          onClick={() => {
            if (!allowed.current()) {
              setMessage("保存完了・筆記終了後に更新してください。");
              return;
            }
            void reload.current?.(true);
          }}
        >
          <RefreshCw size={14} />
          新しいバージョンに更新
        </button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
