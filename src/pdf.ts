import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { PDFDocument, degrees } from "pdf-lib";
import { uid, type Note, type Page } from "./model";
import { drawPaper, drawStroke } from "./draw";
import { loadInkImage, prepareImages } from "./images";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
export function pdfOptions() {
  if (typeof document === "undefined") return {};
  const root = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI)
    .href;
  return {
    cMapUrl: root + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: root + "standard_fonts/",
    wasmUrl: root + "wasm/",
  };
}
export async function importPDF(
  bytes: Uint8Array,
  title: string,
): Promise<Note> {
  try {
    if (bytes.length > 100 * 1024 * 1024)
      throw new Error("PDFは100 MB以下にしてください。");
    const document = await pdfjs.getDocument({
      ...pdfOptions(),
      data: bytes.slice(),
      password: "",
    }).promise;
    const pages: Page[] = [];
    try {
      for (let i = 1; i <= document.numPages; i++) {
        const p = await document.getPage(i);
        const v = p.getViewport({ scale: 1 });
        pages.push({
          id: uid(),
          width: v.width,
          height: v.height,
          paper: "blank",
          strokes: [],
          pdfIndex: i - 1,
        });
      }
    } finally {
      await document.destroy();
    }
    return { id: uid(), title, updated: Date.now(), pages, pdf: bytes };
  } catch (e) {
    if (e instanceof Error && e.message.includes("100 MB")) throw e;
    throw new Error(
      "PDFを開けません。破損していない、パスワード保護のないPDFを選んでください。",
    );
  }
}
export function overlayPlacement(
  rotation: number,
  width: number,
  height: number,
) {
  const r = ((rotation % 360) + 360) % 360;
  switch (r) {
    case 90:
      return {
        x: width,
        y: 0,
        width: height,
        height: width,
        rotate: degrees(90),
      };
    case 180:
      return { x: width, y: height, width, height, rotate: degrees(180) };
    case 270:
      return {
        x: 0,
        y: height,
        width: height,
        height: width,
        rotate: degrees(270),
      };
    default:
      return { x: 0, y: 0, width, height, rotate: degrees(0) };
  }
}
export async function exportPDF(note: Note) {
  const out = await PDFDocument.create();
  let original: PDFDocument | undefined;
  if (note.pdf) original = await PDFDocument.load(note.pdf);
  for (const p of note.pages) {
    const pdfPage =
      original && p.pdfIndex !== undefined
        ? (await out.copyPages(original, [p.pdfIndex]))[0]
        : out.addPage([p.width, p.height]);
    if (original && p.pdfIndex !== undefined) out.addPage(pdfPage);
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      4,
      8192 / Math.max(p.width, p.height),
      Math.sqrt(24_000_000 / (p.width * p.height)),
    );
    canvas.width = Math.ceil(p.width * scale);
    canvas.height = Math.ceil(p.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(canvas.width / p.width, canvas.height / p.height);
    if (p.backgroundImage) await loadInkImage(p.backgroundImage);
    if (p.pdfIndex === undefined) drawPaper(ctx, p);
    await prepareImages(p.strokes);
    p.strokes.forEach((s) => drawStroke(ctx, s));
    const image = await out.embedPng(canvas.toDataURL("image/png"));
    const crop = pdfPage.getCropBox();
    const placement = overlayPlacement(
      pdfPage.getRotation().angle,
      crop.width,
      crop.height,
    );
    pdfPage.drawImage(image, {
      ...placement,
      x: placement.x + crop.x,
      y: placement.y + crop.y,
    });
    canvas.width = 0;
    canvas.height = 0;
  }
  return out.save();
}
