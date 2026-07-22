import { create } from "zustand";

export type RecentEntry = {
  path: string;
  name: string;
  openedAt: number;
};

const KEY = "quack.recents";
const MAX = 25;

function load(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentEntry[];
  } catch {
    return [];
  }
}

type RecentsState = {
  recents: RecentEntry[];
  add: (path: string, name: string) => void;
  remove: (path: string) => void;
  clear: () => void;
};

export const useRecents = create<RecentsState>((set, get) => ({
  recents: load(),
  add: (path, name) => {
    const next = [
      { path, name, openedAt: Date.now() },
      ...get().recents.filter((r) => r.path !== path),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ recents: next });
  },
  remove: (path) => {
    const next = get().recents.filter((r) => r.path !== path);
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ recents: next });
  },
  clear: () => {
    localStorage.removeItem(KEY);
    set({ recents: [] });
  },
}));