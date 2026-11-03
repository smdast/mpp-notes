import {Cloud, FolderSync} from "lucide-react";
import {DrivePanel} from "./drive/DrivePanel";
import type {useDriveSync} from "./drive/useDriveSync";
import {FolderSyncPanel} from "./folderSync/FolderSyncPanel";
import type {useFolderSync} from "./folderSync/useFolderSync";
export type SyncMethod = "google" | "folder";
export function SyncPanel({method,onChange,drive,folder,ready}: {method: SyncMethod;onChange:(method:SyncMethod)=>void;drive:ReturnType<typeof useDriveSync>;folder:ReturnType<typeof useFolderSync>;ready:boolean}) {
  return <div className="sync-settings"><h2>同期</h2><p>同期方法を選んでください。選んだ方法だけが動作します。</p>
    <div className="sync-methods" role="radiogroup" aria-label="同期方法">
      {([{id:"google",label:"Google Drive自動同期",description:"Googleアカウントのアプリ専用領域を使用",Icon:Cloud},{id:"folder",label:"同期フォルダー",description:"G:\\ など、PC内のクラウド同期フォルダーを使用",Icon:FolderSync}] as const).map(({id,label,description,Icon}) => <button key={id} role="radio" aria-checked={method===id} disabled={!ready || drive.working || folder.working} onClick={()=>onChange(id)}><Icon size={22}/><span><b>{label}</b><small>{description}</small></span></button>)}
    </div>
    {method==="google"?<DrivePanel drive={drive}/>:<FolderSyncPanel sync={folder}/>}
  </div>;
}
