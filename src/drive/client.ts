import { unzipSync, strFromU8 } from "fflate";
import { readBackupBundle } from "../backup";
import {canUseSyncWorker,packDriveInBackground,readDriveInBackground} from "../syncWork";
import {
  type Payload,
  type Revision,
  type Repository,
  validRevision,
  hash,
} from "./sync";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
type Token = {
  access_token: string;
  expires_in: number;
  scope: string;
  error?: string;
};
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (token: Token) => void;
        error_callback: (error: { type: string }) => void;
      }) => { requestAccessToken: (options?: { prompt?: string }) => void };
      revoke: (token: string, callback: () => void) => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
let identityPromise: Promise<void> | undefined;
export function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (!identityPromise)
    identityPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        identityPromise = undefined;
        reject(
          new Error("Google認証を読み込めません。通信状態を確認してください。"),
        );
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        identityPromise = undefined;
        reject(new Error("Google認証を読み込めません。"));
      };
      document.head.appendChild(script);
    });
  return identityPromise;
}
export function authorize(
  clientId: string,
): Promise<{ token: string; expires: number }> {
  return new Promise((resolve, reject) => {
    if (!window.google)
      return reject(new Error("Google認証の準備ができていません。"));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (
          response.error ||
          !response.access_token ||
          !response.scope?.split(" ").includes(DRIVE_SCOPE)
        )
          reject(new Error("Google Driveへのアクセスが許可されませんでした。"));
        else
          resolve({
            token: response.access_token,
            expires: Date.now() + response.expires_in * 1000 - 60000,
          });
      },
      error_callback: (error) =>
        reject(
          new Error(
            error.type === "popup_closed"
              ? "Googleへの接続をキャンセルしました。"
              : "認証画面を開けません。ポップアップを許可して再接続してください。",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export class DriveSession implements Repository {
  private abort = new AbortController();
  private eventCache = new Map<string, Revision>();
  private pdfIds = new Map<string, string>();
  private pdfDigests = new WeakMap<Uint8Array, Promise<string>>();
  private pdfBytes = new Map<string, Uint8Array>();
  constructor(
    private token: string,
    readonly expires: number,
  ) {}
  get expired() {
    return Date.now() >= this.expires;
  }
  private async request(path: string, init: RequestInit = {}) {
    if (this.expired) throw new Error("Googleへの再接続が必要です。");
    const response = await fetch("https://www.googleapis.com/" + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(60000)]),
    });
    if (!response.ok) {
      if (response.status === 401)
        throw new Error("Googleへの再接続が必要です。");
      if (response.status === 403)
        throw new Error(
          "Drive APIの有効化、アクセス権限、保存容量を確認してください。",
        );
      if (response.status === 429 || response.status >= 500)
        throw new Error(
          "Google Driveが混み合っています。しばらくして再同期してください。",
        );
      throw new Error(
        "Google Driveとの通信に失敗しました（" + response.status + "）。",
      );
    }
    return response;
  }
  async account() {
    const result = await (
      await this.request(
        "drive/v3/about?fields=user(permissionId,displayName,emailAddress)",
      )
    ).json();
    if (!result.user?.permissionId)
      throw new Error("Googleアカウントを確認できません。");
    return result.user as {
      permissionId: string;
      displayName?: string;
      emailAddress?: string;
    };
  }
  private async upload(
    name: string,
    data: Uint8Array,
    mime: string,
    kind: string,
    properties: Record<string, string> = {},
  ) {
    const boundary = "mpp_" + crypto.randomUUID();
    const metadata = {
      name,
      mimeType: mime,
      parents: ["appDataFolder"],
      appProperties: { mppKind: kind, mppVersion: "1", ...properties },
    };
    if (data.length > 5 * 1024 * 1024) {
      const start = await this.request(
        "upload/drive/v3/files?uploadType=resumable&fields=id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime,
            "X-Upload-Content-Length": String(data.length),
          },
          body: JSON.stringify(metadata),
        },
      );
      const location = start.headers.get("Location");
      if (!location) throw new Error("Driveのアップロード先を取得できません。");
      const target = new URL(location);
      if (
        target.origin !== "https://www.googleapis.com" ||
        !target.pathname.startsWith("/upload/drive/v3/files")
      )
        throw new Error("Driveのアップロード先が無効です。");
      const result = await (
        await this.request(target.pathname.slice(1) + target.search, {
          method: "PUT",
          headers: { "Content-Type": mime },
          body: new Blob([new Uint8Array(data).buffer], { type: mime }),
        })
      ).json();
      if (typeof result.id !== "string")
        throw new Error("Driveの保存結果を確認できません。");
      return result.id as string;
    }
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      new Uint8Array(data).buffer,
      `\r\n--${boundary}--\r\n`,
    ]);
    const response = await this.request(
      "upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": "multipart/related; boundary=" + boundary },
        body,
      },
    );
    const result = await response.json();
    if (typeof result.id !== "string")
      throw new Error("Driveの保存結果を確認できません。");
    return result.id as string;
  }
  private async pdfReference(data: Uint8Array) {
    let digest = this.pdfDigests.get(data);
    if (!digest) {
      digest = hash(data);
      this.pdfDigests.set(data, digest);
    }
    const key = await digest;
    let id = this.pdfIds.get(key);
    if (!id) {
      const params = new URLSearchParams({
        spaces: "appDataFolder",
        q: `trashed = false and appProperties has { key='mppKind' and value='pdf' } and appProperties has { key='mppHash' and value='${key}' }`,
        pageSize: "1",
        fields: "files(id)",
      });
      const found = await (
        await this.request("drive/v3/files?" + params)
      ).json();
      id =
        found.files?.[0]?.id ||
        (await this.upload(
          "pdf-" + key + ".pdf",
          data,
          "application/pdf",
          "pdf",
          { mppHash: key },
        ));
      this.pdfIds.set(key, id!);
    }
    return { fileId: id!, digest: key };
  }
  async write(payload: Payload) {
    if (payload.kind === "note") {
      const reference=payload.note.pdf?await this.pdfReference(payload.note.pdf):undefined;
      const data=await packDriveInBackground(payload.note,reference);
      return this.upload(
        "note-" + payload.note.id + ".zip",
        data,
        "application/zip",
        "payload",
      );
    }
    return this.upload(
      "folders.json",
      new TextEncoder().encode(JSON.stringify(payload)),
      "application/json",
      "payload",
    );
  }
  async event(event: Revision) {
    const id = await this.upload(
      "event-" + event.id + ".json",
      new TextEncoder().encode(JSON.stringify(event)),
      "application/json",
      "event",
    );
    this.eventCache.set(id, event);
  }
  async list() {
    const ids: string[] = [];
    let token: string | undefined;
    do {
      const params = new URLSearchParams({
        spaces: "appDataFolder",
        q: "trashed = false and appProperties has { key='mppKind' and value='event' }",
        pageSize: "1000",
        fields: "nextPageToken,files(id)",
      });
      if (token) params.set("pageToken", token);
      const result = await (
        await this.request("drive/v3/files?" + params)
      ).json();
      ids.push(...(result.files || []).map((f: { id: string }) => f.id));
      token = result.nextPageToken;
    } while (token);
    const missing = ids.filter((id) => !this.eventCache.has(id));
    for (let i = 0; i < missing.length; i += 6)
      await Promise.all(
        missing.slice(i, i + 6).map(async (id) => {
          const bytes = await this.bytes(id, 1024 * 1024);
          let value: unknown;
          try {
            value = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            throw new Error(
              "同期履歴が壊れています。端末内のデータは保持しました。",
            );
          }
          if (!validRevision(value))
            throw new Error("未対応または無効な同期履歴があります。");
          this.eventCache.set(id, value);
        }),
      );
    return ids.map((id) => this.eventCache.get(id)!);
  }
  private async bytes(id: string, max = 250 * 1024 * 1024) {
    const response = await this.request(
      "drive/v3/files/" + encodeURIComponent(id) + "?alt=media",
    );
    if (Number(response.headers.get("Content-Length")) > max)
      throw new Error("同期ファイルがサイズ上限を超えています。");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > max)
      throw new Error("同期ファイルがサイズ上限を超えています。");
    return data;
  }
  async read(id: string): Promise<Payload> {
    if(canUseSyncWorker())return readDriveInBackground(this.token,this.expires,id);
    const bytes = await this.bytes(id);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      let expanded = 0;
      const files = unzipSync(bytes, {
        filter: (entry) => {
          expanded += entry.originalSize;
          if (expanded > 250 * 1024 * 1024)
            throw new Error("同期ファイルがサイズ上限を超えています。");
          return true;
        },
      });
      let attachments: Record<string, Uint8Array> | undefined;
      if (files["remote-pdf.json"]) {
        const reference = JSON.parse(strFromU8(files["remote-pdf.json"]));
        if (
          typeof reference.fileId !== "string" ||
          !/^[0-9a-f]{64}$/.test(reference.digest)
        )
          throw new Error("PDF同期データが無効です。");
        let pdf = this.pdfBytes.get(reference.fileId);
        if (!pdf) {
          pdf = await this.bytes(reference.fileId, 100 * 1024 * 1024);
          if ((await hash(pdf)) !== reference.digest)
            throw new Error("同期PDFの内容を確認できません。");
          if (this.pdfBytes.size >= 2)
            this.pdfBytes.delete(this.pdfBytes.keys().next().value!);
          this.pdfBytes.set(reference.fileId, pdf);
        }
        const manifest = JSON.parse(strFromU8(files["manifest.json"]));
        const path = manifest.notes?.[0]?.pdfFile;
        if (typeof path !== "string")
          throw new Error("PDF同期情報が不足しています。");
        attachments = { [path]: pdf };
      }
      const result = readBackupBundle(bytes, true, attachments);
      if (result.notes.length !== 1 || typeof result.notes[0].id !== "string")
        throw new Error("同期ノートの形式が無効です。");
      return { kind: "note", note: result.notes[0] };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("同期ファイルを読み取れません。");
    }
    const value = payload as Payload;
    if (
      value.kind !== "folders" ||
      !Array.isArray(value.folders) ||
      value.folders.length > 20000 ||
      value.folders.some(
        (f) => typeof f !== "string" || f.length > 2019 || f === "*",
      )
    )
      throw new Error("同期フォルダーの形式が無効です。");
    return value;
  }
  disconnect() {
    const token = this.token;
    this.token = "";
    this.abort.abort();
    window.google?.accounts.oauth2.revoke(token, () => {});
  }
}
