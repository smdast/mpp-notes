import { it, expect, vi } from "vitest";
import { createCanvas, Image } from "@napi-rs/canvas";
import { PDFDocument, degrees } from "pdf-lib";
import { importPDF, overlayPlacement, pdfjs, exportPDF } from "./pdf";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).href;
it("positions overlays for rotated source pages", () => {
  expect(overlayPlacement(90, 600, 800)).toMatchObject({
    x: 600,
    y: 0,
    width: 800,
    height: 600,
    rotate: degrees(90),
  });
  expect(overlayPlacement(180, 600, 800)).toMatchObject({
    x: 600,
    y: 800,
    width: 600,
    height: 800,
  });
  expect(overlayPlacement(270, 600, 800)).toMatchObject({
    x: 0,
    y: 800,
    width: 800,
    height: 600,
  });
  expect(overlayPlacement(0, 600, 800)).toMatchObject({
    x: 0,
    y: 0,
    width: 600,
    height: 800,
  });
});
it("imports mixed size and rotated PDF pages in visual coordinates", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]).setRotation(degrees(90));
  pdf.addPage([400, 500]);
  const n = await importPDF(await pdf.save(), "資料");
  expect(n.pages[0]).toMatchObject({ width: 800, height: 600, pdfIndex: 0 });
  expect(n.pages[1]).toMatchObject({ width: 400, height: 500, pdfIndex: 1 });
});
it("rejects broken PDFs with a readable error", async () => {
  await expect(importPDF(new Uint8Array([1, 2]), "壊れたPDF")).rejects.toThrow(
    "PDFを開けません",
  );
});
it("exports strokes at the same visible location for all rotations and crop boxes", async () => {
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const p = pdf.addPage([240, 340]);
    p.setCropBox(20, 20, 200, 300);
    p.setRotation(degrees(rotation));
  }
  const note = await importPDF(await pdf.save(), "配置確認");
  const stamp = createCanvas(10, 10);
  stamp.getContext("2d").fillStyle = "#00ff00";
  stamp.getContext("2d").fillRect(0, 0, 10, 10);
  for (const p of note.pages)
    p.strokes = [
      {
        id: "test",
        tool: "pen",
        color: "#ff0000",
        width: 8,
        points: [
          { x: 40, y: 50, p: 1 },
          { x: 90, y: 50, p: 1 },
        ],
      },
      {
        id: "image", tool: "pen", color: "#000000", width: .05,
        image: stamp.toDataURL("image/png"),
        points: [{x:100,y:80,p:.5},{x:130,y:80,p:.5},{x:130,y:110,p:.5},{x:100,y:110,p:.5}],
      },
    ];
  vi.stubGlobal("document", { createElement: () => createCanvas(1, 1) });
  vi.stubGlobal("Image", Image);
  let output: Uint8Array;
  try {
    output = await exportPDF(note);
  } finally {
    vi.unstubAllGlobals();
  }
  const doc = await pdfjs.getDocument({ data: output! }).promise;
  try {
    for (let i = 1; i <= 4; i++) {
      const p = await doc.getPage(i);
      const viewport = p.getViewport({ scale: 1 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await p.render({
        canvasContext: canvas.getContext(
          "2d",
        ) as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const pixel = canvas.getContext("2d").getImageData(60, 50, 1, 1).data;
      expect(pixel[0]).toBeGreaterThan(200);
      expect(pixel[1]).toBeLessThan(80);
      const pastedImage = canvas.getContext("2d").getImageData(115, 95, 1, 1).data;
      expect(pastedImage[1]).toBeGreaterThan(200);
      expect(pastedImage[0]).toBeLessThan(80);
      const blank = canvas.getContext("2d").getImageData(140, 130, 1, 1).data;
      expect(blank[1]).toBeGreaterThan(240);
    }
  } finally {
    await doc.destroy();
  }
});
