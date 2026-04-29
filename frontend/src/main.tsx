import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/* StrictMode omitted: staged scenario timers in App would double-fire under React 18 dev strict effects. */
createRoot(document.getElementById("root")!).render(<App />);
