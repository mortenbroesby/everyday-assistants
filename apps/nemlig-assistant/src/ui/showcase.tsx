import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerView } from "../picker/PickerView.js";
import type { PickerPayload } from "../picker/contract.js";
import { AppFrame } from "./AppFrame.js";
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
      details: [{ key: "Varedeklaration", value: "MÆLK. Pasteuriseret og homogeniseret." }, { key: "Opbevaring", value: "Højst 5 °C" }, { key: "Oprindelse", value: "Danmark" }],
    },
    alternatives: [
      { id: 2, name: "Minimælk", brand: "Arla", unit_size: "1 l", price: 14.5, available: true, description: "Et lettere alternativ med en mild smag.", details: [{ key: "Varedeklaration", value: "MÆLK." }, { key: "Fedt", value: "0,4 %" }] },
      { id: 3, name: "Økologisk letmælk", unit_size: "1 l", price: 16.95, available: false, description: "Dansk økologisk letmælk med en rund smag." },
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

  return <AppFrame>
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
  </AppFrame>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Showcase root is missing.");
createRoot(root).render(<StrictMode><Showcase /></StrictMode>);
