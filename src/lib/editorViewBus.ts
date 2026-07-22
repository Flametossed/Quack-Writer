// Tiny shared bus so the FormatBar can reach into the active CodeMirror view
// (set by MarkdownEditor.onCreateEditor) without prop drilling.

import type { EditorView } from "@codemirror/view";

let current: EditorView | null = null;

export const editorViewBus = {
  set(view: EditorView | null) {
    current = view;
  },
  get(): EditorView | null {
    return current;
  },
};