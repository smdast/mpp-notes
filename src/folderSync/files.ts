// Only the user-selected directory and application-owned children are accessed.
export interface SyncFile {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(reason?: unknown): Promise<void>;
  }>;
}
export interface SyncDirectory {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string, options?: {create?: boolean}): Promise<SyncDirectory>;
  getFileHandle(name: string, options?: {create?: boolean}): Promise<SyncFile>;
  values(): AsyncIterableIterator<SyncFile | SyncDirectory>;
  queryPermission(options: {mode: "readwrite"}): Promise<PermissionState>;
  requestPermission(options: {mode: "readwrite"}): Promise<PermissionState>;
  isSameEntry?(other: SyncDirectory): Promise<boolean>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (options: {id: string; mode: "readwrite"}) => Promise<SyncDirectory>;
};
export const folderSyncSupported = () => typeof (window as PickerWindow).showDirectoryPicker === "function";
export function pickSyncDirectory() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("フォルダー同期にはWindows版EdgeまたはChromeなどの対応ブラウザーを使用してください。");
  return picker.call(window, {id: "mpp-notes-sync", mode: "readwrite"});
}
export class FolderPending extends Error {
  constructor(message = "同期ファイルがまだ揃っていません。PCの同期ソフトの完了後に再試行します。") {super(message);this.name="FolderPending";}
}
export const notFound = (error: unknown) => error instanceof Error && error.name === "NotFoundError";
export async function readFile(directory: SyncDirectory, name: string, limit: number) {
  try {
    const file = await (await directory.getFileHandle(name)).getFile();
    if (file.size > limit) throw new Error("同期ファイルがサイズ上限を超えています。");
    if (!file.size) throw new FolderPending();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > limit) throw new Error("同期ファイルがサイズ上限を超えています。");
    return bytes;
  } catch (error) {if (notFound(error)) throw new FolderPending();throw error;}
}
export async function writeFile(directory: SyncDirectory, name: string, bytes: Uint8Array) {
  const file = await directory.getFileHandle(name, {create: true});
  const stream = await file.createWritable();
  try {
    await stream.write(new Blob([new Uint8Array(bytes).buffer]));
    await stream.close(); // The file becomes visible only after a successful close.
  } catch (error) {
    try {await stream.abort();} catch { /* Preserve the original error. */ }
    throw error;
  }
}
export function folderError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "保存先へのアクセス許可が必要です。「アクセスを許可して再開」を押してください。";
    if (error.name === "QuotaExceededError") return "保存先の空き容量が不足しています。端末内のノートは保持しています。";
    if (error.name === "DataCloneError") return "このブラウザーでは保存先を記憶できませんでした。Windows版EdgeまたはChromeでお試しください。";
    if (error.name === "NoModificationAllowedError") return "保存先に書き込めません。空き容量や書き込み権限、PCの同期ソフトの状態を確認してください。";
    if (error.name === "NotFoundError" || error.name === "NotReadableError") return "保存先を開けません。ドライブの接続とPCの同期ソフトを確認してください。端末内のノートは保持しています。";
    if (/[ぁ-ゖァ-ヺ一-龯]/.test(error.message)) return error.message;
  }
  return "フォルダーとの同期に失敗しました。端末内のノートは保持しています。";
}
