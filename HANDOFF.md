# HANDOFF — read this first

> Project state as of **2026-07-22**. The full UX iteration described here
> (everything after `774d095 Initial commit`) is committed and pushed to
> `main`. The standing rule remains: **ask before committing or pushing
> anything new**.

## ⚠️ 2026-07-22: hard-freeze incident (resolved: moved out of OneDrive)

A cold Rust build (16 parallel jobs, ~6k output files in `src-tauri/target`,
Defender scanning every write) hard-froze the machine. Mitigations:

- `.cargo/config.toml` caps builds at `jobs = 8`. Keep it.
- The project has been moved out of OneDrive and now lives at
  `C:\Users\nreyn\Projects\Quack Writer` (done 2026-07-22).
- Windows Defender now excludes `C:\Users\nreyn\Projects` (added 2026-07-22),
  so builds are no longer scanned write-by-write.
- After the move, the stale `src-tauri/target` cache had OneDrive paths baked
  into Tauri build-script outputs and broke `tauri dev`; fixed with a targeted
  `cargo clean -p tauri -p tauri-build -p tauri-plugin-dialog -p quack-writer`.

## Project

**Quack Writer** is a native Windows writing app built with **Tauri 2, React
18, TypeScript, Zustand, and CodeMirror 6**.

Repository: https://github.com/Flametossed/Quack-Writer

The user explicitly said not to spend time on the web version; prioritize the
locally run native Tauri application.

## Machine and commands

- System toolchain is installed: Node 24.18 LTS, Rust 1.97.1 through rustup,
  VS 2022 Build Tools with the C++ workload, and WebView2.
- In older/reused PowerShell sessions, Node may need:
  `$env:Path = 'C:\Program Files\nodejs;' + $env:Path`
- Cargo is under `$env:USERPROFILE\.cargo\bin` if the shell has not refreshed.
- PowerShell 5.1 is in use, so avoid Bash-only syntax such as `&&`.

| Command | Purpose |
| --- | --- |
| `npm run tauri dev` | Run the native app with frontend hot reload |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint validation |
| `npm run build` | Production frontend build |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Native filesystem tests |
| `npm run tauri build` | Create installers under `src-tauri/target/release/bundle/` — not run yet |

`npm run typecheck`, `npm run lint`, `npm run build`, and the two native Rust
filesystem tests pass. Vite reports only the existing large-main-chunk warning
(about 900 kB before gzip).

## Current implemented behavior

### Native filesystem and document lifecycle

- `src-tauri/src/fs_io.rs` uses the real Tauri 2 dialog API and implements
  native open/save, atomic writes, UTF-8 BOM stripping, lossy UTF-8 fallback,
  confirmation dialogs, folder picking/listing, renaming, moving files,
  creating text files, and creating nested folders.
- Native commands are registered in `src-tauri/src/lib.rs`; required
  capabilities are in `src-tauri/capabilities/default.json`.
- `src/lib/docActions.ts` centralizes open, save, autosave, close, rename,
  workspace move, and recent-document behavior.
- `src/lib/useCloseGuard.ts` protects unsaved work on blur/window close and is
  mounted at app level.
- Open saved documents follow their new path when moved. Unsaved scratch
  documents dragged into the workspace are created as real files. Existing
  destination files are never overwritten silently.

### Readability pass (Tier 1, 2026-07-22)

Research-driven eyes-on-glass improvements, all desktop-minded:

- Source editor and Markdown preview render in a centered column capped at
  `--editor-measure` (40em ≈ 70–75 chars/line). Em-based, so the measure
  tracks text zoom automatically.
- Editor text zoom: Ctrl+= / Ctrl+− / Ctrl+0 and Ctrl+scroll (Notepad
  parity), persisted via `quack.fontSize`, applied through the
  `--editor-font-size` CSS variable (no CodeMirror reconfigure needed).
  Handlers `preventDefault` so WebView2 never zooms the whole UI. A− / A+ /
  reset controls also live in the Format sidebar's font section (enabled in
  preview too).
- Font stacks are Windows-first: `Segoe UI Variable Text` → `Segoe UI` for
  UI/editor, `Cascadia Mono` → Consolas for mono (old stacks led with
  macOS-only SF fonts).
