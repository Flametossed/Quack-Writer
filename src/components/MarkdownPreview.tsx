import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useDocs, type Doc } from "../store/docs";
import "./MarkdownPreview.css";

marked.use({ gfm: true, breaks: true });

export function MarkdownPreview({ doc }: { doc: Doc }) {
  const setView = useDocs((s) => s.setView);

  const html = useMemo(() => {
    const raw = marked.parse(doc.content, { async: false });
    return DOMPurify.sanitize(raw);
  }, [doc.content]);

  return (
    <div
      className="md-preview"
      onDoubleClick={() => setView(doc.id, "source")}
      title="Double-click to edit"
    >
      {doc.content.trim() === "" ? (
        <p className="md-preview__empty">
          Nothing to preview yet — double-click (or press ⌘/Ctrl+E) to start
          writing.
        </p>
      ) : (
        <div
          className="md-preview__content"
          // Sanitized above with DOMPurify.
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            // Keep links from navigating the app window.
            const a = (e.target as HTMLElement).closest("a");
            if (a) e.preventDefault();
          }}
        />
      )}
    </div>
  );
}
