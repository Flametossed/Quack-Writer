import { SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Moon,
  Save,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useDocs } from "../store/docs";
import { useSelection } from "../store/selection";
import { useTheme } from "../store/theme";
import { saveActiveDoc } from "../lib/docActions";
import { editorViewBus } from "../lib/editorViewBus";
import "./StatusBar.css";

type SearchMatch = { from: number; to: number };

function getMatches(view: EditorView, query: SearchQuery): SearchMatch[] {
  if (!query.valid) return [];
  const matches: SearchMatch[] = [];
  const cursor = query.getCursor(view.state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    matches.push(next.value);
  }
  return matches;
}

function selectMatch(view: EditorView, match: SearchMatch) {
  view.dispatch({
    selection: { anchor: match.from, head: match.to },
    scrollIntoView: true,
  });
}

export function StatusBar() {
  const doc = useDocs((state) =>
    state.docs.find((candidate) => candidate.id === state.activeId)
  );
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggle);
  const eyeCare = useTheme((state) => state.eyeCare);
  const toggleEyeCare = useTheme((state) => state.toggleEyeCare);
  const selection = useSelection((state) => state.stats);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [findText, setFindText] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(-1);
  const canFind =
    !!doc && !(doc.language === "markdown" && doc.view === "preview");

  // Deferred so fast typing isn't blocked by re-counting the whole document.
  const deferredContent = useDeferredValue(doc?.content ?? "");
  const stats = useMemo(() => {
    const text = deferredContent;
    const words = text.trim()
      ? text.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const chars = text.length;
    const lines = text ? text.split("\n").length : 0;
    return { words, chars, lines };
  }, [deferredContent]);

  const applySearch = useCallback((value: string, targetIndex = 0) => {
    setFindText(value);
    const view = editorViewBus.get();
    if (!view) {
      setMatchCount(0);
      setMatchIndex(-1);
      return;
    }

    const query = new SearchQuery({ search: value });
    view.dispatch({ effects: setSearchQuery.of(query) });
    const matches = getMatches(view, query);
    setMatchCount(matches.length);

    if (matches.length === 0) {
      setMatchIndex(-1);
      return;
    }

    const index = Math.min(Math.max(targetIndex, 0), matches.length - 1);
    setMatchIndex(index);
    selectMatch(view, matches[index]);
  }, []);

  const clearSearch = useCallback((focusInput = true) => {
    const view = editorViewBus.get();
    if (view) {
      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: "" })),
      });
    }
    setFindText("");
    setMatchCount(0);
    setMatchIndex(-1);
    if (focusInput) findInputRef.current?.focus();
  }, []);

  function moveMatch(direction: 1 | -1) {
    const view = editorViewBus.get();
    if (!view || !findText) return;

    const query = new SearchQuery({ search: findText });
    view.dispatch({ effects: setSearchQuery.of(query) });
    const matches = getMatches(view, query);
    setMatchCount(matches.length);
    if (matches.length === 0) {
      setMatchIndex(-1);
      return;
    }

    const current = matchIndex >= 0 ? matchIndex : direction > 0 ? -1 : 0;
    const next = (current + direction + matches.length) % matches.length;
    setMatchIndex(next);
    selectMatch(view, matches[next]);
  }

  // Route the standard shortcut to the integrated status-bar search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        canFind &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        event.stopPropagation();
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canFind]);

  // A search never carries into a different document or preview mode.
  useEffect(() => {
    clearSearch(false);
  }, [doc?.id, doc?.view, clearSearch]);

  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        <button
          className="status-btn"
          onClick={() => void saveActiveDoc()}
          disabled={!doc}
          title="Save (⌘/Ctrl+S)"
          aria-label="Save document"
        >
          <Save size={13} aria-hidden="true" />
        </button>

        <div className={`statusbar__find${canFind ? "" : " is-disabled"}`}>
          <Search size={12} aria-hidden="true" />
          <input
            ref={findInputRef}
            type="search"
            value={findText}
            disabled={!canFind}
            placeholder={canFind ? "Find in document" : "Find unavailable"}
            aria-label="Find in document"
            spellCheck={false}
            onChange={(event) => applySearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                moveMatch(event.shiftKey ? -1 : 1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                clearSearch();
                editorViewBus.get()?.focus();
              }
            }}
          />
          {findText && (
            <span className="statusbar__find-count" aria-live="polite">
              {matchCount === 0 ? "0/0" : `${matchIndex + 1}/${matchCount}`}
            </span>
          )}
          <button
            type="button"
            className="statusbar__find-action"
            disabled={!findText || matchCount === 0}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
            onClick={() => moveMatch(-1)}
          >
            <ChevronUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="statusbar__find-action"
            disabled={!findText || matchCount === 0}
            title="Next match (Enter)"
            aria-label="Next match"
            onClick={() => moveMatch(1)}
          >
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {findText && (
            <button
              type="button"
              className="statusbar__find-action"
              title="Clear search (Escape)"
              aria-label="Clear search"
              onClick={() => clearSearch()}
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        {doc && (
          <span className="statusbar__path" title={doc.path ?? "Unsaved"}>
            {doc.path ?? "Unsaved document"}
          </span>
        )}
      </div>

      <div className="statusbar__right">
        {doc &&
          (selection ? (
            <span className="statusbar__selection">
              {selection.words} {selection.words === 1 ? "word" : "words"},{" "}
              {selection.chars} chars selected
            </span>
          ) : (
            <>
              <span>{stats.words} words</span>
              <span>{stats.chars} chars</span>
              <span>Ln {stats.lines}</span>
              {stats.words > 0 && (
                <span title="Estimated reading time (~225 wpm)">
                  ~{Math.max(1, Math.round(stats.words / 225))} min read
                </span>
              )}
            </>
          ))}
        <button
          className={`status-btn${eyeCare ? " status-btn--on" : ""}`}
          onClick={toggleEyeCare}
          title="Eye protection (warm tint)"
          aria-label="Toggle eye protection mode"
          aria-pressed={eyeCare}
        >
          <Eye size={13} aria-hidden="true" />
        </button>
        <button
          className="status-btn"
          onClick={toggleTheme}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun size={13} aria-hidden="true" />
          ) : (
            <Moon size={13} aria-hidden="true" />
          )}
        </button>
      </div>
    </footer>
  );
}
