import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { checkAppUpdate } from "./updates";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PWAControls({ canReload }: { canReload: () => boolean }) {
  const [install, setInstall] = useState<InstallEvent | null>(null),
    [offline, setOffline] = useState(false),
    [update, setUpdate] = useState(false),
    [message, setMessage] = useState(""),
    [checking, setChecking] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
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
        onRegisteredSW: (_url, value) => { registration.current = value; },
        onOfflineReady: () => setOffline(true),
        onNeedRefresh: () => {setUpdate(true);setMessage("新しいバージョンがあります。");},
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
      <button disabled={checking} onClick={()=>{
        if(!navigator.onLine){setMessage("オフラインです。通信できる状態で更新を確認してください。");return;}
        setChecking(true);setMessage("");
        void (async()=>{
          try {
            const value=registration.current || ("serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration(new URL("./",document.baseURI).href) : undefined);
            if(!value){setMessage("更新を確認できません。公開アプリで再読み込みしてお試しください。");return;}
            const result=await checkAppUpdate(value);
            if(result==="available"){setUpdate(true);setMessage("新しいバージョンがあります。");}
            else setMessage(result==="current"?"最新のバージョンです。":"更新を準備中です。しばらくして再度確認してください。");
          }catch{setMessage("更新を確認できませんでした。通信を確認して再度お試しください。");}
          finally{setChecking(false);}
        })();
      }}><RefreshCw size={14}/>{checking?"更新を確認中…":"更新を確認"}</button>
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
