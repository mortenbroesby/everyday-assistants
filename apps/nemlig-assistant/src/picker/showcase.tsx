import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerFrame } from "./PickerFrame.js";
import { PickerView } from "./PickerView.js";
import { journeyFor, type PickerPayload } from "./contract.js";
import { advancePicker, openPickerChoices } from "./session.js";
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

const list: Extract<PickerPayload, { presentation: "list" }> = { presentation: "list", items: [], list: [
  { ingredient: "milk", amount: "2 l", included: true },
  { ingredient: "bread", amount: "1 loaf", included: true },
  { ingredient: "salt", amount: "1 pinch", included: false },
] };
const bread = { ...sampleItem, ingredient: "bread", quantity: 1, confidence: 95, favorite_match: false, product: { id: 4, name: "Wholegrain sourdough", unit_size: "500 g", price: 24.95, available: true }, alternatives: [] };
const initial: Exclude<PickerPayload, { presentation: "list" }> = { presentation: "proposal", items: [sampleItem, bread], pantry_assumptions: ["salt"], journey: { list: list.list } };
const journey = journeyFor(initial);
const sample = (presentation: Exclude<PickerPayload["presentation"], "list">, changed = false): PickerPayload => ({
  presentation,
  pantry_assumptions: ["salt", "pepper"],
  items: presentation === "choices" ? [sampleItem] : [{ ...sampleItem, changed }, bread],
  journey: { ...journey, previous: changed ? "choices" : "proposal", choices: { items: [journey.proposal!.items[0]!], pantry_assumptions: ["salt"] } },
  rejected: [{ ingredient: "fresh basil", reason: "No proposed product matched this ingredient." }],
});

const noop = () => undefined;

function Showcase() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [narrow, setNarrow] = useState(false);
  const [active, setActive] = useState<PickerPayload>(list);
  const [choices, setChoices] = useState<Record<number, number>>({ 0: 1 });
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [lastMessage, setLastMessage] = useState("");
  const [backStack, setBackStack] = useState<PickerPayload[]>([]);
  const [forwardStack, setForwardStack] = useState<PickerPayload[]>([]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const common = { choices: { 0: 2 }, onChoice: noop, onSubmit: noop, onBack: noop };
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
      <section><h2>Interactive journey</h2>
        <div className="showcase-controls"><button type="button" onClick={() => { setActive(list); setIncluded({}); setBackStack([]); setForwardStack([]); }}>Restart from List</button></div>
        <PickerView payload={active} choices={choices} included={included} onInclude={(index, value) => { setIncluded((current) => ({ ...current, [index]: value })); setForwardStack([]); }} onChoice={(index, id) => setChoices((current) => ({ ...current, [index]: id }))} onAlternatives={(index) => {
          if (active.presentation === "list") return;
          const next = openPickerChoices(active, index);
          if (!next) return;
          setBackStack((current) => [...current, active]); setForwardStack([]); setActive(next);
        }} onBack={() => {
          const previous = backStack.at(-1) ?? (active.presentation === "proposal" ? list : undefined);
          if (!previous) return;
          setBackStack((current) => current.slice(0, -1)); setForwardStack((current) => [active, ...current]); setActive(previous);
        }} onSubmit={() => {
          if (active.presentation === "recap") { setLastMessage("Stopped before approval. This synthetic showcase never changes a basket."); return; }
          if (active.presentation === "list") {
            const next = forwardStack[0] ?? initial;
            setBackStack((current) => [...current, active]); setForwardStack((current) => current.slice(1)); setActive(next); return;
          }
          const proposal = [...backStack].reverse().find((view): view is Exclude<PickerPayload, { presentation: "list" }> => view.presentation === "proposal");
          const next = advancePicker(active, choices, proposal);
          if (!next) return;
          setBackStack((current) => [...current, active]); setForwardStack([]); setActive(next);
        }} />
        <details><summary>Safety boundary</summary><pre>{lastMessage || "No host message is needed until discovery or final approval."}</pre></details>
      </section>
      <section><h2>Shopping list</h2><PickerView payload={list} {...common} /></section>
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
