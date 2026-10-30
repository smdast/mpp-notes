import { cp, mkdir } from "node:fs/promises";
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await mkdir(`public/pdfjs/${directory}`, { recursive: true });
  await cp(
    `node_modules/pdfjs-dist/${directory}`,
    `public/pdfjs/${directory}`,
    { recursive: true },
  );
}
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile, writeFile } from "node:fs/promises";
const icon = await loadImage(await readFile("public/icon.svg"));
for (const size of [192, 512]) {
  const canvas = createCanvas(size, size);
  canvas.getContext("2d").drawImage(icon, 0, 0, size, size);
  await writeFile(`public/icon-${size}.png`, canvas.toBuffer("image/png"));
}
