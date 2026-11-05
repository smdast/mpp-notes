import { Cloud, X, RefreshCw } from "lucide-react";
import type { useDriveSync } from "./useDriveSync";
export function DrivePanel({
  drive,
}: {
  drive: ReturnType<typeof useDriveSync>;
}) {
  return (
    <section className="drive-panel inline-drive">
        <span className="modal-symbol">
          <Cloud size={23} />
        </span>
        <h2 id="drive-title">Google Drive自動同期</h2>
        <p>
          接続すると、この端末内の全ノートとフォルダーを、選んだGoogleアカウントのアプリ専用領域へ自動同期します。
        </p>
        <p>
          元PDFと変更履歴も同期します。データの利用・保存・削除については
          <a href="./privacy.html" target="_blank" rel="noreferrer">プライバシーポリシー</a>
          をご確認ください。
        </p>
        <div className="drive-status" role="status">
          <b>{drive.status}</b>
          {drive.account && <span>{drive.account}</span>}
          {drive.conflicts > 0 && <span>競合コピー：{drive.conflicts} 件</span>}
        </div>
        {drive.message && (
          <p className="drive-message" role="alert">
            {drive.message}
          </p>
        )}
        <div className="drive-actions">
          {!drive.connected ? (
            <button
              className="primary"
              disabled={!drive.clientId || !drive.authReady || drive.working}
              onClick={drive.connect}
            >
              Googleに接続して同期
            </button>
          ) : (
            <>
              <button
                className="primary"
                disabled={drive.working}
                onClick={drive.sync}
              >
                <RefreshCw size={15} />
                今すぐ同期
              </button>
              {(drive.status.includes("再接続") ||
                drive.message.includes("再接続")) && (
                <button
                  disabled={drive.working || !drive.authReady}
                  onClick={drive.connect}
                >
                  Googleに再接続
                </button>
              )}
              <button disabled={drive.working} onClick={drive.disconnect}>
                接続を解除
              </button>
            </>
          )}
        </div>
        <details className="drive-instructions">
          <summary>同期について</summary>
          <p>自動同期は操作が10秒間止まってから行い、定期確認は2分ごとです。筆記を再開すると同期を延期します。「今すぐ同期」は待たずに開始できます。オフラインでは端末保存を続け、復帰後に再試行します。認証の期限切れ時は再接続が必要です。同時編集や削除との競合が起きた場合は、編集内容を競合コピーに残します。同期履歴はデータ保護のため保持します。</p>
        </details>
    </section>
  );
}
