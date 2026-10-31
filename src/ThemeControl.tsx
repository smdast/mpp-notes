import { useEffect } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import type { Theme } from "./preferences";
export function useTheme(theme: Theme) {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (query.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#17221c" : "#eef1ec");
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
}
export function ThemeControl({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <label className="theme-control" title="表示テーマ">
      <Icon size={15} />
      <select
        aria-label="表示テーマ"
        value={theme}
        onChange={(e) => onChange(e.target.value as Theme)}
      >
        <option value="system">システム</option>
        <option value="light">ライト</option>
        <option value="dark">ダーク</option>
      </select>
    </label>
  );
}
