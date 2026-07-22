import { useDocs } from "../store/docs";
import {
  useFont,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  PRESETS,
  type EditorFont,
  type CustomFont,
} from "../store/font";
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
  SquareCode,
  Plus,
  Upload,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import "./FormatBar.css";

// Formatting reaches the active CodeMirror view through a shared singleton
// set by MarkdownEditor (see lib/editorViewBus).
import { editorViewBus } from "../lib/editorViewBus";

type Wrap = { before: string; after: string; placeholder?: string };

/** Wrap the selection in markers; unwrap when it is already wrapped. */
function applyWrap(edit: Wrap) {
  const view = editorViewBus.get();
  if (!view) return;
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);

  const alreadyWrapped =
    selected.length >= edit.before.length + edit.after.length &&
    selected.startsWith(edit.before) &&
    selected.endsWith(edit.after);

  if (alreadyWrapped) {
    const inner = selected.slice(
      edit.before.length,
      selected.length - edit.after.length
    );
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: inner },
      selection: { anchor: sel.from, head: sel.from + inner.length },
    });
  } else {
    const inner = selected || edit.placeholder || "";
    view.dispatch({
      changes: {
        from: sel.from,
        to: sel.to,
        insert: `${edit.before}${inner}${edit.after}`,
      },
      selection: {
        anchor: sel.from + edit.before.length,
        head: sel.from + edit.before.length + inner.length,
      },
    });
  }
  view.focus();
}

type LineKind = "heading" | "quote" | "bullet" | "ordered";

const FAMILY_RE: Record<LineKind, RegExp> = {
  heading: /^#{1,6}\s+/,
  quote: /^>\s?/,
  bullet: /^(?:[-*+]|\d+[.)])\s+/,
  ordered: /^(?:[-*+]|\d+[.)])\s+/,
};

const PRESENT_RE: Record<Exclude<LineKind, "heading">, RegExp> = {
  quote: /^>\s?/,
  bullet: /^[-*+]\s+/,
  ordered: /^\d+[.)]\s+/,
};

/**
 * Toggle a line prefix over every selected line.
 * Clicking H2 on a `# ` line switches it; clicking again removes it.
 */
function toggleLinePrefix(kind: LineKind, headingLevel = 1) {
  const view = editorViewBus.get();
  if (!view) return;
  const { state } = view;
  const sel = state.selection.main;
  const firstLine = state.doc.lineAt(sel.from).number;
  const lastLine = state.doc.lineAt(sel.to).number;

  const lines = [];
  for (let n = firstLine; n <= lastLine; n++) {
    const line = state.doc.line(n);
    // Skip blank lines in multi-line selections.
    if (line.text.trim() === "" && firstLine !== lastLine) continue;
    lines.push(line);
  }
  if (lines.length === 0) return;

  const desiredFor = (index: number) =>
    kind === "heading"
      ? "#".repeat(headingLevel) + " "
      : kind === "ordered"
        ? `${index + 1}. `
        : kind === "bullet"
          ? "- "
          : "> ";

  const isDesired = (text: string) =>
    kind === "heading"
      ? text.startsWith("#".repeat(headingLevel) + " ") &&
        text[headingLevel] !== "#"
      : PRESENT_RE[kind].test(text);

  const removeAll = lines.every((l) => isDesired(l.text));
  const changes = lines.map((line, i) => {
    const match = line.text.match(FAMILY_RE[kind]);
    const matchedLen = match ? match[0].length : 0;
    return {
      from: line.from,
      to: line.from + matchedLen,
      insert: removeAll ? "" : desiredFor(i),
    };
  });

  // Map the selection explicitly so a caret at the start of a line lands
  // after an inserted marker instead of before it. Preserve the direction of
  // non-empty selections and keep the new Markdown markers outside the range.
  const changeSet = state.changes(changes);
  const forward = sel.anchor <= sel.head;
  const anchorAssoc = sel.empty ? 1 : forward ? 1 : -1;
  const headAssoc = sel.empty ? 1 : forward ? -1 : 1;

  view.dispatch({
    changes: changeSet,
    selection: {
      anchor: changeSet.mapPos(sel.anchor, anchorAssoc),
      head: changeSet.mapPos(sel.head, headAssoc),
    },
    scrollIntoView: true,
  });
  view.focus();
}

