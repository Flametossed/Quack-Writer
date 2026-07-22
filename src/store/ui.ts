import { create } from "zustand";

type Screen = "start" | "editor";

const EXPLORER_KEY = "quack.explorerVisible";
const FORMAT_BAR_KEY = "quack.formatBarVisible";
const SPELLCHECK_KEY = "quack.spellcheck";

// Booleans persist as "1"/"0"; anything else falls back to the default.
function loadBool(key: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === "1" ? true : stored === "0" ? false : fallback;
}

function saveBool(key: string, value: boolean) {
  localStorage.setItem(key, value ? "1" : "0");
}

type UiState = {
  screen: Screen;
  explorerVisible: boolean;
  formatBarVisible: boolean;
  spellcheck: boolean;
  setScreen: (s: Screen) => void;
  toggleExplorer: () => void;
  toggleFormatBar: () => void;
  toggleSpellcheck: () => void;
};

export const useUi = create<UiState>((set, get) => ({
  screen: "start",
  explorerVisible: loadBool(EXPLORER_KEY, true),
  formatBarVisible: loadBool(FORMAT_BAR_KEY, true),
  spellcheck: loadBool(SPELLCHECK_KEY, true),
  setScreen: (screen) => set({ screen }),
  toggleExplorer: () => {
    const explorerVisible = !get().explorerVisible;
    saveBool(EXPLORER_KEY, explorerVisible);
    set({ explorerVisible });
  },
  toggleFormatBar: () => {
    const formatBarVisible = !get().formatBarVisible;
    saveBool(FORMAT_BAR_KEY, formatBarVisible);
    set({ formatBarVisible });
  },
  toggleSpellcheck: () => {
    const spellcheck = !get().spellcheck;
    saveBool(SPELLCHECK_KEY, spellcheck);
    set({ spellcheck });
  },
}));
