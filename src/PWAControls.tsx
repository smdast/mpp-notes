import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { checkAppUpdate,pendingReleaseVersion,isNewerVersion } from "./updates";
import {CURRENT_VERSION} from "./releases";
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
  const [availableVersion,setAvailableVersion]=useState("");
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
        onNeedRefresh: () => {
          setUpdate(true);
          void (async()=>{
            const value=registration.current||await navigator.serviceWorker.getRegistration(new URL("./",document.baseURI).href);
            const version=await pendingReleaseVersion(value,document.baseURI);
            setAvailableVersion(version);setMessage(`バージョン ${version} が利用可能です。`);
          })().catch(()=>setMessage("新しいバージョンがあります。番号を取得するには更新を再確認してください。"));
        },
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
            const version=await pendingReleaseVersion(value,document.baseURI);
            if(result==="available"||(result==="current"&&isNewerVersion(version,CURRENT_VERSION))){setUpdate(true);setAvailableVersion(version);setMessage(`バージョン ${version} が利用可能です。`);}
            else setMessage(result==="current"?`最新のバージョンです（${CURRENT_VERSION}）。`:`バージョン ${version} の更新を準備中です。しばらくして再度確認してください。`);
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
            const updateApp=async()=>{const reg=registration.current||await navigator.serviceWorker.getRegistration(new URL("./",document.baseURI).href);if(reg?.waiting)await reload.current?.(true);else window.location.reload();};
            void updateApp();
          }}
        >
          <RefreshCw size={14} />
          {availableVersion?`バージョン ${availableVersion} に更新`:"新しいバージョンに更新"}
        </button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
