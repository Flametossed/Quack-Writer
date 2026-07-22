import { create } from "zustand";

export type EditorFont = "system" | "serif" | "sans" | "mono";

const KEY = "quack.font";
const SIZE_KEY = "quack.fontSize";

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_FONT_SIZE = 15;

const FAMILIES: Record<Exclude<EditorFont, "system">, string> = {
  serif: "Georgia, Cambria, 'Times New Roman', serif",
  sans: "'Segoe UI Variable Text', 'Segoe UI', sans-serif",
  mono: "var(--font-mono)",
};

function apply(font: EditorFont) {
  const root = document.documentElement;
  if (font === "system") {
    // Remove the override so the stylesheet default for --font-editor applies.
    root.style.removeProperty("--font-editor");
  } else {
    root.style.setProperty("--font-editor", FAMILIES[font]);
  }
}

function applySize(px: number) {
  document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
}

function clampSize(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)));
}

function load(): EditorFont {
  const stored = localStorage.getItem(KEY);
  return stored === "serif" || stored === "sans" || stored === "mono"
    ? stored
    : "system";
}

function loadSize(): number {
  const stored = Number(localStorage.getItem(SIZE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampSize(stored)
    : DEFAULT_FONT_SIZE;
}

type FontState = {
  font: EditorFont;
  size: number;
  set: (f: EditorFont) => void;
  setSize: (px: number) => void;
  bumpSize: (delta: number) => void;
  resetSize: () => void;
};

export const useFont = create<FontState>((set, get) => ({
  font: load(),
  size: loadSize(),
  set: (f) => {
    localStorage.setItem(KEY, f);
    apply(f);
    set({ font: f });
  },
  setSize: (px) => {
    const size = clampSize(px);
    localStorage.setItem(SIZE_KEY, String(size));
    applySize(size);
    set({ size });
  },
  bumpSize: (delta) => {
    get().setSize(get().size + delta);
  },
  resetSize: () => {
    get().setSize(DEFAULT_FONT_SIZE);
  },
}));

// Apply the persisted choices once on startup.
if (typeof document !== "undefined") {
  apply(load());
  applySize(loadSize());
}
