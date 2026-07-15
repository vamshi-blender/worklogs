import { createRoot } from "react-dom/client";
import App from "./App";
import "./base.css";
import "./design-system.css";

createRoot(document.getElementById("root")!).render(<App ctx="sidepanel" />);
