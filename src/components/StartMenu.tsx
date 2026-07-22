import { DuckLogo } from "./DuckLogo";
import { useRecents } from "../store/recents";
import { useDocs, makeDoc } from "../store/docs";
import { useSaveStore } from "../store/save";
import { useUi } from "../store/ui";
import { openFromPicker, openRecent } from "../lib/docActions";
import {
  FileText,
  FilePlus,
  FolderOpen,
  Clock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import "./StartMenu.css";

export function StartMenu() {
  const recents = useRecents((s) => s.recents);
  const openDoc = useDocs((s) => s.openDoc);
  const docsCount = useDocs((s) => s.docs.length);
  const setScreen = useUi((s) => s.setScreen);
  const errorMessage = useSaveStore((s) =>
    s.state === "error" ? s.message : null
  );

  function handleNew() {
    openDoc(makeDoc("Untitled.md", ""));
    setScreen("editor");
  }

  async function handleOpen() {
    if (await openFromPicker()) setScreen("editor");
  }

  async function handleRecent(path: string, name: string) {
    if (await openRecent(path, name)) setScreen("editor");
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
          <button className="btn" onClick={() => void handleOpen()}>
            <FolderOpen size={18} /> Open…
          </button>
        </div>

        {docsCount > 0 && (
          <button
            className="start__continue"
            onClick={() => setScreen("editor")}
          >
            Continue editing
            <span className="start__continue-count">
              {docsCount} open document{docsCount === 1 ? "" : "s"}
            </span>
            <ArrowRight size={15} />
          </button>
        )}

        {errorMessage && (
          <div className="start__error" role="alert">
            <AlertTriangle size={14} /> {errorMessage}
          </div>
        )}

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
                    onClick={() => void handleRecent(r.path, r.name)}
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
