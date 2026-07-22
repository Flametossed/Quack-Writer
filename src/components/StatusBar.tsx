import { useDocs } from "../store/docs";
import { useTheme } from "../store/theme";
import { saveFile } from "../lib/fileIo";
import { useRecents } from "../store/recents";
import { useSaveStore } from "../store/save";
import { useMemo } from "react";
import { Save, Sun, Moon, Search } from "lucide-react";
import "./StatusBar.css";

export function StatusBar() {
  const doc = useDocs((s) => s.docs.find((d) => d.id === s.activeId));
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const addRecent = useRecents((s) => s.add);
  const rename = useDocs((s) => s.rename);
  const setSave = useSaveStore((s) => s.set);

  const stats = useMemo(() => {
    const text = doc?.content ?? "";
    const words = text.trim()
      ? text.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const chars = text.length;
    const lines = text ? text.split("\n").length : 0;
    return { words, chars, lines };
  }, [doc?.content]);

  async function handleSave() {
    if (!doc) return;
    try {
      setSave("saving");
      const res = await saveFile(doc.path, doc.content, doc.name);
      if (res) {
        if (res.path !== doc.path) {
          rename(doc.id, res.name, res.path);
          addRecent(res.path, res.name);
        } else if (doc.path) {
          addRecent(doc.path, res.name);
        }
        useDocs.setState((s) => ({
          docs: s.docs.map((d) =>
            d.id === doc.id ? { ...d, savedContent: d.content } : d
          ),
        }));
        setSave("saved");
        setTimeout(() => setSave("idle"), 1500);
      }
    } catch {
      setSave("error");
    }
  }

  function toggleSearch() {
    const ev = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(ev);
  }

  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        <button
          className="status-btn"
          onClick={handleSave}
          disabled={!doc}
          title="Save (⌘/Ctrl+S)"
        >
          <Save size={13} />
        </button>
        <button
          className="status-btn"
          onClick={toggleSearch}
          disabled={!doc}
          title="Find (⌘/Ctrl+F)"
        >
          <Search size={13} />
        </button>
        {doc && (
          <span className="statusbar__path" title={doc.path ?? "Unsaved"}>
            {doc.path ?? "Unsaved document"}
          </span>
        )}
      </div>

      <div className="statusbar__right">
        {doc && (
          <>
            <span>{stats.words} words</span>
            <span>{stats.chars} chars</span>
            <span>Ln {stats.lines}</span>
          </>
        )}
        <button
          className="status-btn"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </footer>
  );
}