- Dark palette softened for long sessions: `--text` #ececec → #d4d4d4
  (~12:1, avoids halation), `--text-dim` bumped to #8f8f8f to stay ≥4.5:1.
  Light theme text softened similarly (#2b2b2b / #6f6f6f). The editor now
  forces `background: var(--bg)` and `color: var(--text)` so both CodeMirror
  GitHub themes harmonize with app chrome (light mode gets the warm paper
  tone instead of pure white).
- Status bar: selection-aware word/char count (accent-colored, fed by a
  CodeMirror updateListener → `src/store/selection.ts`) and an estimated
  reading time (~225 wpm) when no selection is active.

### Editor and formatting

- Markdown preview uses `marked` plus `dompurify`. Markdown documents may use
  `preview` or `source`; empty new documents start in source and `.txt` files
  always use source. Ctrl+E and the tab control toggle Markdown preview.
- Markdown source mode has line numbers.
- The right formatting sidebar was reorganized into labeled, readable groups.
- Formatting actions cover headings, bold, italic, strike, inline code, links,
  quote, bullets, numbered lists, and fenced code blocks.
- Heading insertion now returns the text cursor after the Markdown prefix
  instead of placing it before the `#` characters.
- Editor font selection persists through `src/store/font.ts`.

### Explorer and workspace tree

- The left sidebar starts directly with **Workspace**; the redundant
  “Explorer” title/header was removed.
- Workspace folders are lazy-loaded and the native workspace path persists
  across launches.
- Workspace files can be dragged between the root and nested folders.
- Documents can be dragged from **Open Documents** into any workspace folder.
- Open Documents can be reordered vertically; that order stays synchronized
  with the top tab order.
- New subfolders can be created at the root or inside any nested folder using
  the folder-plus hover action and inline name entry.
- The Workspace header has an always-visible **Expand all folders** control.
  It recursively loads/expands folders and shows a spinner while working.
- Root hover actions provide add-subfolder, refresh, and close-workspace.
- Open Documents has filtering, dirty indicators, inline rename, and active-row
  feedback.

### Important Windows drag-and-drop requirement

`src-tauri/tauri.conf.json` intentionally sets:

```json
"dragDropEnabled": false
```

Do not “fix” this back to `true`. On Windows/Tauri, disabling Tauri's native
file-drop interception is required for the app's HTML5 drag-and-drop events.
The red-cross/no-drop problem disappeared only after this setting changed.

### Application menu and navigation

- `src/components/AppMenuBar.tsx` is the application-level menu bar above the
  entire editor layout.
- The Home button is on this bar immediately left of **File** and returns to the
  Start Menu after flushing dirty documents.
- The File menu contains:
  - New document — Ctrl+N
  - Open file — Ctrl+O
  - Open folder — Ctrl+Shift+O
  - Alt+F toggles the menu; Escape closes it.
- `src/store/ui.ts` owns Start Menu/editor navigation.

### Bottom status bar search

- The old search icon/floating CodeMirror panel was replaced with an integrated,
  always-visible **Find in document** field in `StatusBar`.
- Searches are case-insensitive, highlight all matches, select the active match,
  show `current/total`, and wrap through results.
- Enter goes to the next result; Shift+Enter goes to the previous result;
  Escape clears the search and returns focus to the editor.
- Ctrl+F focuses/selects the status-bar field. CodeMirror's default search
  keymap is disabled to avoid opening a second search UI.
- Search is disabled while Markdown preview is active and resets when switching
  documents or view modes.

### Sidebars, View menu, and spellcheck (Tier 2, 2026-07-22)

- **Ctrl+B / Ctrl+Alt+B** toggle the Explorer / Format sidebars (they unmount
  cleanly; no CSS changes). Visibility persists via `quack.explorerVisible` /
  `quack.formatBarVisible` in `src/store/ui.ts`.
- `AppMenuBar` now has a **View** menu (Alt+V) beside File with checkmark
  items for both sidebars and spellcheck; hovering across triggers while a
  menu is open switches menus, native-style. Each trigger+dropdown lives in
  its own positioned `.app-menu__entry`.
- **Spellcheck** is on by default (`quack.spellcheck`), applied through
  `EditorView.contentAttributes` (`spellcheck=true`, autocorrect/
  autocapitalize off) so WebView2's native engine draws squiggles.
- **Custom editor context menu** (`src/components/EditorContextMenu.tsx`):
  WebView2's default menu has no spelling-suggestion items and no API for
  them, so `src-tauri/src/spell.rs` calls the Windows Spell Checking API
  (`ISpellChecker` — the same OS engine behind the squiggles) via
  `spell_suggest` / `spell_add_word` commands. Menu shows up to 6
  suggestions, Add to dictionary (writes the Windows custom dictionary, then
  flips the spellcheck attribute to refresh the squiggle), and
  Cut/Copy/Paste/Select all. It only intercepts right-click in the native app
  with spellcheck on; otherwise the stock WebView2 menu is untouched. Paste
  uses `navigator.clipboard.readText()` — worked in testing pending user
  confirmation; fall back to a Tauri clipboard command if it misbehaves.
- `windows` crate (0.61, already in the tree via Tauri) added as a
  Windows-only dependency with `Win32_Globalization` + `Win32_System_Com`.

## Files added during the 2026-07-22 iteration

- `src/components/AppMenuBar.tsx` / `.css`
- `src/components/EditorContextMenu.tsx` / `.css`
- `src/lib/spell.ts`
- `src-tauri/src/spell.rs`
- `src/components/InlineRename.tsx`
- `src/components/MarkdownPreview.tsx` / `.css`
- `src/lib/docActions.ts`
- `src/lib/useCloseGuard.ts`
- `src/store/font.ts`
- `src/store/selection.ts`
- `src/store/ui.ts`
- `src/store/workspace.ts`
- `.github/workflows/ci.yml`
- Native icons, generated Tauri schemas, and `src-tauri/Cargo.lock`

There are also broad edits across Explorer, tabs, editor, format bar, status
bar, start screen, Tauri configuration, README, and dependency manifests.
Preserve the user's entire dirty working tree and avoid reverting unrelated
changes.

## Natural next steps — not yet authorized

0. Remaining researched Tier 2/3 improvements (agreed with user, not yet
   built): typewriter scrolling, focus mode, sepia theme, word-count goal.
   (Toggleable sidebars and spellcheck shipped 2026-07-22.)
1. Confirm Paste works from the new editor context menu (clipboard-read
   permission in WebView2 was the one untestable piece).
2. Run `npm run tauri build` when the user wants a real Windows installer.
3. Commit and push only after explicit approval.
4. Wire preview links through a native opener if requested.
5. Consider preserving editor cursor/scroll when navigating Home and back.
6. Later native-app work could include file associations, single-instance/argv
   handling, scratch-tab session restore, and external file-change detection.
7. Optional hygiene: upgrade ESLint 8 to flat-config ESLint 9, add a LICENSE,
   add frontend tests, and split the large frontend bundle.

## Working notes

- Vite uses strict port `1420`; `tauri dev` fails if another Vite process owns
  that port.
- The Tauri watcher may restart after Rust or config changes; ordinary React/CSS
  work updates through HMR.
- Production Vite builds may need to run outside the filesystem sandbox because
  sandboxed config reads can fail.
- The user tests quickly and reports concrete visual/interaction issues. Keep
  updates focused, let HMR show changes, and run typecheck/lint/build after each
  completed interaction pass.

## 2026-07-22: custom font system (committed as 6e409db)

Added a multi-source font picker (committed/pushed as `6e409db`, despite an
earlier draft of this note saying otherwise).

Sources supported, all surfaced in the FormatBar's "Editor font" section:

- **More built-in presets** — the old `system / serif / sans / mono` union was
  replaced with a stable ID list in `src/store/font.ts` (`PRESETS`). Added
  Verdana, Trebuchet MS, Times, Georgia, Courier New, Garamond, and
  "Inter (if installed)".
- **Add family by name** — store-level `source: "named"` entries still load
  and work, but the two text inputs were later removed from the FormatBar as
  clutter (2026-07-22 polish pass); there is no UI to create new ones.
- **Import font file** — opens a native picker filtered to `.ttf/.otf/.woff/.woff2`,
  copies the bytes into `<app_data_dir>/fonts/<uid>.<ext>` via the new Rust
  `import_font_file` command, registers it through `FontFace`, and applies a
  synthetic family name (`Quack-<id>`) so the file's internal name doesn't
  matter. Persists across relaunches; file-font bytes are read back through
  `read_font_bytes` on startup by `initCustomFonts()`.

Custom entries are listed under an "Added by you" `<optgroup>` and can be
removed with the per-active "Remove …" button (file fonts also delete the
backing copy). State persists in `quack.customFonts` (localStorage). The
active id stays in `quack.font` (preset key or `custom:<id>`).

## 2026-07-22: UI polish pass (theme, eye care, editor column, borders)

- FormatBar "Editor font": removed the add-family-by-name inputs; the section
  is now dropdown → Remove (when custom active) → Import font file → size.
- Start Menu: theme toggle + eye-protection toggle pinned bottom-right
  (`.start__corner`), mirroring the status-bar buttons.
- **Eye-protection mode**: warm sepia tint (`sepia(0.24) brightness(0.99)`)
  applied via `[data-eyecare="1"] body` in `global.css`; state
  `quack.eyeCare` lives in `src/store/theme.ts` next to the theme; Eye
  buttons (accent-colored when on) in StatusBar and Start Menu.
- **Editor column left-anchored**: `.cm-content` keeps the
  `--editor-measure` line cap but no longer centers (the centered column
  stranded the gutter far from the text). Markdown preview matches. Top
  padding reduced 24px → 8px.
- **Gutter alignment**: `.cm-gutters` must have NO vertical padding —
  CodeMirror aligns gutter elements to content padding itself; doubling it
  sagged every line number (looked like misalignment). Keep `0 0 0 8px`.
- **Active-line cues** re-enabled: faint 5% wash + accent-colored line
  number. No `font-weight` on `.cm-activeLineGutter` (bold shifts metrics).
- **Border tokens brightened** for clearer panel separation: dark #414141 /
  #333333, light #d2cfc6 / #e0ddd6.

New/changed files:

- `src-tauri/src/fs_io.rs` — new commands `pick_font_file`,
  `import_font_file` (copies into `app_data_dir/fonts/`, validates a
  frontend-supplied UID so it can't escape that folder), `read_font_bytes`
  (returns raw bytes via `tauri::ipc::Response` → ArrayBuffer on the JS side,
  no base64 round-trip), and `delete_font_file` (best-effort, missing is OK).
- `src-tauri/src/lib.rs` — registers the four new commands.
- `src/lib/fontIo.ts` — dual-mode helpers (native dialog + persisted copy vs
  hidden `<input type=file>` web fallback that keeps the font in-memory only).
- `src/store/font.ts` — rewritten around an ID-based registry. Still exports
  `EditorFont` (now `string`), `MIN_FONT_SIZE`, `MAX_FONT_SIZE`,
  `DEFAULT_FONT_SIZE`, `useFont`.
- `src/components/FormatBar.tsx` — dropdown now built from `PRESETS` + custom
  list, plus the Add-family and Import-font controls. Removed the old hardcoded
  `FONT_LABELS` record.
- `src/components/FormatBar.css` — styles for the new `.fmt-font__remove`,
  `.fmt-addfont`, `.fmt-addfont__input`, `.fmt-addfont__btn` controls.

No new `tauri-plugin-fs` dependency and **no capability file changes**: every
filesystem access goes through custom Rust commands (the same pattern the
existing `read_text_file`/`write_text_file` use), so the minimal
`capabilities/default.json` stays untouched.

### Verification done

`npm run typecheck` and `npm run lint` both clean on this machine (darwin dev
host). The Rust side was written to match the existing fs_io.rs patterns and
has **not** been cargo-checked here; run `cargo check` on the Windows host
before launching `npm run tauri dev`. A `npm run build` has not been run.

### Known follow-ups for the custom font work

- Web (`npm run dev`) file-font imports are session-only — not persisted across
  reloads. Named-family presets and active-font persistence still work there.
- A failed file import silently lands as an "unavailable" entry in the
  dropdown; no toast/error UI is shown yet.
- Font picking is disabled while a Markdown doc is in preview mode (kept the
  existing `disabled` behavior) — the add/import controls are still enabled.
