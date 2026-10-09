import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProductViewer } from "./product-viewer.js";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The product viewer candidate needs a root element.");
}

createRoot(root).render(
  <StrictMode>
    <ProductViewer />
  </StrictMode>,
);
