import { it, expect, vi, afterEach } from "vitest";
import { DriveSession } from "./client";
import { makeBackup } from "../backup";
import { newNote } from "../model";
afterEach(() => vi.unstubAllGlobals());
it("uses authenticated appData uploads and preserves IDs and paper colors on download", async () => {
  const note = newNote("同期");
  note.pages[0].paperColor = "#1e2822";
  const backup = makeBackup([note]);
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/about"))
        return new Response(
          JSON.stringify({ user: { permissionId: "account-1" } }),
        );
      if (url.includes("alt=media"))
        return new Response(new Uint8Array(backup).buffer);
      return new Response(JSON.stringify({ id: "file-1" }));
    }),
  );
  const repo = new DriveSession("test-token", Date.now() + 100000);
  expect((await repo.account()).permissionId).toBe("account-1");
  await repo.write({ kind: "note", note });
  const upload = calls.find((c) => c.url.includes("uploadType=multipart"))!;
  expect((upload.init?.headers as Record<string, string>).Authorization).toBe(
    "Bearer test-token",
  );
  expect(await (upload.init!.body as Blob).text()).toContain("appDataFolder");
  const read = await repo.read("file-1");
  expect(read.kind).toBe("note");
  if (read.kind === "note") {
    expect(read.note.id).toBe(note.id);
    expect(read.note.updated).toBe(note.updated);
    expect(read.note.pages[0].id).toBe(note.pages[0].id);
    expect(read.note.pages[0].paperColor).toBe("#1e2822");
  }
});
it("handles expired sessions and server authentication errors without modifying local data", async () => {
  const fetch = vi.fn(async () => new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    new DriveSession("test-token", Date.now() - 1).account(),
  ).rejects.toThrow("再接続");
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    new DriveSession("test-token", Date.now() + 100000).account(),
  ).rejects.toThrow("再接続");
});
it("uses a resumable session for large payloads and refuses an unexpected upload origin", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === "POST"
        ? new Response("", {
            headers: {
              Location:
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test",
            },
          })
        : new Response(JSON.stringify({ id: "large-file" }));
    }),
  );
  const repo = new DriveSession("test-token", Date.now() + 100000);
  expect(
    await repo.write({
      kind: "folders",
      folders: ["x".repeat(6 * 1024 * 1024)],
    }),
  ).toBe("large-file");
  expect(calls[0].url).toContain("uploadType=resumable");
  expect(calls[1].init?.method).toBe("PUT");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("", {
          headers: { Location: "https://example.com/steal" },
        }),
    ),
  );
  await expect(
    repo.write({ kind: "folders", folders: ["x".repeat(6 * 1024 * 1024)] }),
  ).rejects.toThrow("無効");
});
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { hash } from "./sync";
it("uploads the original PDF only once across successive ink revisions", async () => {
  let pdfUploads = 0,
    noteUploads = 0,
    lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("/upload/")) {
        lookups++;
        return new Response(JSON.stringify({ files: [] }));
      }
      const text = await (init?.body as Blob).text();
      if (text.includes('"mppKind":"pdf"')) {
        pdfUploads++;
        return new Response(JSON.stringify({ id: "shared-pdf" }));
      }
      noteUploads++;
      return new Response(JSON.stringify({ id: "note-" + noteUploads }));
    }),
  );
  const n = { ...newNote("PDF"), pdf: new TextEncoder().encode("%PDF-test") };
  const repo = new DriveSession("test-token", Date.now() + 100000);
  await repo.write({ kind: "note", note: n });
  await repo.write({ kind: "note", note: { ...n, title: "筆記後" } });
  expect(pdfUploads).toBe(1);
  expect(lookups).toBe(1);
  expect(noteUploads).toBe(2);
});
it("reassembles a referenced PDF and rejects a corrupted original", async () => {
  const n = newNote("PDF"),
    pdf = new TextEncoder().encode("%PDF-original");
  n.pages[0].pdfIndex = 0;
  const files = unzipSync(makeBackup([n]));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.notes[0].pdfFile = "external.pdf";
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["remote-pdf.json"] = strToU8(
    JSON.stringify({ fileId: "pdf-ref", digest: await hash(pdf) }),
  );
  const bytes = zipSync(files);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          new Uint8Array(url.includes("/pdf-ref?") ? pdf : bytes).buffer,
        ),
    ),
  );
  const repo = new DriveSession("test-token", Date.now() + 100000);
  const result = await repo.read("note-ref");
  expect(result.kind).toBe("note");
  if (result.kind === "note") {
    expect(result.note.pdf).toEqual(pdf);
    expect(result.note.updated).toBe(n.updated);
    expect(result.note.pages[0].pdfIndex).toBe(0);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          new Uint8Array(
            url.includes("/pdf-ref?")
              ? new TextEncoder().encode("%PDF-damaged")
              : bytes,
          ).buffer,
        ),
    ),
  );
  await expect(
    new DriveSession("test-token", Date.now() + 100000).read("note-ref"),
  ).rejects.toThrow("内容を確認");
});
