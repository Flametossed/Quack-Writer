import { useMemo, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { search, searchKeymap } from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { useDocs } from "../store/docs";
import { useTheme } from "../store/theme";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { editorViewBus } from "../lib/editorViewBus";
import "./MarkdownEditor.css";

export function MarkdownEditor() {
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const setContent = useDocs((s) => s.setContent);
  const theme = useTheme((s) => s.theme);
  const editorRef = useRef<EditorView | null>(null);

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      search({ top: true }),
      keymap.of(searchKeymap),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "15px",
        },
        ".cm-scroller": {
          fontFamily: "var(--font-editor)",
          lineHeight: "1.7",
          padding: "24px 32px 80px",
        },
        ".cm-content": { caretColor: "var(--accent)" },
        ".cm-gutters": { display: "none" },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: "var(--accent-soft) !important",
        },
        "&.cm-focused": { outline: "none" },
      }),
    ],
    []
  );

  // Focus editor when switching tabs.
  useEffect(() => {
    editorRef.current?.focus();
    return () => {
      editorViewBus.set(null);
    };
  }, [doc?.id]);

  if (!doc) {
    return (
      <div className="editor-empty">
        <p>No document open.</p>
        <p className="editor-empty__hint">
          Create a new one from the Explorer,or open the Start Menu.
        </p>
      </div>
    );
  }

  return (
    <div className="editor-wrap">
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
          lineNumbers: false,
          highlightActiveLineGutter: false,
          foldGutter: false,
          highlightActiveLine: false,
          autocompletion: false,
        }}
      />
    </div>
  );
}