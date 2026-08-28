import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, FormBridgeErrorBoundary } from "./ui/App";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("FormBridge root element was not found.");

createRoot(root).render(
  <StrictMode>
    <FormBridgeErrorBoundary>
      <App />
    </FormBridgeErrorBoundary>
  </StrictMode>,
);