export function FormatBar() {
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const font = useFont((s) => s.font);
  const setFont = useFont((s) => s.set);
  const size = useFont((s) => s.size);
  const bumpSize = useFont((s) => s.bumpSize);
  const resetSize = useFont((s) => s.resetSize);
  const customFonts = useFont((s) => s.customFonts);
  const addNamedFamily = useFont((s) => s.addNamedFamily);
  const addFileFont = useFont((s) => s.addFileFont);
  const removeCustom = useFont((s) => s.removeCustom);

  const [newLabel, setNewLabel] = useState("");
  const [newFamily, setNewFamily] = useState("");
  const [importing, setImporting] = useState(false);

  // Formatting edits the markdown source, so it's off while previewing.
  const disabled = !doc || (doc.language === "markdown" && doc.view === "preview");

  const Btn = ({
    label,
    shortLabel,
    onClick,
    children,
    disabled: d,
  }: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
    children: ReactNode;
    disabled?: boolean;
  }) => (
    <button
      className="fmt-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={d}
    >
      <span className="fmt-btn__icon" aria-hidden="true">
        {children}
      </span>
      <span className="fmt-btn__label">{shortLabel ?? label}</span>
    </button>
  );

  return (
    <aside className="formatbar" aria-label="Formatting tools">
      <div className="formatbar__header">
        <span className="formatbar__title">Formatting</span>
        <span className="formatbar__badge">
          {doc?.language === "markdown" ? "Markdown" : "Text"}
        </span>
      </div>

      {doc?.language === "markdown" && doc.view === "preview" && (
        <p className="formatbar__notice">Switch to source mode to format text.</p>
      )}

      <div className="formatbar__section" role="group" aria-labelledby="fmt-headings">
        <div className="formatbar__label" id="fmt-headings">Headings</div>
        <div className="formatbar__grid">
          <Btn
            label="Heading 1"
            shortLabel="H1"
            onClick={() => toggleLinePrefix("heading", 1)}
            disabled={disabled}
          >
            <Heading1 size={16} />
          </Btn>
          <Btn
            label="Heading 2"
            shortLabel="H2"
            onClick={() => toggleLinePrefix("heading", 2)}
            disabled={disabled}
          >
            <Heading2 size={16} />
          </Btn>
          <Btn
            label="Heading 3"
            shortLabel="H3"
            onClick={() => toggleLinePrefix("heading", 3)}
            disabled={disabled}
          >
            <Heading3 size={16} />
          </Btn>
        </div>
      </div>

      <div className="formatbar__section" role="group" aria-labelledby="fmt-inline">
        <div className="formatbar__label" id="fmt-inline">Inline</div>
        <div className="formatbar__grid">
          <Btn
            label="Bold"
            onClick={() => applyWrap({ before: "**", after: "**", placeholder: "bold" })}
            disabled={disabled}
          >
            <Bold size={16} />
          </Btn>
          <Btn
            label="Italic"
            onClick={() => applyWrap({ before: "*", after: "*", placeholder: "italic" })}
            disabled={disabled}
          >
            <Italic size={16} />
          </Btn>
          <Btn
            label="Strikethrough"
            shortLabel="Strike"
            onClick={() => applyWrap({ before: "~~", after: "~~", placeholder: "text" })}
            disabled={disabled}
          >
            <Strikethrough size={16} />
          </Btn>
          <Btn
            label="Inline code"
            shortLabel="Code"
            onClick={() => applyWrap({ before: "`", after: "`", placeholder: "code" })}
            disabled={disabled}
          >
            <Code size={16} />
          </Btn>
          <Btn
            label="Link"
            onClick={() => applyWrap({ before: "[", after: "](url)", placeholder: "text" })}
            disabled={disabled}
          >
            <LinkIcon size={16} />
          </Btn>
        </div>
      </div>

      <div className="formatbar__section" role="group" aria-labelledby="fmt-blocks">
        <div className="formatbar__label" id="fmt-blocks">Blocks</div>
        <div className="formatbar__grid">
          <Btn label="Quote" onClick={() => toggleLinePrefix("quote")} disabled={disabled}>
            <Quote size={16} />
          </Btn>
          <Btn
            label="Bullet list"
            shortLabel="Bullets"
            onClick={() => toggleLinePrefix("bullet")}
            disabled={disabled}
          >
            <List size={16} />
          </Btn>
          <Btn
            label="Numbered list"
            shortLabel="Numbers"
            onClick={() => toggleLinePrefix("ordered")}
            disabled={disabled}
          >
            <ListOrdered size={16} />
          </Btn>
          <Btn
            label="Code block"
            onClick={() => applyWrap({ before: "```\n", after: "\n```", placeholder: "code" })}
            disabled={disabled}
          >
            <SquareCode size={16} />
          </Btn>
        </div>
      </div>

      <div className="formatbar__section" role="group" aria-labelledby="fmt-font">
        <div className="formatbar__label" id="fmt-font">Editor font</div>
        <select
          className="fmt-select"
          aria-label="Editor font"
          value={font}
          disabled={disabled}
          onChange={(e) => setFont(e.target.value as EditorFont)}
        >
          <optgroup label="Built-in">
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </optgroup>
          {customFonts.length > 0 && (
            <optgroup label="Added by you">
              {customFonts.map((c) => {
                const value = `custom:${c.id}`;
                const unavailable = c.source === "file" && !c.loaded;
                return (
                  <option key={c.id} value={value} disabled={unavailable}>
                    {c.label}{unavailable ? " (unavailable)" : ""}
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>

        {(() => {
          const active: CustomFont | undefined = customFonts.find(
            (c) => `custom:${c.id}` === font
          );
          return active ? (
            <button
              type="button"
              className="fmt-font__remove"
              onClick={() => void removeCustom(active.id)}
              title={`Remove "${active.label}"`}
            >
              <Trash2 size={12} /> Remove "{active.label}"
            </button>
          ) : null;
        })()}

        <div className="fmt-addfont" role="group" aria-label="Add font by family name">
          <input
            className="fmt-addfont__input"
            type="text"
            placeholder="Family name, e.g. Comic Sans MS"
            value={newFamily}
            onChange={(e) => setNewFamily(e.target.value)}
          />
          <input
            className="fmt-addfont__input"
            type="text"
            placeholder="Display label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            type="button"
            className="fmt-addfont__btn"
            disabled={!newFamily.trim()}
            onClick={() => {
              addNamedFamily(newLabel.trim() || newFamily, newFamily);
              setNewLabel("");
              setNewFamily("");
            }}
          >
            <Plus size={12} /> Add family
          </button>
          <button
            type="button"
            className="fmt-addfont__btn fmt-addfont__btn--full"
            disabled={importing}
            onClick={async () => {
              setImporting(true);
              try {
                await addFileFont();
              } finally {
                setImporting(false);
              }
            }}
          >
            <Upload size={12} /> {importing ? "Importing…" : "Import font file…"}
          </button>
        </div>
        {/* Text size also applies in preview, so it is never disabled. */}
        <div className="fmt-size" role="group" aria-label="Text size">
          <button
            type="button"
            className="fmt-size__btn"
            title="Smaller text (Ctrl+− or Ctrl+scroll)"
            aria-label="Decrease text size"
            disabled={size <= MIN_FONT_SIZE}
            onClick={() => bumpSize(-1)}
          >
            A−
          </button>
          <button
            type="button"
            className="fmt-size__value"
            title={
              size === DEFAULT_FONT_SIZE
                ? "Text size"
                : "Reset text size (Ctrl+0)"
            }
            aria-label="Reset text size"
            disabled={size === DEFAULT_FONT_SIZE}
            onClick={resetSize}
          >
            {size}px
          </button>
          <button
            type="button"
            className="fmt-size__btn"
            title="Larger text (Ctrl+= or Ctrl+scroll)"
            aria-label="Increase text size"
            disabled={size >= MAX_FONT_SIZE}
            onClick={() => bumpSize(1)}
          >
            A+
          </button>
        </div>
      </div>
    </aside>
  );
}
