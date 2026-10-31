import { it, expect } from "vitest";
import { readPreferences, defaultPreferences } from "./preferences";
it("loads light and dark modes and upgrades older preferences to system mode", () => {
  expect(readPreferences({ theme: "dark" }).theme).toBe("dark");
  expect(readPreferences({ theme: "light" }).theme).toBe("light");
  expect(readPreferences({ pens: defaultPreferences().pens }).theme).toBe(
    "system",
  );
  expect(readPreferences({ theme: "invalid" }).theme).toBe("system");
});
