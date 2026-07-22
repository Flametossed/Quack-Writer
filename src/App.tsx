import { useState } from "react";
import { StartMenu } from "./components/StartMenu";
import { EditorView } from "./components/EditorView";
import { useDocs } from "./store/docs";

export default function App() {
  const docsCount = useDocs((s) => s.docs.length);
  const [started, setStarted] = useState(false);

  const showEditor = started || docsCount > 0;

  return (
    <div className="app">
      {showEditor ? <EditorView /> : <StartMenu onOpen={() => setStarted(true)} />}
    </div>
  );
}