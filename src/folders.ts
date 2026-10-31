import type { Note } from "./model";
export const parentFolder = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const folderName = (path: string) => path.split("/").at(-1) || path;
export const isWithin = (path: string, root: string) =>
  path === root || path.startsWith(root + "/");
export function normalizeFolders(paths: string[]) {
  const all = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++)
      all.add(parts.slice(0, i).join("/"));
  }
  return [...all].sort((a, b) => a.localeCompare(b, "ja"));
}
export function relocateFolder(
  folders: string[],
  notes: Note[],
  from: string,
  to?: string,
) {
  if (!folders.includes(from)) throw new Error("フォルダーが見つかりません。");
  if (to === from) return { folders, notes };
  if (to && (isWithin(to, from) || folders.includes(to)))
    throw new Error(
      "同じ名前のフォルダー、または自分の配下へは移動できません。",
    );
  const parent = parentFolder(from);
  return {
    folders: normalizeFolders(
      folders.flatMap((f) =>
        isWithin(f, from) ? (to ? [to + f.slice(from.length)] : []) : [f],
      ),
    ),
    notes: notes.map((n) =>
      n.folder && isWithin(n.folder, from)
        ? {
            ...n,
            folder: to ? to + n.folder.slice(from.length) : parent || undefined,
            updated: Date.now(),
          }
        : n,
    ),
  };
}
