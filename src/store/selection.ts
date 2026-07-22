import { create } from "zustand";

export type SelectionStats = { words: number; chars: number };

type SelectionState = {
  /** Word/char counts of the current editor selection; null when empty. */
  stats: SelectionStats | null;
  set: (stats: SelectionStats | null) => void;
};

export const useSelection = create<SelectionState>((set) => ({
  stats: null,
  // Guarded so per-keystroke listener updates don't re-render subscribers.
  set: (stats) =>
    set((prev) => {
      if (prev.stats === stats) return prev;
      if (
        prev.stats &&
        stats &&
        prev.stats.words === stats.words &&
        prev.stats.chars === stats.chars
      ) {
        return prev;
      }
      return { stats };
    }),
}));
