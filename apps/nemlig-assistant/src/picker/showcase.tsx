import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerFrame } from "./PickerFrame.js";
import { PickerView } from "./PickerView.js";
import type { PickerPayload } from "./contract.js";
import "./styles.css";
import "./showcase.css";

const sampleItem: PickerPayload["items"][number] = {
  ingredient: "milk",
  quantity: 2,
  confidence: 72,
  favorite_match: true,
  changed: false,
  product: {
    id: 1, name: "Arla Letmælk 1.5%", brand: "Arla", unit_size: "1 l", price: 13.95, unit_price: 13.95, available: true,
    description: "Mild and fresh milk for breakfast, coffee and cooking.",
    declaration: "MÆLK. Pasteuriseret og homogeniseret.",
    details: [{ key: "Storage", value: "At most 5 °C" }, { key: "Origin", value: "Denmark" }],
  },
  alternatives: [
    { id: 2, name: "Organic Letmælk", brand: "Thise", unit_size: "1 l", price: 17.95, available: true, description: "Organic Danish semi-skimmed milk." },
    { id: 3, name: "Budget Letmælk", brand: "First Price", unit_size: "1 l", price: 10.95, available: true },
  ],
};

const sample = (presentation: PickerPayload["presentation"], changed = false): PickerPayload => ({
  presentation,
  pantry_assumptions: ["salt", "pepper"],
  items: [{ ...sampleItem, changed }],
  rejected: [{ ingredient: "fresh basil", reason: "No proposed product matched this ingredient." }],
});

const noop = () => undefined;

function Showcase() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const common = { choices: { 0: 2 }, onChoice: noop, onSubmit: noop };
  return <PickerFrame>
    <header className="showcase-header">
      <h1>Nemlig UI</h1>
      <p className="showcase-intro">Synthetic design states using the production picker. No Nemlig service is contacted.</p>
      <div className="showcase-controls" aria-label="Showcase display">
        <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>Theme: {theme}</button>
        <button type="button" onClick={() => setNarrow(!narrow)}>Viewport: {narrow ? "narrow" : "wide"}</button>
      </div>
    </header>
    <div className={narrow ? "showcase-stage showcase-stage-narrow" : "showcase-stage"}>
      <section><h2>Complete proposal</h2><PickerView payload={sample("proposal")} {...common} /></section>
      <section><h2>Focused choices</h2><PickerView payload={sample("choices")} {...common} /></section>
      <section><h2>Final recap</h2><PickerView payload={sample("recap", true)} {...common} /></section>
      <section><h2>Sending</h2><PickerView payload={sample("recap", true)} pending {...common} /></section>
      <section><h2>Loading</h2><PickerView {...common} /></section>
      <section><h2>Empty</h2><PickerView payload={{ presentation: "proposal", items: [] }} {...common} /></section>
      <section><h2>Connection error</h2><PickerView failure="The connection could not be established. Try again." {...common} /></section>
    </div>
  </PickerFrame>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Showcase root is missing.");
createRoot(root).render(<StrictMode><Showcase /></StrictMode>);
