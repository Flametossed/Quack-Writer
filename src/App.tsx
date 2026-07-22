import { StartMenu } from "./components/StartMenu";
import { EditorView } from "./components/EditorView";
import { useUi } from "./store/ui";
import { useCloseGuard } from "./lib/useCloseGuard";

export default function App() {
  const screen = useUi((s) => s.screen);
  useCloseGuard();

  return (
    <div className="app">
      {screen === "editor" ? <EditorView /> : <StartMenu />}
    </div>
  );
}
