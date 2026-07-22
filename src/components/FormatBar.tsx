import { useDocs } from "../store/docs";
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Strikethrough,
  Heading,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import "./FormatBar.css";

// Wrap/insert helpers that operate on a textarea-like selection model.
// We don't have direct access to the CodeMirror selection here cleanly, so we
// apply edits by manipulating doc content and tracking an approximate cursor.
// To keep the implementation robust, we read the selection directly from the
// CodeMirror instance via a shared singleton set by MarkdownEditor.
import { editorViewBus } from "../lib/editorViewBus";

type Wrap = { before: string; after: string; placeholder?: string };
type Insert = { text: string };

function applyEdit(edit: Wrap | Insert, block = false) {
  const view = editorViewBus.get();
  if (!view) return;
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);
  if ("before" in edit) {
    const inner = selected || edit.placeholder || "";
    const text = block ? `${edit.before}${inner}${edit.after}` : `${edit.before}${inner}${edit.after}`;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: {
        anchor: sel.from + edit.before.length,
        head: sel.from + edit.before.length + inner.length,
      },
    });
  } else {
    const insert = (block ? "\n" : "") + edit.text;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + insert.length },
    });
  }
  view.focus();
}

function linePrefixEdit(prefix: string) {
  const view = editorViewBus.get();
  if (!view) return;
  const sel = view.state.selection.main;
  const lineFrom = view.state.doc.lineAt(sel.from).from;
  const insert = prefix;
  view.dispatch({
    changes: { from: lineFrom, insert },
    selection: { anchor: lineFrom + insert.length },
  });
  view.focus();
}

export function FormatBar() {
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const ref = useRef<HTMLDivElement>(null);
  void ref;

  const disabled = !doc;

  const Btn = ({
    label,
    onClick,
    children,
    disabled: d,
  }: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    disabled?: boolean;
  }) => (
    <button
      className="fmt-btn"
      title={label}
      onClick={onClick}
      disabled={d}
    >
      {children}
    </button>
  );

  return (
    <aside className="formatbar" ref={ref}>
      <div className="formatbar__section">
        <div className="formatbar__label">Headings</div>
        <Btn label="Heading 1" onClick={() => linePrefixEdit("# ")} disabled={disabled}>
          <Heading1 size={16} />
        </Btn>
        <Btn label="Heading 2" onClick={() => linePrefixEdit("## ")} disabled={disabled}>
          <Heading2 size={16} />
        </Btn>
        <Btn label="Heading 3" onClick={() => linePrefixEdit("### ")} disabled={disabled}>
          <Heading3 size={16} />
        </Btn>
      </div>

      <div className="formatbar__section">
        <div className="formatbar__label">Inline</div>
        <Btn
          label="Bold"
          onClick={() => applyEdit({ before: "**", after: "**", placeholder: "bold" })}
          disabled={disabled}
        >
          <Bold size={16} />
        </Btn>
        <Btn
          label="Italic"
          onClick={() => applyEdit({ before: "*", after: "*", placeholder: "italic" })}
          disabled={disabled}
        >
          <Italic size={16} />
        </Btn>
        <Btn
          label="Strikethrough"
          onClick={() => applyEdit({ before: "~~", after: "~~", placeholder: "text" })}
          disabled={disabled}
        >
          <Strikethrough size={16} />
        </Btn>
        <Btn
          label="Inline code"
          onClick={() => applyEdit({ before: "`", after: "`", placeholder: "code" })}
          disabled={disabled}
        >
          <Code size={16} />
        </Btn>
        <Btn
          label="Link"
          onClick={() => applyEdit({ before: "[", after: "](url)", placeholder: "text" })}
          disabled={disabled}
        >
          <LinkIcon size={16} />
        </Btn>
      </div>

      <div className="formatbar__section">
        <div className="formatbar__label">Blocks</div>
        <Btn label="Quote" onClick={() => linePrefixEdit("> ")} disabled={disabled}>
          <Quote size={16} />
        </Btn>
        <Btn label="Bullet list" onClick={() => linePrefixEdit("- ")} disabled={disabled}>
          <List size={16} />
        </Btn>
        <Btn label="Numbered list" onClick={() => linePrefixEdit("1. ")} disabled={disabled}>
          <ListOrdered size={16} />
        </Btn>
        <Btn
          label="Code block"
          onClick={() => applyEdit({ before: "```\n", after: "\n```", placeholder: "code" }, true)}
          disabled={disabled}
        >
          <Heading size={16} />
        </Btn>
      </div>

      <div className="formatbar__section">
        <div className="formatbar__label">Font</div>
        <select
          className="fmt-select"
          defaultValue="system"
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            const families: Record<string, string> = {
              system: "var(--font-editor)",
              serif: "Georgia, 'Times New Roman', serif",
              mono: "var(--font-mono)",
              sans: "-apple-system, 'Segoe UI', sans-serif",
            };
            document.documentElement.style.setProperty(
              "--font-editor",
              families[v] ?? families.system
            );
          }}
        >
          <option value="system">System</option>
          <option value="serif">Serif</option>
          <option value="sans">Sans</option>
          <option value="mono">Mono</option>
        </select>
      </div>
    </aside>
  );
}