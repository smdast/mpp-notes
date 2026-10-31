import { useState } from "react";
import { Cloud, X, RefreshCw } from "lucide-react";
import type { useDriveSync } from "./useDriveSync";
export function DrivePanel({
  drive,
  onClose,
}: {
  drive: ReturnType<typeof useDriveSync>;
  onClose: () => void;
}) {
  const [id, setId] = useState(drive.clientId),
    [error, setError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <section
        className="modal drive-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-title"
      >
        <button
          title="Drive設定を閉じる"
          className="modal-close icon-button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="modal-symbol">
          <Cloud size={23} />
        </span>
        <h2 id="drive-title">Google Drive自動同期</h2>
        <p>
          接続すると、この端末内の全ノートとフォルダーを、選んだGoogleアカウントのアプリ専用領域へ自動同期します。標準の接続設定は組み込み済みです。
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
        {(error || drive.message) && (
          <p className="drive-message" role="alert">
            {error || drive.message}
          </p>
        )}
        <label className="title-label">
          OAuthクライアントID
          <input
            aria-label="Google OAuthクライアントID"
            value={id}
            disabled={drive.connected}
            placeholder="…apps.googleusercontent.com"
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <button
          className="drive-configure"
          disabled={drive.connected || drive.working}
          onClick={() => {
            setError("");
            void drive.configure(id).catch((e) => setError(e.message));
          }}
        >
          設定を保存
        </button>
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
          <summary>最初に必要なGoogle側の準備</summary>
          <ol>
            <li>
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noreferrer"
              >
                Google Cloud Console
              </a>
              でプロジェクトを作成し、Google Drive APIを有効にします。
            </li>
            <li>
              Google Auth
              Platformでアプリ名・連絡先・対象ユーザーを設定します。テスト運用では利用するGoogleアカウントをテストユーザーへ追加します。
            </li>
            <li>
              OAuthクライアントを「ウェブアプリケーション」で作成し、承認済みのJavaScript生成元に{" "}
              <code>https://smdast.github.io</code> を登録します。
            </li>
            <li>
              データアクセスには{" "}
              <code>https://www.googleapis.com/auth/drive.appdata</code>{" "}
              を使用します。
            </li>
            <li>
              作成したクライアントIDを上に入力します。クライアントシークレットは入力しません。
            </li>
          </ol>
          <p>
            自動同期はアプリ使用中に動きます。オフラインでは端末保存を続け、復帰後に再試行します。認証の期限切れ時は再接続が必要です。ノートの同時編集は別コピーとして残し、同期による削除と編集が競合した場合も編集内容を競合コピーに残します。同期履歴はデータ保護のため保持します。
          </p>
          <a
            href="https://developers.google.com/identity/oauth2/web/guides/use-token-model"
            target="_blank"
            rel="noreferrer"
          >
            Googleの認証ガイド
          </a>
        </details>
      </section>
    </div>
  );
}
