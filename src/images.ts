import { uid, type Page, type Stroke } from "./model";
const cache = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();
export function loadInkImage(data: string) {
  let pending = cache.get(data);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => { loaded.set(data, image); resolve(image); };
      image.onerror = () => { cache.delete(data); reject(new Error("画像を読み込めません。")); };
      image.src = data;
    });
    cache.set(data, pending);
  }
  return pending;
}
export function inkImage(data: string) { return loaded.get(data); }
export async function prepareImages(strokes: Stroke[]) {
  await Promise.all(strokes.flatMap((s) => s.image ? [loadInkImage(s.image)] : []));
}
export async function imageStroke(blob: Blob, page: Pick<Page, "width" | "height">): Promise<Stroke> {
  if (!blob.type.startsWith("image/") || blob.size > 20 * 1024 * 1024)
    throw new Error("20 MB以下の画像を貼り付けてください。");
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("この画像形式を読み込めません。"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error("画像が大きすぎます。4,000万画素以下にしてください。");
    const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    const fit = Math.min(1, page.width * .7 / canvas.width, page.height * .5 / canvas.height);
    const width = canvas.width * fit, height = canvas.height * fit;
    const x = (page.width - width) / 2, y = (page.height - height) / 2;
    await loadInkImage(data);
    return { id: uid(), tool: "pen", color: "#000000", width: .05, image: data,
      points: [[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([x,y]) => ({x,y,p:.5})) };
  } finally { URL.revokeObjectURL(url); }
}
