import { useDocs, type Doc } from "../store/docs";
import { SaveStatus } from "./SaveStatus";
import { X } from "lucide-react";
import "./Tabs.css";

export function Tabs() {
  const order = useDocs((s) => s.order);
  const docs = useDocs((s) => s.docs);
  const activeId = useDocs((s) => s.activeId);
  const setActive = useDocs((s) => s.setActive);
  const closeDoc = useDocs((s) => s.closeDoc);

  function tab(d: Doc) {
    const dirty = d.content !== d.savedContent;
    return (
      <div
        key={d.id}
        className={"tab" + (d.id === activeId ? " is-active" : "")}
        onClick={() => setActive(d.id)}
        onAuxClick={(e) => {
          if (e.button === 1) closeDoc(d.id);
        }}
        title={d.path ?? d.name}
      >
        <span className="tab__name">{d.name}</span>
        <span className={"tab__dot" + (dirty ? " is-dirty" : "")} />
        <button
          className="tab__close"
          onClick={(e) => {
            e.stopPropagation();
            closeDoc(d.id);
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
      <SaveStatus />
    </div>
  );
}