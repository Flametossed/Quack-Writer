import { create } from "zustand";

export type Doc = {
  id: string;
  path: string | null; // null = unsaved scratch
  name: string;
  content: string;
  savedContent: string; // for dirty detection
  language: "markdown" | "txt";
};

type DocsState = {
  docs: Doc[];
  activeId: string | null;
  order: string[]; // tab order

  openDoc: (doc: Doc) => void;
  closeDoc: (id: string) => void;
  setActive: (id: string) => void;
  setContent: (id: string, content: string) => void;
  rename: (id: string, name: string, path: string | null) => void;
  setDocContent: (path: string, content: string) => void;
  getById: (id: string) => Doc | undefined;
  active: () => Doc | null;
};

let seq = 0;
const nid = () => `doc-${Date.now()}-${++seq}`;

function detectLang(name: string): "markdown" | "txt" {
  return /\.(md|markdown)$/i.test(name) ? "markdown" : "txt";
}

export const useDocs = create<DocsState>((set, get) => ({
  docs: [],
  activeId: null,
  order: [],

  openDoc: (doc) =>
    set((s) => {
      const existing = s.docs.find((d) => d.path === doc.path && doc.path);
      if (existing) {
        return { activeId: existing.id };
      }
      return {
        docs: [...s.docs, doc],
        activeId: doc.id,
        order: [...s.order.filter((id) => id !== doc.id), doc.id],
      };
    }),

  closeDoc: (id) =>
    set((s) => {
      const idx = s.order.indexOf(id);
      const newOrder = s.order.filter((o) => o !== id);
      const newDocs = s.docs.filter((d) => d.id !== id);
      let newActive = s.activeId;
      if (s.activeId === id) {
        newActive = newOrder[Math.min(idx, newOrder.length - 1)] ?? null;
      }
      return { docs: newDocs, order: newOrder, activeId: newActive };
    }),

  setActive: (id) => set({ activeId: id }),

  setContent: (id, content) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, content, savedContent: d.savedContent } : d
      ),
    })),

  rename: (id, name, path) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id
          ? { ...d, name, path, language: detectLang(name) }
          : d
      ),
    })),

  setDocContent: (path, content) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.path === path
          ? { ...d, content, savedContent: content }
          : d
      ),
    })),

  getById: (id) => get().docs.find((d) => d.id === id),
  active: () => {
    const { docs, activeId } = get();
    return docs.find((d) => d.id === activeId) ?? null;
  },
}));

export function makeDoc(
  name: string,
  content = "",
  path: string | null = null
): Doc {
  return {
    id: nid(),
    path,
    name,
    content,
    savedContent: content,
    language: detectLang(name),
  };
}

// Re-exported for the fileIo fallback import path.
export function setDocContent(path: string, content: string) {
  useDocs.getState().setDocContent(path, content);
}