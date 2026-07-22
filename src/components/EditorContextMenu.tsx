import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import {
  BookPlus,
  ClipboardPaste,
  Copy,
  Scissors,
  TextSelect,
} from "lucide-react";
import { spellSuggest, spellAddWord, type SpellCheckResult } from "../lib/spell";
import "./EditorContextMenu.css";

export type ContextWord = { from: number; to: number; text: string };

type Props = {
  view: EditorView;
  x: number;
  y: number;
  word: ContextWord | null;
  onClose: () => void;
};

/**
 * Custom right-click menu for the editor. Exists because WebView2's default
 * context menu ships without spelling-suggestion items; suggestions here come
 * from the same Windows spellchecker that draws the squiggles (lib/spell.ts).
 */
export function EditorContextMenu({ view, x, y, word, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [spell, setSpell] = useState<SpellCheckResult | null>(null);
  const [checking, setChecking] = useState(!!word);

  // Fetch suggestions for the clicked word.
  useEffect(() => {
    let stale = false;
    if (!word) return;
    void spellSuggest(word.text).then((result) => {
      if (stale) return;
      setSpell(result);
      setChecking(false);
    });
    return () => {
      stale = true;
    };
  }, [word]);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - rect.width - 8);
    const ny = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y, spell, checking]);

  // Dismiss on outside click, Escape, scroll, or window blur.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        view.focus();
      }
    };
    const close = () => onClose();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose, view]);

  const done = () => {
    onClose();
    view.focus();
  };

  const applySuggestion = (s: string) => {
    if (!word) return;
    view.dispatch({
      changes: { from: word.from, to: word.to, insert: s },
      selection: { anchor: word.from + s.length },
    });
    done();
  };

  const addToDictionary = async () => {
    if (!word) return;
    await spellAddWord(word.text);
    // Nudge the renderer to drop the now-stale squiggle: flip the native
    // spellcheck attribute off/on to force a recheck (no document change).
    const dom = view.contentDOM;
    dom.spellcheck = false;
    requestAnimationFrame(() => {
      dom.spellcheck = true;
    });
    done();
  };

  const sel = view.state.selection.main;
  const hasSelection = !sel.empty;

  const copy = async () => {
    await navigator.clipboard.writeText(view.state.sliceDoc(sel.from, sel.to));
    done();
  };

  const cut = async () => {
    await navigator.clipboard.writeText(view.state.sliceDoc(sel.from, sel.to));
    view.dispatch({
      changes: { from: sel.from, to: sel.to },
      selection: { anchor: sel.from },
    });
    done();
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
      }
    } catch {
      // Clipboard read denied — nothing to paste.
    }
    done();
  };

  const selectAll = () => {
    view.dispatch({
      selection: { anchor: 0, head: view.state.doc.length },
    });
    done();
  };

  const showSpelling = !!word && (checking || spell?.misspelled);

  return (
    <div
      ref={menuRef}
      className="editor-ctx"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      // Right-clicking the menu itself shouldn't open the native menu.
      onContextMenu={(e) => e.preventDefault()}
    >
      {showSpelling && (
        <>
          {checking && (
            <div className="editor-ctx__note">Checking spelling…</div>
          )}
          {!checking && spell?.misspelled && spell.suggestions.length === 0 && (
            <div className="editor-ctx__note">No suggestions</div>
          )}
          {!checking &&
            spell?.misspelled &&
            spell.suggestions.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                className="editor-ctx__item editor-ctx__item--suggestion"
                role="menuitem"
                onClick={() => applySuggestion(s)}
              >
                {s}
              </button>
            ))}
          {!checking && spell?.misspelled && (
            <button
              type="button"
              className="editor-ctx__item"
              role="menuitem"
              onClick={() => void addToDictionary()}
            >
              <BookPlus size={15} aria-hidden="true" />
              <span>Add to dictionary</span>
            </button>
          )}
          <div className="editor-ctx__sep" role="separator" />
        </>
      )}
      <button
        type="button"
        className="editor-ctx__item"
        role="menuitem"
        disabled={!hasSelection}
        onClick={() => void cut()}
      >
        <Scissors size={15} aria-hidden="true" />
        <span>Cut</span>
        <kbd>Ctrl+X</kbd>
      </button>
      <button
        type="button"
        className="editor-ctx__item"
        role="menuitem"
        disabled={!hasSelection}
        onClick={() => void copy()}
      >
        <Copy size={15} aria-hidden="true" />
        <span>Copy</span>
        <kbd>Ctrl+C</kbd>
      </button>
      <button
        type="button"
        className="editor-ctx__item"
        role="menuitem"
        onClick={() => void paste()}
      >
        <ClipboardPaste size={15} aria-hidden="true" />
        <span>Paste</span>
        <kbd>Ctrl+V</kbd>
      </button>
      <div className="editor-ctx__sep" role="separator" />
      <button
        type="button"
        className="editor-ctx__item"
        role="menuitem"
        onClick={selectAll}
      >
        <TextSelect size={15} aria-hidden="true" />
        <span>Select all</span>
        <kbd>Ctrl+A</kbd>
      </button>
    </div>
  );
}
