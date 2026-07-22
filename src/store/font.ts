import { create } from "zustand";
import {
  chooseFontFile,
  saveFontToAppData,
  readFontBytes,
  deleteFontFromAppData,
  registerFontFace,
} from "../lib/fontIo";

// A font id is either a built-in preset key (see PRESETS below) or a custom
// entry prefixed with `custom:`. Stored that way in localStorage so the
// active choice survives relaunches.
export type EditorFont = string;

const KEY = "quack.font";
const SIZE_KEY = "quack.fontSize";
const CUSTOM_KEY = "quack.customFonts";

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_FONT_SIZE = 15;

export type PresetFont = {
  id: string;
  label: string;
  /** CSS font-family value used directly. */
  family: string;
};

// Built-in stacks are Windows-first and fall back through common names.
export const PRESETS: PresetFont[] = [
  { id: "system", label: "System", family: "var(--font-editor)" },
  { id: "serif", label: "Serif", family: "Georgia, Cambria, 'Times New Roman', serif" },
  { id: "sans", label: "Sans", family: "'Segoe UI Variable Text', 'Segoe UI', sans-serif" },
  { id: "mono", label: "Mono", family: "var(--font-mono)" },
  { id: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", family: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "times", label: "Times", family: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
  { id: "courier", label: "Courier New", family: "'Courier New', Courier, monospace" },
  { id: "garamond", label: "Garamond", family: "Garamond, 'Times New Roman', serif" },
  { id: "inter", label: "Inter (if installed)", family: "Inter, 'Segoe UI', sans-serif" },
];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export type CustomFont = {
  id: string;
  /** Human-readable name shown in the dropdown. */
  label: string;
  /** CSS family name applied to the editor. */
  family: string;
  source: "named" | "file";
  /** Native app-data path for the copied font file. */
  savedPath?: string;
  /** Whether the bytes have been registered via FontFace. */
  loaded: boolean;
};

function apply(family: string) {
  document.documentElement.style.setProperty("--font-editor", family);
}

function applySize(px: number) {
  document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
}

function clampSize(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)));
}

function freshId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function customFamily(id: string): string {
  return `Quack-${id}`;
}

function loadActive(): EditorFont {
  const stored = localStorage.getItem(KEY) ?? "system";
  return stored;
}

function loadSize(): number {
  const stored = Number(localStorage.getItem(SIZE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampSize(stored) : DEFAULT_FONT_SIZE;
}

type StoredCustomFont = Omit<CustomFont, "loaded">;

function loadCustomList(): CustomFont[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StoredCustomFont[]).map((f) => ({ ...f, loaded: false }));
  } catch {
    return [];
  }
}

function persistCustomList(list: CustomFont[]): void {
  const stripped: StoredCustomFont[] = list.map(({ loaded: _, ...rest }) => rest);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(stripped));
}

/** Resolve the CSS family string for a font id, or null if unknown/missing. */
function familyFor(id: EditorFont, custom: CustomFont[]): string | null {
  if (id.startsWith("custom:")) {
    const entry = custom.find((c) => c.id === id.slice("custom:".length));
    return entry?.family ?? null;
  }
  return PRESET_BY_ID.get(id)?.family ?? null;
}

type FontState = {
  font: EditorFont;
  size: number;
  customFonts: CustomFont[];
  set: (f: EditorFont) => void;
  setSize: (px: number) => void;
  bumpSize: (delta: number) => void;
  resetSize: () => void;
  addNamedFamily: (label: string, family: string) => void;
  addFileFont: () => Promise<string | null>;
  removeCustom: (id: string) => Promise<void>;
};

export const useFont = create<FontState>((set, get) => ({
  font: loadActive(),
  size: loadSize(),
  customFonts: loadCustomList(),

  set: (f) => {
    localStorage.setItem(KEY, f);
    const fam = familyFor(f, get().customFonts);
    if (fam) apply(fam);
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

  addNamedFamily: (label, family) => {
    const trimmedLabel = label.trim();
    const trimmedFamily = family.trim();
    if (!trimmedLabel || !trimmedFamily) return;
    const id = freshId();
    const next = [...get().customFonts, {
      id, label: trimmedLabel, family: trimmedFamily, source: "named" as const, loaded: true,
    }];
    persistCustomList(next);
    set({ customFonts: next });
    get().set(`custom:${id}`);
  },

  addFileFont: async () => {
    const chosen = await chooseFontFile();
    if (!chosen) return null;
    const id = freshId();
    const family = customFamily(id);
    // Native: persist the file into app data and load bytes back through the
    // registered path so the same bytes work on next launch.
    const stored = await saveFontToAppData(chosen.pickedPath, id).catch(() => null);
    const savedPath = stored?.savedPath ?? "";
    let buffer = chosen.buffer;
    if (isTauriLike() && savedPath && buffer.byteLength === 0) {
      buffer = await readFontBytes(savedPath).catch(() => new ArrayBuffer(0));
    }
    try {
      if (buffer.byteLength > 0) {
        await registerFontFace(family, buffer);
      }
    } catch {
      // A bad/unsupported font file; surface nothing — the row simply isn't loaded.
    }
    const entry: CustomFont = {
      id,
      label: chosen.filename.replace(/\.[^.]+$/, ""),
      family,
      source: "file",
      savedPath: savedPath || undefined,
      loaded: buffer.byteLength > 0,
    };
    const next = [...get().customFonts, entry];
    persistCustomList(next);
    set({ customFonts: next });
    get().set(`custom:${id}`);
    if (!entry.loaded) {
      return null;
    }
    return `custom:${id}`;
  },

  removeCustom: async (id) => {
    const { customFonts, font } = get();
    const target = customFonts.find((c) => c.id === id);
    if (!target) return;
    if (target.source === "file" && target.savedPath) {
      await deleteFontFromAppData(target.savedPath).catch(() => undefined);
    }
    const next = customFonts.filter((c) => c.id !== id);
    persistCustomList(next);
    const wasActive = font === `custom:${id}`;
    set({ customFonts: next });
    if (wasActive) {
      get().set("system");
    }
  },
}));

function isTauriLike(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Load and register persisted file fonts; safe to call before react mounts. */
export async function initCustomFonts(): Promise<void> {
  const list = useFont.getState().customFonts.filter(
    (f) => f.source === "file" && f.savedPath && !f.loaded
  );
  for (const f of list) {
    try {
      const buffer = await readFontBytes(f.savedPath!);
      await registerFontFace(f.family, buffer);
      f.loaded = true;
    } catch {
      // Leave as not-loaded; the dropdown will mark it unavailable.
    }
  }
  useFont.setState({ customFonts: [...useFont.getState().customFonts] });
}

// Apply persisted active font + size, then kick off async file-font loading.
// Both run after the user has been able to paint once, so the editor remains
// responsive even if a font file is slow to read.
if (typeof document !== "undefined") {
  const state = useFont.getState();
  const fam = familyFor(state.font, state.customFonts);
  if (fam) apply(fam);
  applySize(state.size);
  void initCustomFonts();
}