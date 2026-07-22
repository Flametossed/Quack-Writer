import { useEffect } from "react";
import { useDocs } from "../store/docs";
import { flushDirtyDocs, isDirty } from "./docActions";
import { confirmDialog, platform } from "./fileIo";

/**
 * App-level guards against losing work — mounted once in App so they stay
 * active on every screen, including the Start Menu:
 * - saves all dirty pathed docs when the window loses focus
 * - flushes + confirms discard of unsaved docs when the window closes
 */
export function useCloseGuard() {
  useEffect(() => {
    const onBlur = () => void flushDirtyDocs();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    if (!platform.isTauri) {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        const hasUnsaved = useDocs
          .getState()
          .docs.some((d) => isDirty(d) && (d.path || d.content.trim() !== ""));
        if (hasUnsaved) e.preventDefault();
      };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const fn = await getCurrentWindow().onCloseRequested(async (event) => {
        await flushDirtyDocs();
        // Anything still dirty is either a never-saved scratch doc or a doc
        // whose save just failed — both would lose content on close.
        const atRisk = useDocs
          .getState()
          .docs.filter(
            (d) => isDirty(d) && (d.path !== null || d.content.trim() !== "")
          );
        if (atRisk.length > 0) {
          const label =
            atRisk.length === 1
              ? `"${atRisk[0].name}" has unsaved changes.`
              : `${atRisk.length} documents have unsaved changes.`;
          const discard = await confirmDialog(
            "Quit without saving?",
            `${label} Unsaved content will be lost.`
          );
          if (!discard) event.preventDefault();
        }
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
