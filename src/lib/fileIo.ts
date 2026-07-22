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
let handleCounter = 0;

function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
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
    } catch {
      return null;
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
      } catch {
        return null;
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