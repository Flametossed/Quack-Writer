import { useEffect } from "react";
import { FileExplorer } from "./FileExplorer";
import { Tabs } from "./Tabs";
import { MarkdownEditor } from "./MarkdownEditor";
import { FormatBar } from "./FormatBar";
import { StatusBar } from "./StatusBar";
import { useDocs, makeDoc } from "../store/docs";
import { useRecents } from "../store/recents";
import { useSaveStore } from "../store/save";
import { saveFile } from "../lib/fileIo";
import "./EditorView.css";

export function EditorView() {
  const activeId = useDocs((s) => s.activeId);
  const doc = useDocs((s) =>
    s.docs.find((d) => d.id === s.activeId)
  );
  const rename = useDocs((s) => s.rename);
  const addRecent = useRecents((s) => s.add);
  const setSave = useSaveStore((s) => s.set);

  // Debounced auto-save for documents that have a path.
  useEffect(() => {
    if (!doc || !doc.path) return;
    if (doc.content === doc.savedContent) return;
    const t = setTimeout(async () => {
      try {
        setSave("saving");
        await saveFile(doc.path, doc.content, doc.name);
        useDocs.setState((s) => ({
          docs: s.docs.map((d) =>
            d.id === doc.id ? { ...d, savedContent: d.content } : d
          ),
        }));
        setSave("saved");
        setTimeout(() => setSave("idle"), 1200);
      } catch {
        setSave("error");
      }
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.content, doc?.path, doc?.savedContent]);

  // ⌘/Ctrl+S to save, Ctrl+F handled by CodeMirror search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      }
    }
    async function doSave() {
      const d = useDocs.getState().docs.find((x) => x.id === useDocs.getState().activeId);
      if (!d) return;
      try {
        setSave("saving");
        const res = await saveFile(d.path, d.content, d.name);
        if (res) {
          if (res.path !== d.path) {
            rename(d.id, res.name, res.path);
            addRecent(res.path, res.name);
          } else if (d.path) {
            addRecent(d.path, res.name);
          }
          useDocs.setState((s) => ({
            docs: s.docs.map((x) =>
              x.id === d.id ? { ...x, savedContent: x.content } : x
            ),
          }));
          setSave("saved");
          setTimeout(() => setSave("idle"), 1200);
        }
      } catch {
        setSave("error");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="editor-view">
      <FileExplorer />
      <div className="editor-view__main">
        <Tabs />
        <div className="editor-view__body">
          <MarkdownEditor />
          <FormatBar />
        </div>
        <StatusBar />
      </div>
    </div>
  );
}