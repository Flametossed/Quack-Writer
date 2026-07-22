import { useEffect, useRef } from "react";
import { FileExplorer } from "./FileExplorer";
import { Tabs } from "./Tabs";
import { MarkdownEditor } from "./MarkdownEditor";
import { FormatBar } from "./FormatBar";
import { StatusBar } from "./StatusBar";
import { AppMenuBar } from "./AppMenuBar";
import { useDocs, makeDoc } from "../store/docs";
import { useFont } from "../store/font";
import { useUi } from "../store/ui";
import { saveDoc, saveActiveDoc, isDirty } from "../lib/docActions";
import "./EditorView.css";

export function EditorView() {
  const activeId = useDocs((s) => s.activeId);
  const explorerVisible = useUi((s) => s.explorerVisible);
  const formatBarVisible = useUi((s) => s.formatBarVisible);
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const docId = doc?.id;
  const docPath = doc?.path;
  const content = doc?.content;
  const savedContent = doc?.savedContent;

  // Debounced auto-save for the active document (only once it has a path).
  useEffect(() => {
    if (!docId || !docPath) return;
    if (content === savedContent) return;
    const t = setTimeout(() => void saveDoc(docId), 800);
    return () => clearTimeout(t);
  }, [docId, docPath, content, savedContent]);

  // Flush the previous doc when switching tabs so a pending debounce isn't lost.
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = activeId;
    if (prev && prev !== activeId) {
      const d = useDocs.getState().getById(prev);
      if (d?.path && isDirty(d)) void saveDoc(prev);
    }
  }, [activeId]);

  // ⌘/Ctrl+S saves and ⌘/Ctrl+E toggles preview.
  // Ctrl+B / Ctrl+Alt+B toggle the explorer / format sidebars.
  // Ctrl+=/−/0 zoom editor text like Notepad (preventDefault also keeps
  // WebView2 from zooming the whole UI). Ctrl+F is handled by the
  // integrated search field in StatusBar.
  // (Window blur/close protection lives in useCloseGuard, mounted in App.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        const ui = useUi.getState();
        if (e.altKey) ui.toggleFormatBar();
        else ui.toggleExplorer();
      } else if (key === "s") {
        e.preventDefault();
        void saveActiveDoc();
      } else if (key === "e") {
        e.preventDefault();
        const { active, setView } = useDocs.getState();
        const d = active();
        if (d?.language === "markdown") {
          setView(d.id, d.view === "preview" ? "source" : "preview");
        }
      } else if (key === "=" || key === "+") {
        e.preventDefault();
        useFont.getState().bumpSize(1);
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        useFont.getState().bumpSize(-1);
      } else if (key === "0") {
        e.preventDefault();
        useFont.getState().resetSize();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl+scroll adjusts text size (Notepad behavior); non-passive so the
  // WebView2 page-zoom default can be suppressed.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY !== 0) {
        useFont.getState().bumpSize(e.deltaY < 0 ? 1 : -1);
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Auto-open a scratch doc when none are open (keeps the editor always ready).
  useEffect(() => {
    if (activeId === null) {
      const { docs, openDoc } = useDocs.getState();
      if (docs.length === 0) {
        openDoc(makeDoc("Untitled.md", ""));
      }
    }
  }, [activeId]);

  return (
    <div className="editor-shell">
      <AppMenuBar />
      <div className="editor-view">
        {explorerVisible && <FileExplorer />}
        <div className="editor-view__main">
          <Tabs />
          <div className="editor-view__body">
            <MarkdownEditor />
            {formatBarVisible && <FormatBar />}
          </div>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
