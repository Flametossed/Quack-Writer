import { create } from "zustand";

type SaveState = "idle" | "saving" | "saved" | "error";

type SaveStore = {
  state: SaveState;
  set: (s: SaveState) => void;
};

export const useSaveStore = create<SaveStore>((set) => ({
  state: "idle",
  set: (s) => set({ state: s }),
}));