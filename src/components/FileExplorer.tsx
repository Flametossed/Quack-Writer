import { useDocs } from "../store/docs";
import { useRecents } from "../store/recents";
import { makeDoc } from "../store/docs";
import { openFile } from "../lib/fileIo";
import {
  FileText,
  FilePlus,
  FolderOpen,
  ChevronRight,
  Search,
} from "lucide-react";
import { useState } from "react";
import "./FileExplorer.css";

export function FileExplorer() {
  const docs = useDocs((s) => s.docs);
  const activeId = useDocs((s) => s.activeId);
  const setActive = useDocs((s) => s.setActive);
  const openDoc = useDocs((s) => s.openDoc);
  const addRecent = useRecents((s) => s.add);
  const [query, setQuery] = useState("");

  async function handleNew() {
    const doc = makeDoc("Untitled.md", "");
    openDoc(doc);
  }

  async function handleOpen() {
    const res = await openFile();
    if (!res) return;
    addRecent(res.path, res.name);
    const doc = makeDoc(res.name, res.content, res.path);
    openDoc(doc);
  }

  const filtered = docs.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <aside className="explorer">
      <div className="explorer__head">
        <span className="explorer__title">Explorer</span>
        <div className="explorer__actions">
          <button
            className="icon-btn"
            title="New document"
            onClick={handleNew}
          >
            <FilePlus size={15} />
          </button>
          <button
            className="icon-btn"
            title="Open file"
            onClick={handleOpen}
          >
            <FolderOpen size={15} />
          </button>
        </div>
      </div>

      <div className="explorer__search">
        <Search size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter open documents…"
          spellCheck={false}
        />
      </div>

      <div className="explorer__section">
        <button className="explorer__group">
          <ChevronRight size={13} />
          <span>Open Documents</span>
          <span className="explorer__count">{docs.length}</span>
        </button>

        <ul className="explorer__list">
          {filtered.length === 0 && (
            <li className="explorer__empty">
              {docs.length === 0 ? "No open documents" : "No matches"}
            </li>
          )}
          {filtered.map((d) => (
            <li
              key={d.id}
              className={
                "explorer__item" +
                (d.id === activeId ? " is-active" : "") +
                (d.content !== d.savedContent ? " is-dirty" : "")
              }
              onClick={() => setActive(d.id)}
              title={d.path ?? d.name}
            >
              <FileText size={14} />
              <span className="explorer__name">{d.name}</span>
              {d.content !== d.savedContent && (
                <span className="explorer__dot" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}