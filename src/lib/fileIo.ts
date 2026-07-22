// Platform-agnostic file IO.
// Uses Tauri primitives when running inside the native shell, otherwise falls
// back to the browser File System Access API so the web dev server still works.

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type FileHandle = {
  path: string;
  name: string;
  content?: string;
};

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// Browser File System Access API helpers (dev-only)
const fsHandles = new Map<string, FileSystemFileHandle>();
const dirHandles = new Map<string, FileSystemDirectoryHandle>();
let handleCounter = 0;

function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/** Extensions surfaced in the Explorer tree (mirrors TEXT_EXTENSIONS in Rust). */
const TEXT_EXTENSIONS = ["md", "markdown", "txt", "log", "json"];

function hasTextExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && ext !== name.toLowerCase() && TEXT_EXTENSIONS.includes(ext);
}

/**
 * Read a file by path — a real path in Tauri, or a registered browser://
 * handle from the web picker / folder tree.
 */
export async function readTextFile(path: string): Promise<string> {
  if (isTauri) {
    return tauriInvoke<string>("read_text_file", { path });
  }
  const handle = fsHandles.get(path);
  if (!handle) throw new Error("File handle is no longer available");
  const file = await handle.getFile();
  return file.text();
}

/** Rename a saved file on disk. Native only; returns the new full path. */
export async function renameFile(
  path: string,
  newName: string
): Promise<string> {
  if (!isTauri) throw new Error("Renaming saved files isn't supported in the browser");
  return tauriInvoke<string>("rename_file", { path, newName });
}

/** Move a workspace file into another folder without overwriting anything. */
export async function moveFile(
  path: string,
  destinationDir: string,
  workspaceRoot: string
): Promise<string> {
  if (isTauri) {
    return tauriInvoke<string>("move_file", {
      path,
      destinationDir,
      workspaceRoot,
    });
  }

  const inWorkspace = (candidate: string) =>
    candidate === workspaceRoot || candidate.startsWith(`${workspaceRoot}/`);
  if (!inWorkspace(path) || !inWorkspace(destinationDir)) {
    throw new Error("Files can only be moved within the open workspace");
  }

  const slash = path.lastIndexOf("/");
  const sourceDirPath = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  if (sourceDirPath === destinationDir) {
    throw new Error("The file is already in this folder");
  }

  const source = fsHandles.get(path);
  const sourceDir = dirHandles.get(sourceDirPath);
  const destination = dirHandles.get(destinationDir);
  if (!source || !sourceDir || !destination) {
    throw new Error("The folder handle is no longer available");
  }

  const destinationEntries = (
    destination as unknown as {
      values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
    }
  ).values();
  for await (const entry of destinationEntries) {
    if (entry.name.toLowerCase() === name.toLowerCase()) {
      throw new Error(`"${name}" already exists in that folder`);
    }
  }

  const writableDestination = destination as FileSystemDirectoryHandle & {
    removeEntry: (name: string) => Promise<void>;
  };
  const writableSource = sourceDir as FileSystemDirectoryHandle & {
    removeEntry: (name: string) => Promise<void>;
  };
  const target = await writableDestination.getFileHandle(name, { create: true });

  try {
    const sourceFile = await source.getFile();
    const writable = await target.createWritable();
    await writable.write(await sourceFile.arrayBuffer());
    await writable.close();
    // Copy first, then remove the original so a failed write never loses it.
    await writableSource.removeEntry(name);
  } catch (error) {
    // The target was created by this operation and did not exist beforehand.
    try {
      await writableDestination.removeEntry(name);
    } catch {
      // Preserve the original error; cleanup failure is secondary.
    }
    throw error;
  }

  const newPath = `${destinationDir}/${name}`;
  fsHandles.delete(path);
  fsHandles.set(newPath, target);
  return newPath;
}

/** Create a new document directly inside a workspace folder. */
export async function createWorkspaceFile(
  destinationDir: string,
  name: string,
  contents: string,
  workspaceRoot: string
): Promise<string> {
  if (isTauri) {
    return tauriInvoke<string>("create_text_file", {
      destinationDir,
      name,
      contents,
      workspaceRoot,
    });
  }

  if (
    (destinationDir !== workspaceRoot &&
      !destinationDir.startsWith(`${workspaceRoot}/`)) ||
    name.includes("/") ||
    name.includes("\\") ||
    !hasTextExtension(name)
  ) {
    throw new Error("Invalid workspace file destination");
  }

  const destination = dirHandles.get(destinationDir);
  if (!destination) throw new Error("The folder handle is no longer available");

  const entries = (
    destination as unknown as {
      values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
    }
  ).values();
  for await (const entry of entries) {
    if (entry.name.toLowerCase() === name.toLowerCase()) {
      throw new Error(`"${name}" already exists in that folder`);
    }
  }

  const writableDestination = destination as FileSystemDirectoryHandle & {
    removeEntry: (name: string) => Promise<void>;
  };
  const target = await writableDestination.getFileHandle(name, { create: true });
  try {
    const writable = await target.createWritable();
    await writable.write(contents);
    await writable.close();
  } catch (error) {
    try {
      await writableDestination.removeEntry(name);
    } catch {
      // Preserve the write error; cleanup failure is secondary.
    }
    throw error;
  }

  const path = `${destinationDir}/${name}`;
  fsHandles.set(path, target);
  return path;
}

