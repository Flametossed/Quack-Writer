import { useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  FileText,
  Folder,
  FolderPlus,
  FolderOpen,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useDocs, type Doc } from "../store/docs";
import { useWorkspace } from "../store/workspace";
import {
  moveOpenDocumentToWorkspace,
  moveWorkspaceFile,
  openWorkspaceFile,
  renameDoc,
} from "../lib/docActions";
import { platform, type DirEntry } from "../lib/fileIo";
import { InlineRename } from "./InlineRename";
import "./FileExplorer.css";

type DraggedFile = {
  path: string | null;
  name: string;
  docId?: string;
};

type TreeDrag = {
  busy: boolean;
  draggedPath: string | null;
  movingPath: string | null;
  dropTarget: string | null;
  start: (event: DragEvent<HTMLElement>, entry: DirEntry) => void;
  end: () => void;
  over: (event: DragEvent<HTMLElement>, destination: string) => void;
  leave: (event: DragEvent<HTMLElement>, destination: string) => void;
  drop: (event: DragEvent<HTMLElement>, destination: string) => void;
};

type TreeFolders = {
  creatingIn: string | null;
  start: (parentPath: string) => void;
  commit: (parentPath: string, name: string) => void;
  cancel: () => void;
};

function comparablePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  // Quack Writer's native target is Windows, where paths are case-insensitive.
  return platform.isTauri ? normalized.toLowerCase() : normalized;
}

function parentPath(path: string): string {
  const normalized = comparablePath(path);
  return normalized.slice(0, normalized.lastIndexOf("/"));
}

function isSameFolder(path: string, destination: string): boolean {
  return parentPath(path) === comparablePath(destination);
}

function FolderCreateRow({
  depth,
  onCommit,
  onCancel,
}: {
  depth: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <li
      className="tree__create-folder"
      style={{ paddingLeft: 30 + depth * 14 }}
    >
      <FolderPlus size={14} aria-hidden="true" />
      <InlineRename
        initial=""
        className="tree__folder-input"
        placeholder="Folder name"
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </li>
  );
}

function TreeFile({
  entry,
  depth,
  activePath,
  drag,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  drag: TreeDrag;
}) {
  const active = entry.path === activePath;
  const dragging = drag.draggedPath === entry.path;
  const moving = drag.movingPath === entry.path;

  return (
    <li>
      <button
        type="button"
        className={
          "tree__item tree__item--file" +
          (active ? " is-active" : "") +
          (dragging ? " is-dragging" : "") +
          (moving ? " is-moving" : "")
        }
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => void openWorkspaceFile(entry.path, entry.name)}
        draggable={!drag.busy}
        onDragStart={(event) => drag.start(event, entry)}
        onDragEnd={drag.end}
        title={entry.path}
        aria-current={active ? "page" : undefined}
      >
        <span className="tree__spacer" aria-hidden="true" />
        <FileText className="tree__file-icon" size={14} aria-hidden="true" />
        <span className="tree__name">{entry.name}</span>
      </button>
    </li>
  );
}

function TreeEntries({
  entries,
  depth,
  activePath,
  drag,
  folders,
}: {
  entries: DirEntry[];
  depth: number;
  activePath: string | null;
  drag: TreeDrag;
  folders: TreeFolders;
}) {
  return entries.map((entry) =>
    entry.isDir ? (
      <TreeDir
        key={entry.path}
        path={entry.path}
        name={entry.name}
        depth={depth}
        activePath={activePath}
        drag={drag}
        folders={folders}
      />
    ) : (
      <TreeFile
        key={entry.path}
        entry={entry}
        depth={depth}
        activePath={activePath}
        drag={drag}
      />
    )
  );
}

