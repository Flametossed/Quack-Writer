import { useMemo, useRef, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { search } from "@codemirror/search";
import { useDocs } from "../store/docs";
import { useSelection } from "../store/selection";
import { useTheme } from "../store/theme";
import { useUi } from "../store/ui";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { editorViewBus } from "../lib/editorViewBus";
import { spellAvailable } from "../lib/spell";
import { MarkdownPreview } from "./MarkdownPreview";
import { EditorContextMenu, type ContextWord } from "./EditorContextMenu";
import "./MarkdownEditor.css";

type CtxMenuState = { x: number; y: number; word: ContextWord | null };

export function MarkdownEditor() {
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const setContent = useDocs((s) => s.setContent);
  const theme = useTheme((s) => s.theme);
  const spellcheck = useUi((s) => s.spellcheck);
  const editorRef = useRef<EditorView | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const inPreview = doc?.language === "markdown" && doc.view === "preview";

  // Close a lingering context menu when switching documents or view modes.
  useEffect(() => {
    setCtxMenu(null);
  }, [doc?.id, inPreview]);

  // Custom context menu with spelling suggestions (native app only —
  // WebView2's default menu has none). With spellcheck off, or in the
  // browser, the default menu is left alone.
  const onContextMenu = (e: React.MouseEvent) => {
    const view = editorRef.current;
    if (!view || !spellAvailable() || !spellcheck) return;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    let word: ContextWord | null = null;
    if (pos !== null) {
      const range = view.state.wordAt(pos);
      if (range) {
        const text = view.state.sliceDoc(range.from, range.to);
        // Only spellcheck things that look like words.
        if (text.length <= 64 && /\p{L}/u.test(text)) {
          word = { from: range.from, to: range.to, text };
        }
      }
      // Native feel: clicking outside the selection moves the caret there.
      const sel = view.state.selection.main;
      if (sel.empty || pos < sel.from || pos > sel.to) {
        view.dispatch({ selection: { anchor: pos } });
      }
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, word });
  };

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      search(),
      EditorView.lineWrapping,
      // Native (WebView2/browser) spellcheck on the contenteditable surface.
      // autocorrect/autocapitalize stay off so prose isn't rewritten silently.
      EditorView.contentAttributes.of({
        spellcheck: spellcheck ? "true" : "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      // Selection word/char counts for the status bar.
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const { state } = update;
        let words = 0;
        let chars = 0;
        for (const range of state.selection.ranges) {
          if (range.empty) continue;
          const text = state.sliceDoc(range.from, range.to);
          chars += text.length;
          const trimmed = text.trim();
          if (trimmed) words += trimmed.split(/\s+/).length;
        }
        useSelection.getState().set(chars > 0 ? { words, chars } : null);
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "var(--editor-font-size)",
          backgroundColor: "var(--bg)",
        },
        ".cm-scroller": {
          fontFamily: "var(--font-editor)",
          lineHeight: "1.7",
        },
        ".cm-content": {
          caretColor: "var(--accent)",
          color: "var(--text)",
          // Readable centered column (~70 chars); em-based so it tracks zoom.
          maxWidth: "var(--editor-measure)",
          margin: "0 auto",
          padding: "24px 28px 80px 28px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--bg)",
          color: "var(--text-dim)",
          borderRight: "1px solid var(--border-soft)",
          padding: "24px 0 80px 8px",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          minWidth: "30px",
          padding: "0 8px 0 2px",
        },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: "var(--accent-soft) !important",
        },
        "&.cm-focused": { outline: "none" },
      }),
    ],
    [spellcheck]
  );

  // Keep the shared bus pointing at the live editor (onCreateEditor only
  // fires on mount, not on tab switches) and focus it when it's visible.
  useEffect(() => {
    if (inPreview) {
      editorViewBus.set(null);
      useSelection.getState().set(null);
      return;
    }
    if (editorRef.current) {
      editorViewBus.set(editorRef.current);
      editorRef.current.focus();
    }
  }, [doc?.id, inPreview]);

  // Clear the bus only when the editor area unmounts entirely.
  useEffect(
    () => () => {
      editorViewBus.set(null);
      useSelection.getState().set(null);
    },
    []
  );

  if (!doc) {
    return (
      <div className="editor-empty">
        <p>No document open.</p>
        <p className="editor-empty__hint">
          Create a new one from the Explorer, or open the Start Menu.
        </p>
      </div>
    );
  }

  if (inPreview) {
    return <MarkdownPreview doc={doc} />;
  }

  return (
    <div className="editor-wrap" onContextMenu={onContextMenu}>
      {ctxMenu && editorRef.current && (
        <EditorContextMenu
          view={editorRef.current}
          x={ctxMenu.x}
          y={ctxMenu.y}
          word={ctxMenu.word}
          onClose={() => setCtxMenu(null)}
        />
      )}
      <CodeMirror
        value={doc.content}
        onChange={(v) => setContent(doc.id, v)}
        theme={theme === "dark" ? githubDark : githubLight}
        extensions={extensions}
        height="100%"
        onCreateEditor={(view) => {
          editorRef.current = view;
          editorViewBus.set(view);
        }}
        basicSetup={{
          lineNumbers: doc.language === "markdown",
          highlightActiveLineGutter: false,
          foldGutter: false,
          highlightActiveLine: false,
          autocompletion: false,
          searchKeymap: false,
        }}
      />
    </div>
  );
}
