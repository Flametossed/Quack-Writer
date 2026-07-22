import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  FilePlus,
  FolderOpen,
  FolderTree,
  Home,
} from "lucide-react";
import { useDocs, makeDoc } from "../store/docs";
import { useWorkspace } from "../store/workspace";
import { useUi } from "../store/ui";
import { flushDirtyDocs, openFromPicker } from "../lib/docActions";
import "./AppMenuBar.css";

type MenuId = "file" | "view";

export function AppMenuBar() {
  const openDoc = useDocs((state) => state.openDoc);
  const openFolder = useWorkspace((state) => state.openFolder);
  const setScreen = useUi((state) => state.setScreen);
  const explorerVisible = useUi((state) => state.explorerVisible);
  const formatBarVisible = useUi((state) => state.formatBarVisible);
  const spellcheck = useUi((state) => state.spellcheck);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileTriggerRef = useRef<HTMLButtonElement>(null);

  const newDocument = useCallback(
    () => openDoc(makeDoc("Untitled.md", "")),
    [openDoc]
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.altKey && key === "f") {
        event.preventDefault();
        setOpenMenu((open) => (open === "file" ? null : "file"));
        return;
      }
      if (event.altKey && key === "v") {
        event.preventDefault();
        setOpenMenu((open) => (open === "view" ? null : "view"));
        return;
      }
      if (event.key === "Escape" && openMenu) {
        setOpenMenu(null);
        fileTriggerRef.current?.focus();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        newDocument();
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        void openFolder();
      } else if (key === "o") {
        event.preventDefault();
        void openFromPicker();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu, newDocument, openFolder]);

  // Close the dropdown before running the item's action.
  const run = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  const toggle = (id: MenuId) =>
    setOpenMenu((open) => (open === id ? null : id));

  // Hovering across triggers while a menu is open switches menus (native feel).
  const hover = (id: MenuId) =>
    setOpenMenu((open) => (open !== null && open !== id ? id : open));

  const checkItem = (
    label: string,
    checked: boolean,
    onSelect: () => void,
    shortcut?: string
  ) => (
    <button
      type="button"
      className="app-menu__item"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => run(onSelect)}
    >
      <span className="app-menu__check" aria-hidden="true">
        {checked && <Check size={15} />}
      </span>
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  return (
    <header className="app-menu" aria-label="Application menu">
      <button
        type="button"
        className="app-menu__home"
        title="Start Menu"
        aria-label="Go to Start Menu"
        onClick={() => {
          setOpenMenu(null);
          void flushDirtyDocs();
          setScreen("start");
        }}
      >
        <Home size={14} aria-hidden="true" />
      </button>
      <div className="app-menu__group" ref={menuRef}>
        <div className="app-menu__entry">
          <button
            ref={fileTriggerRef}
            type="button"
            className={`app-menu__trigger${openMenu === "file" ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "file"}
            onClick={() => toggle("file")}
            onPointerEnter={() => hover("file")}
          >
            File
          </button>

          {openMenu === "file" && (
            <div className="app-menu__dropdown" role="menu" aria-label="File">
            <button
              type="button"
              className="app-menu__item"
              role="menuitem"
              onClick={() => run(newDocument)}
            >
              <FilePlus size={15} aria-hidden="true" />
              <span>New document</span>
              <kbd>Ctrl+N</kbd>
            </button>
            <button
              type="button"
              className="app-menu__item"
              role="menuitem"
              onClick={() => run(() => void openFromPicker())}
            >
              <FolderOpen size={15} aria-hidden="true" />
              <span>Open file…</span>
              <kbd>Ctrl+O</kbd>
            </button>
              <button
                type="button"
                className="app-menu__item"
                role="menuitem"
                onClick={() => run(() => void openFolder())}
              >
                <FolderTree size={15} aria-hidden="true" />
                <span>Open folder…</span>
                <kbd>Ctrl+Shift+O</kbd>
              </button>
            </div>
          )}
        </div>

        <div className="app-menu__entry">
          <button
            type="button"
            className={`app-menu__trigger${openMenu === "view" ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "view"}
            onClick={() => toggle("view")}
            onPointerEnter={() => hover("view")}
          >
            View
          </button>

          {openMenu === "view" && (
            <div className="app-menu__dropdown" role="menu" aria-label="View">
              {checkItem(
                "Explorer sidebar",
                explorerVisible,
                () => useUi.getState().toggleExplorer(),
                "Ctrl+B"
              )}
              {checkItem(
                "Format sidebar",
                formatBarVisible,
                () => useUi.getState().toggleFormatBar(),
                "Ctrl+Alt+B"
              )}
              {checkItem("Spellcheck", spellcheck, () =>
                useUi.getState().toggleSpellcheck()
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
