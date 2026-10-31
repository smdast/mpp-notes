import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { newNote } from "./model";
import { makeBackup, readBackup, readBackupBundle } from "./backup";
it("round trips notes, remaps IDs and preserves original PDF bytes", () => {
  const a = newNote("テスト");
  a.pdf = strToU8("%PDF-original");
  a.pages[0].pdfIndex = 0;
  const b = readBackup(makeBackup([a]))[0];
  expect(b.title).toBe(a.title);
  expect(b.id).not.toBe(a.id);
  expect(b.pages[0].id).not.toBe(a.pages[0].id);
  expect(b.pdf).toEqual(a.pdf);
});
it("rejects unknown versions, broken archives and invalid geometry", () => {
  expect(() => readBackup(new Uint8Array([1, 2]))).toThrow();
  expect(() =>
    readBackup(
      zipSync({
        "manifest.json": strToU8(
          JSON.stringify({ format: "mpp-notes", version: 2, notes: [] }),
        ),
      }),
    ),
  ).toThrow();
  const n = newNote();
  n.pages[0].width = -1;
  expect(() => readBackup(makeBackup([n]))).toThrow();
});
it("preserves folders including empty folders and reads old backups", () => {
  const n = { ...newNote("分類ノート"), folder: "勉強" };
  const bundle = readBackupBundle(makeBackup([n], ["勉強", "空フォルダー"]));
  expect(bundle.folders).toEqual(["勉強", "空フォルダー"]);
  expect(bundle.notes[0].folder).toBe("勉強");
  const legacy = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        format: "mpp-notes",
        version: 1,
        notes: [newNote("旧版")],
      }),
    ),
  });
  expect(readBackupBundle(legacy).folders).toEqual([]);
});
it("preserves nested paths and geometric strokes in backup", () => {
  const n = { ...newNote("図形"), folder: "学校/数学/図形" };
  n.pages[0].strokes = [
    {
      id: "shape",
      tool: "pen",
      shape: "rectangle",
      pressure: false,
      color: "#243d35",
      width: 4,
      points: [
        { x: 0, y: 0, p: 0.7 },
        { x: 100, y: 0, p: 0.7 },
        { x: 100, y: 100, p: 0.7 },
        { x: 0, y: 100, p: 0.7 },
        { x: 0, y: 0, p: 0.7 },
      ],
    },
  ];
  const restored = readBackupBundle(
    makeBackup([n], ["学校", "学校/数学", "学校/数学/図形"]),
  );
  expect(restored.notes[0].folder).toBe(n.folder);
  expect(restored.notes[0].pages[0].strokes[0].shape).toBe("rectangle");
  expect(restored.notes[0].pages[0].strokes[0].pressure).toBe(false);
});