function TreeDir({
  path,
  name,
  depth,
  activePath,
  drag,
  folders,
}: {
  path: string;
  name: string;
  depth: number;
  activePath: string | null;
  drag: TreeDrag;
  folders: TreeFolders;
}) {
  const expanded = useWorkspace((s) => !!s.expanded[path]);
  const children = useWorkspace((s) => s.children[path]);
  const toggleDir = useWorkspace((s) => s.toggleDir);
  const dropDisabled = !!drag.draggedPath && isSameFolder(drag.draggedPath, path);

  return (
    <li className="tree__branch">
      <div
        className={
          "tree__dir-row" +
          (drag.dropTarget === path ? " is-drop-target" : "") +
          (dropDisabled ? " is-drop-disabled" : "")
        }
        onDragOver={(event) => drag.over(event, path)}
        onDragLeave={(event) => drag.leave(event, path)}
        onDrop={(event) => drag.drop(event, path)}
      >
        <button
          type="button"
          className="tree__item tree__item--dir"
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => void toggleDir(path)}
          title={path}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="tree__chevron" size={13} aria-hidden="true" />
          ) : (
            <ChevronRight className="tree__chevron" size={13} aria-hidden="true" />
          )}
          <Folder className="tree__folder-icon" size={14} aria-hidden="true" />
          <span className="tree__name">{name}</span>
        </button>
        <button
          type="button"
          className="tree__folder-add"
          title={`Add subfolder to ${name}`}
          aria-label={`Add subfolder to ${name}`}
          onClick={() => folders.start(path)}
        >
          <FolderPlus size={13} aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <ul className="tree__nested">
          {folders.creatingIn === path && (
            <FolderCreateRow
              depth={depth + 1}
              onCommit={(folderName) => folders.commit(path, folderName)}
              onCancel={folders.cancel}
            />
          )}
          {children === undefined ? (
            <li
              className="tree__loading"
              style={{ paddingLeft: 39 + depth * 14 }}
            >
              Loading…
            </li>
          ) : children.length === 0 && folders.creatingIn !== path ? (
            <li
              className="tree__loading"
              style={{ paddingLeft: 39 + depth * 14 }}
            >
              Empty folder
            </li>
          ) : (
            <TreeEntries
              entries={children}
              depth={depth + 1}
              activePath={activePath}
              drag={drag}
              folders={folders}
            />
          )}
        </ul>
      )}
    </li>
  );
}

