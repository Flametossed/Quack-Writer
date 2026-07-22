import { DuckLogo } from "./DuckLogo";
import { useRecents } from "../store/recents";
import { useDocs, makeDoc } from "../store/docs";
import { openFile } from "../lib/fileIo";
import { FileText, FilePlus, FolderOpen, Clock } from "lucide-react";
import "./StartMenu.css";

export function StartMenu({ onOpen }: { onOpen: () => void }) {
  const recents = useRecents((s) => s.recents);
  const removeRecent = useRecents((s) => s.remove);
  const addRecent = useRecents((s) => s.add);
  const openDoc = useDocs((s) => s.openDoc);

  async function handleNew() {
    const doc = makeDoc("Untitled.md", "");
    openDoc(doc);
    onOpen();
  }

  async function handleOpen() {
    const res = await openFile();
    if (!res) return;
    addRecent(res.path, res.name);
    const doc = makeDoc(res.name, res.content, res.path);
    openDoc(doc);
    onOpen();
  }

  async function handleRecent(path: string, name: string) {
    const isTauri = "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = (await invoke("read_text_file", { path })) as string;
        const doc = makeDoc(name, content, path);
        openDoc(doc);
        addRecent(path, name);
        onOpen();
        return;
      } catch {
        removeRecent(path);
      }
    }
    await handleOpen();
  }

  return (
    <div className="start">
      <div className="start__card">
        <div className="start__logo">
          <DuckLogo size={84} />
        </div>
        <h1 className="start__title">Quack Writer</h1>
        <p className="start__subtitle">A focused place for your words.</p>

        <div className="start__actions">
          <button className="btn btn--primary" onClick={handleNew}>
            <FilePlus size={18} /> New Document
          </button>
          <button className="btn" onClick={handleOpen}>
            <FolderOpen size={18} /> Open…
          </button>
        </div>

        <div className="start__recents">
          <div className="start__recents-head">
            <Clock size={14} /> Recent Documents
          </div>
          {recents.length === 0 ? (
            <div className="start__empty">No recent documents yet.</div>
          ) : (
            <ul className="recents-list">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    className="recents-item"
                    onClick={() => handleRecent(r.path, r.name)}
                    title={r.path}
                  >
                    <FileText size={16} />
                    <span className="recents-item__name">{r.name}</span>
                    <span className="recents-item__path">{r.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

