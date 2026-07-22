import { create } from "zustand";

type SaveState = "idle" | "saving" | "saved" | "error";

type SaveStore = {
  state: SaveState;
  message: string | null;
  set: (s: SaveState) => void;
  setError: (message: string) => void;
};

let clearTimer: ReturnType<typeof setTimeout> | undefined;

export const useSaveStore = create<SaveStore>((set) => ({
  state: "idle",
  message: null,
  set: (s) => {
    clearTimeout(clearTimer);
    set({ state: s, message: null });
  },
  setError: (message) => {
    set({ state: "error", message });
    // Errors auto-dismiss so the status bar doesn't stay red forever.
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => set({ state: "idle", message: null }), 6000);
  },
}));
