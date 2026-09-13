import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerFrame } from "./PickerFrame.js";
import { PickerView } from "./PickerView.js";
import type { PickerPayload } from "./contract.js";
import "./styles.css";
import "./showcase.css";

const sample: PickerPayload = {
  pantry_assumptions: ["salt", "peber"],
  items: [{
    ingredient: "mælk",
    quantity: 1,
    confidence: 72,
    favorite_match: true,
    product: {
      id: 1, name: "Letmælk 1,5%", brand: "Arla", unit_size: "1 l", price: 13.95, unit_price: 13.95, available: true,
      description: "Mild og frisk letmælk til morgenmad, kaffe og madlavning.",
      declaration: "MÆLK. Pasteuriseret og homogeniseret.",
      details: [{ key: "Opbevaring", value: "Højst 5 °C" }, { key: "Oprindelse", value: "Danmark" }],
    },
    alternatives: [
      { id: 2, name: "Minimælk", brand: "Arla", unit_size: "1 l", price: 14.5, available: true, description: "Et lettere alternativ med en mild smag.", declaration: "MÆLK.", details: [{ key: "Fedt", value: "0,4 %" }] },
      ...Array.from({ length: 8 }, (_, index) => ({ id: index + 3, name: `Mælkealternativ ${index + 2}`, unit_size: "1 l", price: 15 + index, available: index % 3 !== 0 })),
    ],
  }],
  rejected: [{ ingredient: "sæsonvare", reason: "Ikke fundet" }],
};

function Showcase() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return <PickerFrame>
    <header className="showcase-header">
      <h1>Nemlig UI</h1>
      <p className="showcase-intro">Synthetic design states using the production picker presentation. No Nemlig service is contacted.</p>
      <div className="showcase-controls" aria-label="Showcase display">
        <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>Theme: {theme}</button>
        <button type="button" onClick={() => setNarrow(!narrow)}>Viewport: {narrow ? "narrow" : "wide"}</button>
      </div>
    </header>
    <div className={narrow ? "showcase-stage showcase-stage-narrow" : "showcase-stage"}>
      <section><h2>Reviewed proposal</h2><PickerView payload={sample} onChoose={() => undefined} /></section>
      <section><h2>Sending</h2><PickerView payload={sample} pendingChoice="0:2" onChoose={() => undefined} /></section>
      <section><h2>Selected</h2><PickerView payload={sample} selectedChoice="0:2" onChoose={() => undefined} /></section>
      <section><h2>Loading</h2><PickerView onChoose={() => undefined} /></section>
      <section><h2>Empty</h2><PickerView payload={{ items: [] }} onChoose={() => undefined} /></section>
      <section><h2>Connection error</h2><PickerView failure="Forbindelsen kunne ikke oprettes. Prøv igen." onChoose={() => undefined} /></section>
    </div>
  </PickerFrame>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Showcase root is missing.");
createRoot(root).render(<StrictMode><Showcase /></StrictMode>);
