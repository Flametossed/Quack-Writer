import { create } from "zustand";
import {
  createWorkspaceFolder,
  pickFolder,
  listDir,
  platform,
  type DirEntry,
} from "../lib/fileIo";
import { useSaveStore } from "./save";

const KEY = "quack.workspace";

type WorkspaceState = {
  root: { path: string; name: string } | null;
  /** Loaded children keyed by directory path (undefined = not loaded yet). */
  children: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  isExpandingAll: boolean;

  openFolder: () => Promise<void>;
  closeFolder: () => void;
  toggleDir: (path: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<boolean>;
  expandAll: () => Promise<void>;
  collapseAll: () => void;
  refresh: () => Promise<void>;
};

async function loadChildren(
  path: string,
  set: (fn: (s: WorkspaceState) => Partial<WorkspaceState>) => void
): Promise<void> {
  try {
    const entries = await listDir(path);
    set((s) => ({ children: { ...s.children, [path]: entries } }));
  } catch (e) {
    useSaveStore
      .getState()
      .setError(e instanceof Error ? e.message : "Couldn't read folder");
  }
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  root: null,
  children: {},
  expanded: {},
  isExpandingAll: false,

  openFolder: async () => {
    const picked = await pickFolder();
    if (!picked) return;
    set({
      root: picked,
      children: {},
      expanded: { [picked.path]: true },
    });
    // Folder handles can't be persisted from the web picker.
    if (platform.isTauri) {
      localStorage.setItem(KEY, JSON.stringify(picked));
    }
    await loadChildren(picked.path, set);
  },

  closeFolder: () => {
    localStorage.removeItem(KEY);
    set({ root: null, children: {}, expanded: {} });
  },

  toggleDir: async (path) => {
    const { expanded, children } = get();
    const nowExpanded = !expanded[path];
    set((s) => ({ expanded: { ...s.expanded, [path]: nowExpanded } }));
    if (nowExpanded && !children[path]) {
      await loadChildren(path, set);
    }
  },

  createFolder: async (parentPath, name) => {
    const { root } = get();
    if (!root) return false;
    try {
      await createWorkspaceFolder(parentPath, name, root.path);
      set((s) => ({
        expanded: { ...s.expanded, [parentPath]: true },
      }));
      await loadChildren(parentPath, set);
      return true;
    } catch (e) {
      useSaveStore
        .getState()
        .setError(e instanceof Error ? e.message : "Couldn't create folder");
      return false;
    }
  },

  expandAll: async () => {
    const { root, isExpandingAll } = get();
    if (!root || isExpandingAll) return;
    set({ isExpandingAll: true });
    try {
      const children: Record<string, DirEntry[]> = {};
      const expanded: Record<string, boolean> = {};
      const pending = [root.path];
      const seen = new Set<string>();

      while (pending.length > 0) {
        const path = pending.shift()!;
        const key = path.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) continue;
        if (seen.size >= 2000) {
          throw new Error("This workspace has too many folders to expand at once");
        }
        seen.add(key);

        const entries = await listDir(path);
        children[path] = entries;
        expanded[path] = true;
        for (const entry of entries) {
          if (entry.isDir) pending.push(entry.path);
        }
      }

      set({ children, expanded });
    } catch (e) {
      useSaveStore
        .getState()
        .setError(e instanceof Error ? e.message : "Couldn't expand folders");
    } finally {
      set({ isExpandingAll: false });
    }
  },

  collapseAll: () => {
    const { root } = get();
    if (!root) return;
    // Keep the root open so the top-level list stays visible; loaded
    // children stay cached so re-expanding is instant.
    set({ expanded: { [root.path]: true } });
  },

  refresh: async () => {
    const { root, expanded } = get();
    if (!root) return;
    set({ children: {} });
    await loadChildren(root.path, set);
    // Reload any directories the user had expanded.
    for (const [path, isOpen] of Object.entries(expanded)) {
      if (isOpen && path !== root.path) await loadChildren(path, set);
    }
  },
}));

// Restore the last workspace on startup (native only — real paths persist).
// Fails silently: a folder deleted since last session just clears the state.
if (platform.isTauri) {
  const stored = localStorage.getItem(KEY);
  if (stored) {
    void (async () => {
      try {
        const root = JSON.parse(stored) as { path: string; name: string };
        const entries = await listDir(root.path);
        useWorkspace.setState({
          root,
          expanded: { [root.path]: true },
          children: { [root.path]: entries },
        });
      } catch {
        localStorage.removeItem(KEY);
      }
    })();
  }
}
