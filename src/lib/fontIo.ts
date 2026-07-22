// Font file IO and registration.
//
// On the native shell the bytes are copied into the app's per-user data
// folder (managed by the Rust `import_font_file` command) so custom fonts
// survive relaunches. The browser dev mode falls back to an <input type=file>
// and keeps the font in-memory only — per the project's "native first" rule,
// that limitation is acceptable.

import { platform } from "./fileIo";

const isTauri = platform.isTauri;
const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";

export type ChosenFont = {
  filename: string;
  /** Real path on native, empty string on web (bytes already held in memory). */
  pickedPath: string;
  /** Web mode: the file bytes ready to register. Native: empty until copied. */
  buffer: ArrayBuffer;
};

export type ImportedFontMeta = {
  filename: string;
  /** Absolute path inside the app-data `fonts/` folder on the native side. */
  savedPath: string;
};

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Open a font picker (native dialog or hidden web input). */
export async function chooseFontFile(): Promise<ChosenFont | null> {
  if (isTauri) {
    const pickedPath = await tauriInvoke<string | null>("pick_font_file");
    if (!pickedPath) return null;
    const filename = pickedPath.split(/[\\/]/).pop() ?? pickedPath;
    return { filename, pickedPath, buffer: new ArrayBuffer(0) };
  }
  return chooseFontFileWeb();
}

function chooseFontFileWeb(): Promise<ChosenFont | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = FONT_ACCEPT;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    input.addEventListener("change", async () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      if (!file) return resolve(null);
      resolve({
        filename: file.name,
        pickedPath: "",
        buffer: await file.arrayBuffer(),
      });
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Persist a picked font into the app-data folder on the native side. */
export async function saveFontToAppData(
  pickedPath: string,
  uid: string
): Promise<ImportedFontMeta | null> {
  if (!isTauri) return null;
  return await tauriInvoke<ImportedFontMeta>("import_font_file", {
    pickedPath,
    uid,
  });
}

/** Read stored font bytes back into memory (used on startup to re-register). */
export async function readFontBytes(savedPath: string): Promise<ArrayBuffer> {
  if (isTauri) {
    return await tauriInvoke<ArrayBuffer>("read_font_bytes", { path: savedPath });
  }
  throw new Error("Reading stored fonts is only available in the native app");
}

/** Best-effort delete of a stored font file (ignored if already gone). */
export async function deleteFontFromAppData(savedPath: string): Promise<void> {
  if (isTauri) {
    await tauriInvoke<void>("delete_font_file", { path: savedPath });
  }
}

/**
 * Register an ArrayBuffer as a usable CSS font under the given family name,
 * appended to the document. Throws if the font fails to load/parse.
 */
export async function registerFontFace(
  family: string,
  bytes: ArrayBuffer
): Promise<FontFace> {
  const face = new FontFace(family, bytes);
  await face.load();
  document.fonts.add(face);
  return face;
}