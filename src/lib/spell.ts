// Spelling suggestions from the Windows Spell Checking API (native only).
// WebView2 squiggles come from the same OS engine, but its context menu has
// no suggestion items — the custom editor context menu calls these instead.

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SpellCheckResult = {
  misspelled: boolean;
  suggestions: string[];
};

export function spellAvailable(): boolean {
  return isTauri;
}

/** Check a word; returns null when native spellcheck isn't available. */
export async function spellSuggest(
  word: string
): Promise<SpellCheckResult | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<SpellCheckResult>("spell_suggest", { word });
  } catch {
    return null;
  }
}

/** Add a word to the user's Windows custom dictionary. */
export async function spellAddWord(word: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("spell_add_word", { word });
    return true;
  } catch {
    return false;
  }
}
