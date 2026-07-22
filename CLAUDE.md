# Quack Writer

**⚠️ FIRST ACTION EVERY SESSION: read `HANDOFF.md` in this folder before
doing anything else.** It holds current project state, what's uncommitted,
and agreed next steps.

Native Windows writing app (Notepad alternative). Tauri 2 + React 18 +
TypeScript + zustand + CodeMirror 6. Markdown docs render a preview by
default (Ctrl+E toggles source).

## Commands

- `npm run tauri dev` — native app (port 1420 must be free; strictPort)
- `npm run dev` — frontend-only web mode (browser File System Access fallback)
- `npm run typecheck && npm run lint && npm run build` — run after changes;
  `cargo check` in `src-tauri/` for Rust changes

## Architecture

- `src/lib/docActions.ts` — ALL open/save/close/rename flows live here; never
  reimplement save logic in components
- `src/lib/fileIo.ts` — dual-mode IO (Tauri invoke vs browser handles); keep
  `TEXT_EXTENSIONS` in sync with `src-tauri/src/fs_io.rs`
- `src/lib/useCloseGuard.ts` — app-level unsaved-work protection (App.tsx)
- `src/store/` — zustand: docs (tabs/content/view), workspace (folder tree),
  ui (start/editor screen), recents, save (status), theme, font
- `src-tauri/src/fs_io.rs` — all Rust commands; writes are atomic
  (temp + rename); keep them that way
- `src-tauri/capabilities/default.json` — minimal on purpose; justify any
  permission you add

## Rules

- Do not commit or push without the user's explicit go-ahead
- Data safety first: any new close/discard path must go through
  `requestCloseDoc` / `flushDirtyDocs`
- Update `HANDOFF.md` at the end of significant work sessions
