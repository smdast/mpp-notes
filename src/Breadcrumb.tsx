import { ChevronRight as PathChevron } from "lucide-react";
import { Fragment } from "react";
export const displayPath = (path: string) =>
  path.split("/").filter(Boolean).join(" > ");
export function Breadcrumb({
  folder,
  title,
  onFolder,
}: {
  folder?: string;
  title?: string;
  onFolder?: (folder: string) => void;
}) {
  const parts = folder ? folder.split("/") : ["未分類"];
  return (
    <span
      className="path-breadcrumb"
      aria-label="パンくずリスト"
      title={
        (folder ? displayPath(folder) : "未分類") + (title ? " > " + title : "")
      }
    >
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <PathChevron className="path-separator" size={13} aria-hidden="true"/>
          )}
          {onFolder ? (
            <button onClick={() => onFolder(parts.slice(0, i + 1).join("/"))}>
              {part}
            </button>
          ) : (
            <span>{part}</span>
          )}
        </Fragment>
      ))}
      {title && (
        <>
          <PathChevron className="path-separator" size={13} aria-hidden="true"/>
          <strong>{title}</strong>
        </>
      )}
    </span>
  );
}
