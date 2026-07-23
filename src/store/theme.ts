import { create } from "zustand";

type Theme = "dark" | "light";
const KEY = "quack.theme";
const EYE_KEY = "quack.eyeCare";

function load(): Theme {
  return (localStorage.getItem(KEY) as Theme) || "dark";
}

function loadEyeCare(): boolean {
  return localStorage.getItem(EYE_KEY) === "1";
}

function applyEyeCare(on: boolean) {
  const root = document.documentElement;
  if (on) root.setAttribute("data-eyecare", "1");
  else root.removeAttribute("data-eyecare");
}

type ThemeState = {
  theme: Theme;
  eyeCare: boolean;
  set: (t: Theme) => void;
  toggle: () => void;
  toggleEyeCare: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: load(),
  eyeCare: loadEyeCare(),
  set: (t) => {
    localStorage.setItem(KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().set(next);
  },
  toggleEyeCare: () => {
    const eyeCare = !get().eyeCare;
    localStorage.setItem(EYE_KEY, eyeCare ? "1" : "0");
    applyEyeCare(eyeCare);
    set({ eyeCare });
  },
}));

// Set the attributes once on load.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", load());
  applyEyeCare(loadEyeCare());
}
