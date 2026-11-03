import {FolderOpen, RefreshCw, FolderSync} from "lucide-react";
import type {useFolderSync} from "./useFolderSync";
import {SYNC_DIRECTORY} from "./repository";
export function FolderSyncPanel({sync}: {sync: ReturnType<typeof useFolderSync>}) {
  return <section className="drive-panel inline-drive folder-sync-panel">
    <span className="modal-symbol"><FolderSync size={23}/></span>
    <h2>同期フォルダーに保存</h2>
    <p>Google Drive・OneDrive・DropboxなどのPC同期フォルダーに、ノート・画像・元PDFを自動保存します。ほかの端末でも同じフォルダーを選ぶと変更を同期できます。Googleへのログインは不要です。</p>
    <p>例：<code>G:\マイドライブ\MPP Notes</code>。フォルダー選択画面のアドレス欄にパスを入力できます。選んだ場所の「{SYNC_DIRECTORY}」に同期データを作成します。</p>
    {!sync.supported && <p className="drive-message" role="alert">このブラウザーはフォルダー選択に対応していません。Windows版EdgeまたはChromeなどの対応ブラウザーで開いてください。Google Drive自動同期は別の方法として利用できます。</p>}
    <div className="drive-status" role="status"><b>{sync.status}</b>{sync.folderName && <span>保存先：{sync.folderName === SYNC_DIRECTORY ? sync.folderName : sync.folderName + " / " + SYNC_DIRECTORY}</span>}{sync.conflicts > 0 && <span>競合コピー：{sync.conflicts} 件</span>}</div>
    {sync.message && <p className="drive-message" role="alert">{sync.message}</p>}
    <div className="drive-actions">
      <button className={sync.folderName ? "" : "primary"} disabled={!sync.supported || !sync.initialized || sync.working} onClick={sync.choose}><FolderOpen size={16}/>{sync.folderName ? "保存先を変更" : "保存先フォルダーを選択"}</button>
      {sync.folderName && <>{sync.permissionNeeded ? <button className="primary" disabled={!sync.supported || sync.working} onClick={sync.resume}>アクセスを許可して再開</button> : <button className="primary" disabled={!sync.supported || sync.working} onClick={sync.sync}><RefreshCw size={16}/>今すぐ同期</button>}<button disabled={sync.working} onClick={() => void sync.disconnect()}>設定を解除</button></>}
    </div>
    <p className="sync-note">「フォルダー保存済み」はPC内への保存完了です。クラウドへの送受信はPCの同期ソフトが行います。</p>
    <p className="sync-note">保存するデータとアクセス権限については<a href="./privacy.html" target="_blank" rel="noreferrer">プライバシーポリシー</a>をご確認ください。</p>
    <details className="drive-instructions"><summary>使い方と同期のしくみ</summary>
      <ol><li>PCの同期ソフトで保存先フォルダーを利用できる状態にします。必要に応じて「オフラインでも使用可能」に設定してください。</li><li>各端末で同じクラウドフォルダーを選び、ブラウザーの読み書き許可を与えます。別端末ではドライブ文字やパスが異なっても構いません。</li><li>アプリ使用中は編集確定から約3秒後と30秒ごとに同期します。別端末の編集を取り込む前に、PCの同期ソフトが転送を終えるまで待ってください。</li></ol>
      <p>同時編集は競合コピーとして両方を残します。履歴は個別のファイルとして保持し、ファイルが到着途中の場合は端末データを置き換えず再試行します。ブラウザー再起動後はアクセスの再許可が必要な場合があります。アプリを閉じている間はノートへの反映を行いません。</p>
      <p>設定解除後も保存先のファイルは残ります。履歴ファイルの移動・削除は全端末の同期を止めてから行ってください。テーマやペン設定、ブラウザーのアクセス権限は同期しません。</p>
    </details>
  </section>;
}
