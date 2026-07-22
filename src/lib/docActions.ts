// Single home for open/save/close flows so the Ctrl+S handler, status bar,
// auto-save, tabs and window-close logic all share one implementation.

import { useDocs, makeDoc, type Doc } from "../store/docs";
import { useRecents } from "../store/recents";
import { useSaveStore } from "../store/save";
import {
  openFile,
  saveFile,
  readTextFile,
  renameFile,
  moveFile,
  createWorkspaceFile,
  confirmDialog,
  platform,
} from "./fileIo";

function errMsg(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return fallback;
}

export function isDirty(d: Doc): boolean {
  return d.content !== d.savedContent;
}

/**
 * Save a document (Save As when it has no path yet).
 * Returns true when the document was written, false on cancel/error.
 */
export async function saveDoc(id: string): Promise<boolean> {
  const docs = useDocs.getState();
  const d = docs.getById(id);
  if (!d) return false;
  const status = useSaveStore.getState();
  try {
    status.set("saving");
    const content = d.content; // capture: the user may keep typing during the await
    const res = await saveFile(d.path, content, d.name);
    if (!res) {
      status.set("idle"); // Save As cancelled
      return false;
    }
    if (res.path !== d.path) {
      docs.rename(d.id, res.name, res.path);
    }
    // browser:// pseudo-paths are dead next session — only persist real paths.
    if (platform.isTauri && res.path) {
      useRecents.getState().add(res.path, res.name);
    }
    useDocs.setState((s) => ({
      docs: s.docs.map((x) =>
        x.id === d.id ? { ...x, savedContent: content } : x
      ),
    }));
    status.set("saved");
    setTimeout(() => {
      if (useSaveStore.getState().state === "saved") status.set("idle");
    }, 1500);
    return true;
  } catch (e) {
    status.setError(errMsg(e, "Save failed"));
    return false;
  }
}

/** Save the currently active document. */
export async function saveActiveDoc(): Promise<boolean> {
  const active = useDocs.getState().active();
  return active ? saveDoc(active.id) : false;
}

/** Flush every dirty document that already has a file on disk. */
export async function flushDirtyDocs(): Promise<void> {
  const { docs } = useDocs.getState();
  for (const d of docs) {
    if (d.path && isDirty(d)) await saveDoc(d.id);
  }
}

/**
 * Close a document without losing work: dirty docs with a path are saved
 * first; never-saved scratch docs prompt before discarding.
 */
export async function requestCloseDoc(id: string): Promise<void> {
  const docs = useDocs.getState();
  const d = docs.getById(id);
  if (!d) return;
  if (isDirty(d)) {
    if (d.path) {
      const saved = await saveDoc(id);
      if (!saved) {
        const discard = await confirmDialog(
          "Close without saving?",
          `"${d.name}" could not be saved. Close it anyway and discard the changes?`
        );
        if (!discard) return;
      }
    } else if (d.content.trim() !== "") {
      const discard = await confirmDialog(
        "Discard unsaved document?",
        `"${d.name}" has never been saved. Its content will be lost.`
      );
      if (!discard) return;
    }
  }
  useDocs.getState().closeDoc(id);
}

/** Open a document via the file picker. Returns true when one was opened. */
export async function openFromPicker(): Promise<boolean> {
  try {
    const res = await openFile();
    if (!res) return false; // cancelled
    useDocs.getState().openDoc(makeDoc(res.name, res.content ?? "", res.path));
    if (platform.isTauri) {
      useRecents.getState().add(res.path, res.name);
    }
    return true;
  } catch (e) {
    useSaveStore.getState().setError(errMsg(e, "Couldn't open file"));
    return false;
  }
}

/** Open a file from the Explorer tree (works for native paths and web handles). */
export async function openWorkspaceFile(
  path: string,
  name: string
): Promise<boolean> {
  try {
    const content = await readTextFile(path);
    useDocs.getState().openDoc(makeDoc(name, content, path));
    if (platform.isTauri) {
      useRecents.getState().add(path, name);
    }
    return true;
  } catch (e) {
    useSaveStore.getState().setError(errMsg(e, `Couldn't open "${name}"`));
    return false;
  }
}

/**
 * Rename a document. Scratch docs rename freely; saved docs are renamed on
 * disk (native only). Keeps the old extension if the new name has none.
 */