export function FileExplorer() {
  const docs = useDocs((s) => s.docs);
  const order = useDocs((s) => s.order);
  const activeId = useDocs((s) => s.activeId);
  const setActive = useDocs((s) => s.setActive);
  const moveTab = useDocs((s) => s.moveTab);
  const root = useWorkspace((s) => s.root);
  const openFolder = useWorkspace((s) => s.openFolder);
  const closeFolder = useWorkspace((s) => s.closeFolder);
  const refresh = useWorkspace((s) => s.refresh);
  const expandAll = useWorkspace((s) => s.expandAll);
  const collapseAll = useWorkspace((s) => s.collapseAll);
  const isExpandingAll = useWorkspace((s) => s.isExpandingAll);
  const hasExpandedSubfolders = useWorkspace((s) =>
    Object.entries(s.expanded).some(
      ([path, open]) => open && path !== s.root?.path
    )
  );
  const toggleDir = useWorkspace((s) => s.toggleDir);
  const createFolder = useWorkspace((s) => s.createFolder);
  const rootExpanded = useWorkspace((s) =>
    root ? !!s.expanded[root.path] : false
  );
  const rootChildren = useWorkspace((s) =>
    root ? s.children[root.path] : undefined
  );
  const [query, setQuery] = useState("");
  const [openDocsCollapsed, setOpenDocsCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedFile, setDraggedFile] = useState<DraggedFile | null>(null);
  const [movingSource, setMovingSource] = useState<DraggedFile | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [docOrderDrop, setDocOrderDrop] = useState<{
    id: string;
    after: boolean;
  } | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const orderedDocs: Doc[] = [
    ...order.map((id) => docsById.get(id)).filter((doc): doc is Doc => !!doc),
    ...docs.filter((doc) => !order.includes(doc.id)),
  ];
  const filtered = orderedDocs.filter((doc) =>
    doc.name.toLowerCase().includes(normalizedQuery)
  );
  const activePath = docs.find((doc) => doc.id === activeId)?.path ?? null;
  const movingPath = movingSource?.docId ? null : (movingSource?.path ?? null);

  const drag: TreeDrag = {
    busy: !!movingSource,
    draggedPath: draggedFile?.path ?? null,
    movingPath,
    dropTarget,
    start: (event, entry) => {
      if (movingSource) {
        event.preventDefault();
        return;
      }
      setDraggedFile({ path: entry.path, name: entry.name });
      setDropTarget(null);
      event.dataTransfer.effectAllowed = "move";
      // A private type prevents an accidental drop in CodeMirror from
      // inserting the file path as editable text.
      event.dataTransfer.setData("application/x-quack-writer-file", entry.path);
    },
    end: () => {
      setDraggedFile(null);
      setDropTarget(null);
      setDocOrderDrop(null);
    },
    over: (event, destination) => {
      if (
        !draggedFile ||
        movingSource ||
        (draggedFile.path && isSameFolder(draggedFile.path, destination))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      if (dropTarget !== destination) setDropTarget(destination);
    },
    leave: (event, destination) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      if (dropTarget === destination) setDropTarget(null);
    },
    drop: (event, destination) => {
      event.preventDefault();
      event.stopPropagation();
      const file = draggedFile;
      setDraggedFile(null);
      setDropTarget(null);
      setDocOrderDrop(null);
      if (
        !file ||
        !root ||
        (file.path && isSameFolder(file.path, destination))
      ) {
        return;
      }

      setMovingSource(file);
      void (async () => {
        try {
          const moved = file.docId
            ? await moveOpenDocumentToWorkspace(
                file.docId,
                destination,
                root.path
              )
            : file.path
              ? await moveWorkspaceFile(
                  file.path,
                  file.name,
                  destination,
                  root.path
                )
              : false;
          if (!moved) return;

          const workspace = useWorkspace.getState();
          if (!workspace.expanded[destination]) {
            await workspace.toggleDir(destination);
          }
          await workspace.refresh();
        } finally {
          setMovingSource(null);
        }
      })();
    },
  };

  const folders: TreeFolders = {
    creatingIn,
    start: (parent) => {
      setCreatingIn(parent);
      if (!useWorkspace.getState().expanded[parent]) {
        void toggleDir(parent);
      }
    },
    commit: (parent, rawName) => {
      const name = rawName.trim();
      setCreatingIn(null);
      if (name) void createFolder(parent, name);
    },
    cancel: () => setCreatingIn(null),
  };

  return (
    <aside
      className={`explorer${draggedFile ? " is-dragging-file" : ""}`}
      aria-label="File Explorer"
    >
      <div className="explorer__section">
        <section
          className="explorer__panel explorer__panel--workspace"
          aria-labelledby="workspace-heading"
          onDragOver={
            root ? (event) => drag.over(event, root.path) : undefined
          }
          onDragLeave={
            root ? (event) => drag.leave(event, root.path) : undefined
          }
          onDrop={root ? (event) => drag.drop(event, root.path) : undefined}
        >
          <div className="explorer__panel-label" id="workspace-heading">
            <span>Workspace</span>
            <span className="explorer__panel-label-actions">
              {draggedFile && (
                <span className="explorer__drop-hint">Drop to add</span>
              )}
              {root && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  title={
                    hasExpandedSubfolders
                      ? "Collapse all folders"
                      : "Expand all folders"
                  }
                  aria-label={
                    hasExpandedSubfolders
                      ? "Collapse all folders"
                      : "Expand all folders"
                  }
                  disabled={isExpandingAll}
                  onClick={() =>
                    hasExpandedSubfolders ? collapseAll() : void expandAll()
                  }
                >
                  {isExpandingAll ? (
                    <Loader2
                      className="tree__spin"
                      size={12}
                      aria-hidden="true"
                    />
                  ) : hasExpandedSubfolders ? (
                    <ChevronsUp size={12} aria-hidden="true" />
                  ) : (
                    <ChevronsDown size={12} aria-hidden="true" />
                  )}
                </button>
              )}
            </span>
          </div>

          {root ? (
            <>
              <div
                className={
                  "explorer__workspace-head" +
                  (dropTarget === root.path ? " is-drop-target" : "") +
                  (draggedFile?.path &&
                  isSameFolder(draggedFile.path, root.path)
                    ? " is-drop-disabled"
                    : "")
                }
                onDragOver={(event) => drag.over(event, root.path)}
                onDragLeave={(event) => drag.leave(event, root.path)}
                onDrop={(event) => drag.drop(event, root.path)}
              >
                <button
                  type="button"
                  className="explorer__workspace-toggle"
                  onClick={() => void toggleDir(root.path)}
                  title={root.path}
                  aria-expanded={rootExpanded}
                >
                  {rootExpanded ? (
                    <ChevronDown size={13} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={13} aria-hidden="true" />
                  )}
                  <FolderOpen
                    className="explorer__workspace-icon"
                    size={15}
                    aria-hidden="true"
                  />
                  <span className="explorer__group-name">{root.name}</span>
                </button>
                <div className="explorer__workspace-actions">
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Add subfolder"
                    aria-label="Add subfolder"
                    onClick={() => folders.start(root.path)}
                  >
                    <FolderPlus size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Refresh folder"
                    aria-label="Refresh folder"
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Close folder"
                    aria-label="Close folder"
                    onClick={closeFolder}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {rootExpanded && (
                <ul className="tree">
                  {creatingIn === root.path && (
                    <FolderCreateRow
                      depth={0}
                      onCommit={(folderName) =>
                        folders.commit(root.path, folderName)
                      }
                      onCancel={folders.cancel}
                    />
                  )}
                  {rootChildren === undefined ? (
                    <li className="tree__loading tree__loading--root">
                      Loading…
                    </li>
                  ) : rootChildren.length === 0 && creatingIn !== root.path ? (
                    <li className="tree__loading tree__loading--root">
                      No supported text files
                    </li>
                  ) : (
                    <TreeEntries
                      entries={rootChildren}
                      depth={0}
                      activePath={activePath}
                      drag={drag}
                      folders={folders}
                    />
                  )}
                </ul>
              )}
            </>
          ) : (
            <div className="explorer__workspace-empty">
              <FolderTree size={18} aria-hidden="true" />
              <div className="explorer__workspace-copy">
                <span>No folder open</span>
                <small>Browse a writing folder here.</small>
              </div>
              <button type="button" onClick={() => void openFolder()}>
                Open
              </button>
            </div>
          )}
        </section>

        <section className="explorer__panel" aria-labelledby="documents-heading">
          <button
            type="button"
            className="explorer__group"
            onClick={() => setOpenDocsCollapsed((collapsed) => !collapsed)}
            aria-expanded={!openDocsCollapsed}
          >
            {openDocsCollapsed ? (
              <ChevronRight size={13} aria-hidden="true" />
            ) : (
              <ChevronDown size={13} aria-hidden="true" />
            )}
            <span id="documents-heading">Open Documents</span>
            <span className="explorer__count">{docs.length}</span>
          </button>

          {!openDocsCollapsed && (
            <>
              <div className="explorer__search">
                <Search size={13} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter open documents…"
                  aria-label="Filter open documents"
                  spellCheck={false}
                />
                {query && (
                  <button
                    type="button"
                    className="explorer__search-clear"
                    aria-label="Clear filter"
                    title="Clear filter"
                    onClick={() => setQuery("")}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>

              <ul className="explorer__list">
                {filtered.length === 0 && (
                  <li className="explorer__empty">
                    {docs.length === 0
                      ? "No open documents"
                      : "No matching documents"}
                  </li>
                )}
                {filtered.map((doc) => {
                  const isActive = doc.id === activeId;
                  const isDirty = doc.content !== doc.savedContent;

                  return (
                    <li
                      key={doc.id}
                      className={
                        "explorer__item" +
                        (isActive ? " is-active" : "") +
                        (isDirty ? " is-dirty" : "")
                      }
                    >
                      {editingId === doc.id ? (
                        <div className="explorer__document">
                          <FileText size={14} aria-hidden="true" />
                          <InlineRename
                            initial={doc.name}
                            className="explorer__rename"
                            onCommit={(name) => {
                              setEditingId(null);
                              void renameDoc(doc.id, name);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                          {isDirty && (
                            <span
                              className="explorer__dot"
                              title="Unsaved changes"
                            />
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={
                            "explorer__document" +
                            (draggedFile?.docId === doc.id
                              ? " is-dragging"
                              : "") +
                            (movingSource?.docId === doc.id
                              ? " is-moving"
                              : "") +
                            (docOrderDrop?.id === doc.id
                              ? docOrderDrop.after
                                ? " drop-after"
                                : " drop-before"
                              : "")
                          }
                          onClick={() => setActive(doc.id)}
                          draggable={!movingSource}
                          onDragStart={(event) => {
                            if (movingSource) {
                              event.preventDefault();
                              return;
                            }
                            setDraggedFile({
                              path: doc.path,
                              name: doc.name,
                              docId: doc.id,
                            });
                            setDropTarget(null);
                            setDocOrderDrop(null);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "application/x-quack-writer-document",
                              doc.id
                            );
                          }}
                          onDragEnd={drag.end}
                          onDragOver={(event) => {
                            const sourceId = draggedFile?.docId;
                            if (!sourceId || sourceId === doc.id || movingSource) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "move";
                            const rect = event.currentTarget.getBoundingClientRect();
                            const after = event.clientY > rect.top + rect.height / 2;
                            if (
                              docOrderDrop?.id !== doc.id ||
                              docOrderDrop.after !== after
                            ) {
                              setDocOrderDrop({ id: doc.id, after });
                            }
                          }}
                          onDragLeave={(event) => {
                            const next = event.relatedTarget;
                            if (
                              next instanceof Node &&
                              event.currentTarget.contains(next)
                            ) {
                              return;
                            }
                            if (docOrderDrop?.id === doc.id) {
                              setDocOrderDrop(null);
                            }
                          }}
                          onDrop={(event) => {
                            const sourceId = draggedFile?.docId;
                            if (!sourceId || sourceId === doc.id) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            const after = event.clientY > rect.top + rect.height / 2;
                            moveTab(sourceId, doc.id, after);
                            setDraggedFile(null);
                            setDropTarget(null);
                            setDocOrderDrop(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "F2") {
                              event.preventDefault();
                              setEditingId(doc.id);
                            }
                          }}
                          title={doc.path ?? doc.name}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <FileText size={14} aria-hidden="true" />
                          <span
                            className="explorer__name"
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              setEditingId(doc.id);
                            }}
                            title="Double-click or press F2 to rename"
                          >
                            {doc.name}
                          </span>
                          {isDirty && (
                            <span
                              className="explorer__dot"
                              title="Unsaved changes"
                            />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
