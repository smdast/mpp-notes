import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { uid, type Note, type Page, type Stroke } from "./model";
const MAX_BYTES = 250 * 1024 * 1024;
export function makeBackup(notes: Note[], folders: string[] = []) {
  const files: Record<string, Uint8Array> = {};
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "mpp-notes",
      version: 1,
      folders,
      notes: notes.map(({ pdf, ...n }) => ({
        ...n,
        pdfFile: pdf ? `pdf/${n.id}.pdf` : undefined,
      })),
    }),
  );
  for (const n of notes) if (n.pdf) files[`pdf/${n.id}.pdf`] = n.pdf;
  return zipSync(files);
}
const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
export function validStroke(s: Stroke) {
  return (
    !!s &&
    (s.dotted === undefined || typeof s.dotted === "boolean") &&
    (s.image === undefined ||
      (typeof s.image === "string" && s.image.length <= 30_000_000 &&
        /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.image) &&
        Array.isArray(s.points) && s.points.length === 4)) &&
    (s.shape === undefined ||
      ["line", "rectangle", "ellipse"].includes(s.shape)) &&
    (s.pressure === undefined || typeof s.pressure === "boolean") &&
    typeof s.id === "string" &&
    ["pen", "marker"].includes(s.tool) &&
    /^#[0-9a-f]{6}$/i.test(s.color) &&
    finite(s.width) &&
    s.width > 0 &&
    s.width <= 100 &&
    Array.isArray(s.points) &&
    s.points.length <= 1000000 &&
    s.points.every(
      (p) => finite(p.x) && finite(p.y) && finite(p.p) && p.p >= 0 && p.p <= 1,
    )
  );
}
function validPage(p: Page) {
  return (
    (p.paperColor === undefined || /^#[0-9a-f]{6}$/i.test(p.paperColor)) &&
    typeof p.id === "string" &&
    finite(p.width) &&
    p.width > 0 &&
    p.width <= 20000 &&
    finite(p.height) &&
    p.height > 0 &&
    p.height <= 20000 &&
    ["blank", "ruled", "grid"].includes(p.paper) &&
    Array.isArray(p.strokes) &&
    p.strokes.every(validStroke) &&
    (p.pdfIndex === undefined ||
      (Number.isInteger(p.pdfIndex) && p.pdfIndex >= 0))
  );
}
export function readBackupBundle(
  data: Uint8Array,
  preserveIds = false,
  attachments?: Record<string, Uint8Array>,
): {
  notes: Note[];
  folders: string[];
} {
  try {
    if (data.length > MAX_BYTES) throw Error();
    let total = 0;
    const files: Record<string, Uint8Array> = unzipSync(data, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_BYTES) throw Error();
        return true;
      },
    });
    if (attachments) {
      for (const [path, bytes] of Object.entries(attachments)) {
        total += bytes.length;
        if (total > MAX_BYTES) throw Error();
        files[path] = bytes;
      }
    }
    const m = JSON.parse(strFromU8(files["manifest.json"]));
    if (
      m.format !== "mpp-notes" ||
      m.version !== 1 ||
      !Array.isArray(m.notes) ||
      m.notes.length > 2000
    )
      throw Error();
    const notes: Note[] = m.notes.map((n: Note & { pdfFile?: string }) => {
      if (
        (n.folder !== undefined &&
          (typeof n.folder !== "string" ||
            n.folder.length > 2019 ||
            n.folder === "*")) ||
        (preserveIds &&
          (!finite(n.updated) || typeof n.id !== "string" || !n.id)) ||
        typeof n.title !== "string" ||
        n.title.length > 300 ||
        !Array.isArray(n.pages) ||
        !n.pages.length ||
        !n.pages.every(validPage)
      )
        throw Error();
      const pdf = n.pdfFile ? files[n.pdfFile] : undefined;
      if (n.pdfFile && (!pdf || strFromU8(pdf.subarray(0, 5)) !== "%PDF-"))
        throw Error();
      if (n.pages.some((p) => p.pdfIndex !== undefined && !pdf)) throw Error();
      return {
        id: preserveIds ? n.id : uid(),
        title: n.title,
        folder: n.folder,
        updated: preserveIds ? n.updated : Date.now(),
        pages: n.pages.map((p) => ({
          ...p,
          id: preserveIds ? p.id : uid(),
          strokes: p.strokes.map((s) => ({
            ...s,
            id: preserveIds ? s.id : uid(),
          })),
        })),
        ...(pdf ? { pdf } : {}),
      };
    });
    if (
      m.folders !== undefined &&
      (!Array.isArray(m.folders) ||
        m.folders.length > 2000 ||
        m.folders.some(
          (f: unknown) =>
            typeof f !== "string" || !f.trim() || f.length > 2019 || f === "*",
        ))
    )
      throw Error();
    return {
      notes,
      folders: [
        ...new Set<string>([
          ...(m.folders || []),
          ...notes.flatMap((n) => (n.folder ? [n.folder] : [])),
        ]),
      ],
    };
  } catch {
    throw new Error(
      "バックアップが無効、未対応の形式、またはサイズ上限（250 MB）を超えています。",
    );
  }
}
export function download(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([new Uint8Array(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const readBackup = (data: Uint8Array) => readBackupBundle(data).notes;
