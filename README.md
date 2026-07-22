# Quack Writer

A sleek, modern, **native** writing app — a faster, more capable alternative to
Windows Notepad. Built with **Tauri 2 + React + TypeScript** and a
CodeMirror 6 markdown editor. UI inspired by Obsidian / ChatGPT-style dark
themes.

![dark theme]

## Features (v1)

- Start Menu splash with recent documents
- IDE-style file Explorer on the left (open documents + filter)
- Center editor with **tabs** for switching between documents
- Right **format bar**: headings, bold/italic/strike/code/link, quotes,
  lists, code blocks, font family switch
- Markdown + plain text editing with syntax highlighting
- Live **word / char / line** counts in the status bar
- Built-in **Find** (CodeMirror search, `⌘/Ctrl+F`)
- **Auto-save** (debounced) + manual `⌘/Ctrl+S` / Save As
- **Dark / light** theme toggle (persisted)
- Recent documents list (persisted locally)

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Explorer │  Tabs              │ Format bar           │
│  (file    ├────────────────────┤ Heading1/2/3 Bold … │
│   tree +  │                    │                      │
│   open    │     Editor         │                      │
│   docs)   │     (CodeMirror)   │                      │
│           │                    │                      │
├───────────┴────────────────────┴──────────────────────┤
│  Status bar (Save · Find · path · words/chars/lines) │
└──────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js ≥ 20** and **npm**
- **Rust** (stable) to build the native binary — install via
  [rustup](https://rustup.rs):
  ```sh
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- Tauri system prerequisites for macOS: Xcode command-line tools
  (`xcode-select --install`).

## Getting started

Install dependencies:

```sh
npm install
```

### Run the web dev server (frontend only, no native shell)

```sh
npm run dev
```

This uses the browser **File System Access API** as a fallback for file
open/save, so opening / saving files still works in Chrome/Edge.

### Run the full native Tauri app

```sh
npm run tauri dev
```

### Build a native installer

```sh
npm run tauri build
```

Output bundles appear in `src-tauri/target/release/bundle/`.

## Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `npm run dev`         | Vite dev server (frontend only)              |
| `npm run build`       | Type-check + build the frontend              |
| `npm run preview`      | Preview the built frontend                    |
| `npm run tauri dev`    | Run the full Tauri app                        |
| `npm run tauri build`  | Build native installers                        |
| `npm run lint`        | ESLint                                        |
| `npm run typecheck`    | `tsc --noEmit`                                |

## Project structure

```
.
├── index.html
├── src/                      # React frontend
│   ├── App.tsx               # Shell: Start Menu vs Editor
│   ├── components/
│   │   ├── StartMenu*        # Splash + recents
│   │   ├── FileExplorer*     # Left sidebar
│   │   ├── Tabs*             # Document tabs
│   │   ├── MarkdownEditor*   # CodeMirror editor
│   │   ├── FormatBar*        # Right formatting rail
│   │   ├── StatusBar*        # Bottom stats / actions
│   │   └── ...
│   ├── lib/fileIo.ts         # Tauri + browser fallback IO
│   ├── store/                # zustand stores (docs, recents, theme)
│   └── styles/global.css     # Theme tokens
└── src-tauri/                # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/{main,lib,fs_io}.rs
```

## Notes

- App icons live in `src-tauri/icons/`. Replace the placeholders before
  producing a release build (`npm run tauri icon path/to/icon.png`).