export async function renameDoc(id: string, rawName: string): Promise<boolean> {
  const docs = useDocs.getState();
  const d = docs.getById(id);
  if (!d) return false;
  let name = rawName.trim();
  if (!name || name === d.name) return false;
  if (!/\.[A-Za-z0-9]+$/.test(name)) {
    const oldExt = /\.[A-Za-z0-9]+$/.exec(d.name)?.[0];
    if (oldExt) name += oldExt;
  }
  if (!d.path) {
    docs.rename(id, name, null);
    return true;
  }
  if (!platform.isTauri) {
    useSaveStore
      .getState()
      .setError("Renaming saved files isn't supported in the browser");
    return false;
  }
  try {
    const newPath = await renameFile(d.path, name);
    docs.rename(id, name, newPath);
    useRecents.getState().remove(d.path);
    useRecents.getState().add(newPath, name);
    return true;
  } catch (e) {
    useSaveStore.getState().setError(errMsg(e, "Rename failed"));
    return false;
  }
}

/**
 * Move a file shown in the workspace tree into another workspace folder.
 * Dirty open documents are saved first, then their tab and recent-file paths
 * are updated to follow the file.
 */
export async function moveWorkspaceFile(
  path: string,
  name: string,
  destinationDir: string,
  workspaceRoot: string
): Promise<boolean> {
  const openDoc = useDocs.getState().docs.find((doc) => doc.path === path);
  if (openDoc && isDirty(openDoc) && !(await saveDoc(openDoc.id))) {
    return false;
  }

  try {
    const recentStore = useRecents.getState();
    const wasRecent = recentStore.recents.some((recent) => recent.path === path);
    const newPath = await moveFile(path, destinationDir, workspaceRoot);

    const liveDoc = useDocs.getState().docs.find((doc) => doc.path === path);
    if (liveDoc) {
      useDocs.getState().rename(liveDoc.id, name, newPath);
    }
    if (platform.isTauri && wasRecent) {
      recentStore.remove(path);
      recentStore.add(newPath, name);
    }
    return true;
  } catch (e) {
    useSaveStore.getState().setError(errMsg(e, `Couldn't move "${name}"`));
    return false;
  }
}

/**
 * Place an item from Open Documents into a workspace folder. Scratch docs are
 * created there; saved docs move there. Web file-picker handles cannot remove
 * their original, so web mode saves the current content into the workspace.
 */
export async function moveOpenDocumentToWorkspace(
  id: string,
  destinationDir: string,
  workspaceRoot: string
): Promise<boolean> {
  const doc = useDocs.getState().getById(id);
  if (!doc) return false;

  const webWorkspacePath =
    !!doc.path &&
    (doc.path === workspaceRoot || doc.path.startsWith(`${workspaceRoot}/`));
  const shouldCreate = !doc.path || (!platform.isTauri && !webWorkspacePath);

  if (shouldCreate) {
    try {
      const content = doc.content;
      const newPath = await createWorkspaceFile(
        destinationDir,
        doc.name,
        content,
        workspaceRoot
      );
      useDocs.getState().rename(doc.id, doc.name, newPath);
      useDocs.setState((state) => ({
        docs: state.docs.map((item) =>
          item.id === doc.id ? { ...item, savedContent: content } : item
        ),
      }));
      if (platform.isTauri) useRecents.getState().add(newPath, doc.name);
      return true;
    } catch (e) {
      useSaveStore
        .getState()
        .setError(errMsg(e, `Couldn't add "${doc.name}" to the workspace`));
      return false;
    }
  }

  if (isDirty(doc) && !(await saveDoc(doc.id))) return false;

  try {
    const oldPath = doc.path!;
    const newPath = await moveFile(oldPath, destinationDir, workspaceRoot);
    useDocs.getState().rename(doc.id, doc.name, newPath);
    if (platform.isTauri) {
      const recents = useRecents.getState();
      recents.remove(oldPath);
      recents.add(newPath, doc.name);
    }
    return true;
  } catch (e) {
    useSaveStore.getState().setError(errMsg(e, `Couldn't move "${doc.name}"`));
    return false;
  }
}

/** Reopen a recent document by path (native only; web falls back to picker). */
export async function openRecent(path: string, name: string): Promise<boolean> {
  if (!platform.isTauri) return openFromPicker();
  try {
    const content = await readTextFile(path);
    useDocs.getState().openDoc(makeDoc(name, content, path));
    useRecents.getState().add(path, name);
    return true;
  } catch {
    useRecents.getState().remove(path);
    useSaveStore
      .getState()
      .setError(`Couldn't open "${name}" — removed from recents`);
    return false;
  }
}
