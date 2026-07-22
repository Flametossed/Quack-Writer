import { useState } from "react";
import { useDocs, type Doc } from "../store/docs";
import { requestCloseDoc, renameDoc } from "../lib/docActions";
import { SaveStatus } from "./SaveStatus";
import { InlineRename } from "./InlineRename";
import { X, Eye, Pencil } from "lucide-react";
import "./Tabs.css";

export function Tabs() {
  const order = useDocs((s) => s.order);
  const docs = useDocs((s) => s.docs);
  const activeId = useDocs((s) => s.activeId);
  const setActive = useDocs((s) => s.setActive);
  const setView = useDocs((s) => s.setView);
  const moveTab = useDocs((s) => s.moveTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);

  const activeDoc = docs.find((d) => d.id === activeId);

  function tab(d: Doc) {
    const dirty = d.content !== d.savedContent;
    const dropClass =
      dropTarget?.id === d.id
        ? dropTarget.after
          ? " drop-after"
          : " drop-before"
        : "";
    return (
      <div
        key={d.id}
        className={
          "tab" +
          (d.id === activeId ? " is-active" : "") +
          (d.id === dragId ? " is-dragging" : "") +
          dropClass
        }
        onClick={() => setActive(d.id)}
        onAuxClick={(e) => {
          if (e.button === 1) void requestCloseDoc(d.id);
        }}
        title={d.path ?? d.name}
        draggable={editingId !== d.id}
        onDragStart={(e) => {
          setDragId(d.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === d.id) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const after = e.clientX > rect.left + rect.width / 2;
          if (dropTarget?.id !== d.id || dropTarget.after !== after) {
            setDropTarget({ id: d.id, after });
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && dropTarget) {
            moveTab(dragId, dropTarget.id, dropTarget.after);
          }
          setDragId(null);
          setDropTarget(null);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
      >
        {editingId === d.id ? (
          <InlineRename
            initial={d.name}
            className="tab__rename"
            onCommit={(name) => {
              setEditingId(null);
              void renameDoc(d.id, name);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <span
            className="tab__name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(d.id);
            }}
            title="Double-click to rename"
          >
            {d.name}
          </span>
        )}
        <span className={"tab__dot" + (dirty ? " is-dirty" : "")} />
        <button
          className="tab__close"
          onClick={(e) => {
            e.stopPropagation();
            void requestCloseDoc(d.id);
          }}
          aria-label={`Close ${d.name}`}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="tabs">
      <div className="tabs__list">
        {order.map((id) => {
          const d = docs.find((x) => x.id === id);
          return d ? tab(d) : null;
        })}
      </div>
      {activeDoc?.language === "markdown" && (
        <button
          className="view-toggle"
          onClick={() =>
            setView(
              activeDoc.id,
              activeDoc.view === "preview" ? "source" : "preview"
            )
          }
          title={
            activeDoc.view === "preview"
              ? "Edit markdown (⌘/Ctrl+E)"
              : "Preview (⌘/Ctrl+E)"
          }
        >
          {activeDoc.view === "preview" ? (
            <>
              <Pencil size={13} /> Edit
            </>
          ) : (
            <>
              <Eye size={13} /> Preview
            </>
          )}
        </button>
      )}
      <SaveStatus />
    </div>
  );
}
