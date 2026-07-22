import { useSaveStore } from "../store/save";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import "./SaveStatus.css";

export function SaveStatus() {
  const state = useSaveStore((s) => s.state);
  return (
    <div className={"save-status state-" + state}>
      {state === "saving" && <Loader2 size={12} className="spin" />}
      {state === "saved" && <Check size={12} />}
      {state === "error" && <AlertTriangle size={12} />}
      <span>
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
        {state === "error" && "Save failed"}
        {state === "idle" && ""}
      </span>
    </div>
  );
}