/** Create a subfolder in the open workspace and return its full path. */
export async function createWorkspaceFolder(
  parentDir: string,
  name: string,
  workspaceRoot: string
): Promise<string> {
  const cleanName = name.trim();
  if (
    !cleanName ||
    cleanName === "." ||
    cleanName === ".." ||
    cleanName.includes("/") ||
    cleanName.includes("\\")
  ) {
    throw new Error("Invalid folder name");
  }

  if (isTauri) {
    return tauriInvoke<string>("create_folder", {
      parentDir,
      name: cleanName,
      workspaceRoot,
    });
  }

  if (parentDir !== workspaceRoot && !parentDir.startsWith(`${workspaceRoot}/`)) {
    throw new Error("Folders can only be created in the open workspace");
  }
  const parent = dirHandles.get(parentDir);
  if (!parent) throw new Error("The folder handle is no longer available");

  const entries = (
    parent as unknown as {
      values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
    }
  ).values();
  for await (const entry of entries) {
    if (entry.name.toLowerCase() === cleanName.toLowerCase()) {
      throw new Error(`"${cleanName}" already exists in that folder`);
    }
  }

  const handle = await parent.getDirectoryHandle(cleanName, { create: true });
  const path = `${parentDir}/${cleanName}`;
  dirHandles.set(path, handle);
  return path;
}

export type DirEntry = { name: string; path: string; isDir: boolean };

/** Pick a folder to browse in the Explorer tree. */
export async function pickFolder(): Promise<{ path: string; name: string } | null> {
  if (isTauri) {
    const path = await tauriInvoke<string | null>("pick_folder");
    if (!path) return null;
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    return { path, name };
  }
  if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
    try {
      const handle = await (
        window as unknown as {
          showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: "readwrite" });
      const path = `browser-dir://${++handleCounter}/${handle.name}`;
      dirHandles.set(path, handle);
      return { path, name: handle.name };
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
      throw e;
    }
  }
  return null;
}

/** Shallow listing of a folder: subfolders + text-like files, folders first. */
export async function listDir(path: string): Promise<DirEntry[]> {
  if (isTauri) {
    return tauriInvoke<DirEntry[]>("list_dir", { path });
  }
  const dir = dirHandles.get(path);
  if (!dir) throw new Error("Folder handle is no longer available");
  const out: DirEntry[] = [];
  const iter = (
    dir as unknown as {
      values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
    }
  ).values();
  for await (const entry of iter) {
    if (entry.name.startsWith(".")) continue;
    if (entry.kind === "directory") {
      const childPath = `${path}/${entry.name}`;
      dirHandles.set(childPath, entry as FileSystemDirectoryHandle);
      out.push({ name: entry.name, path: childPath, isDir: true });
    } else if (hasTextExtension(entry.name)) {
      const childPath = `${path}/${entry.name}`;
      fsHandles.set(childPath, entry as FileSystemFileHandle);
      out.push({ name: entry.name, path: childPath, isDir: false });
    }
  }
  out.sort(
    (a, b) =>
      Number(b.isDir) - Number(a.isDir) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
  return out;
}

/** Native OK/Cancel confirmation; falls back to window.confirm on the web. */
export async function confirmDialog(
  title: string,
  message: string
): Promise<boolean> {
  if (isTauri) {
    return tauriInvoke<boolean>("ask_confirm", { title, message });
  }
  return window.confirm(`${title}\n\n${message}`);
}

export async function openFile(): Promise<FileHandle | null> {
  if (isTauri) {
    const path = await tauriInvoke<string | null>("pick_file");
    if (!path) return null;
    const name = path.split(/[\\/]/).pop() ?? path;
    const content = await tauriInvoke<string>("read_text_file", { path });
    return { path, name, content };
  }
  if (isFsAccessSupported()) {
    try {
      const [handle] = await (
        window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Text & Markdown",
            accept: {
              "text/plain": [".txt", ".md", ".markdown", ".log", ".json"],
            },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const content = await file.text();
      const path = `browser://${++handleCounter}/${handle.name}`;
      fsHandles.set(path, handle);
      return { path, name: handle.name, content };
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
      throw e;
    }
  }
  return null;
}

export async function saveFile(
  path: string | null,
  contents: string,
  suggestedName?: string
): Promise<FileHandle | null> {
  if (isTauri) {
    if (path) {
      await tauriInvoke<void>("write_text_file", { path, contents });
      return { path, name: path.split(/[\\/]/).pop() ?? path };
    }
    const picked = await tauriInvoke<string | null>("pick_save_path", {
      suggested: suggestedName ?? "Untitled.txt",
    });
    if (!picked) return null;
    await tauriInvoke<void>("write_text_file", {
      path: picked,
      contents,
    });
    return { path: picked, name: picked.split(/[\\/]/).pop() ?? picked };
  }
  if (isFsAccessSupported()) {
    let handle: FileSystemFileHandle | undefined =
      path ? fsHandles.get(path) : undefined;
    if (!handle) {
      try {
        handle = await (
          window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: suggestedName ?? "Untitled.txt",
          types: [
            {
              description: "Text & Markdown",
              accept: { "text/plain": [".txt", ".md", ".markdown"] },
            },
          ],
        });
        const newPath = `browser://${++handleCounter}/${handle.name}`;
        fsHandles.set(newPath, handle);
        path = newPath;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
        throw e;
      }
    }
    const writable = await handle!.createWritable();
    await writable.write(contents);
    await writable.close();
    return { path: path!, name: handle!.name };
  }
  // Last resort: download as a file.
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName ?? "Untitled.txt";
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

export const platform = { isTauri, name: isTauri ? "tauri" : "web" };
