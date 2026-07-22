import { create } from "zustand";

type Theme = "dark" | "light";
const KEY = "quack.theme";

function load(): Theme {
  return (localStorage.getItem(KEY) as Theme) || "dark";
}

type ThemeState = {
  theme: Theme;
  set: (t: Theme) => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: load(),
  set: (t) => {
    localStorage.setItem(KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().set(next);
  },
}));

// Set the attribute once on load.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", load());
}