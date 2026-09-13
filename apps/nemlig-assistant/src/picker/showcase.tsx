import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerFrame } from "./PickerFrame.js";
import { PickerView } from "./PickerView.js";
import { journeyFor, type PickerPayload } from "./contract.js";
import { bindPickerHost } from "./session.js";
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
  const [host] = useState(() => bindPickerHost({ sendMessage: async ({ content }) => {
    const text = content[0]!.text;
    setLastMessage(text);
    if (text.startsWith("I approve")) return;
    if (text.startsWith("Search only")) {
      const context = JSON.parse(text.slice(text.indexOf("Carry journey: ") + 15, text.lastIndexOf("}") + 1)) as typeof journey;
      setActive({ ...initial, journey: context, items: initial.items.filter((item) => context.list.some((row) => row.ingredient === item.ingredient && row.included)) });
    } else {
      const args = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (text.startsWith("Restore List")) { setActive({ ...list, list: args.list }); setIncluded({}); }
      else {
        const products = [sampleItem.product, ...sampleItem.alternatives!, bread.product];
        setActive({ ...args, items: args.items.map((item: { product: number; alternatives: number[]; confidence: number }) => ({ ...item, confidence: Math.round(item.confidence * 100), product: products.find(({ id }) => id === item.product)!, alternatives: item.alternatives.map((id) => products.find((product) => product.id === id)!) })) });
      }
    }
  } }, () => {}));
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
        <div className="showcase-controls"><button type="button" onClick={() => { setActive(list); setIncluded({}); }}>Restart from List</button><button type="button" disabled={active.presentation !== "proposal"} onClick={() => setActive(sample("choices"))}>Challenge milk in ChatGPT</button></div>
        <PickerView payload={active} choices={choices} included={included} onInclude={(index, value) => setIncluded((current) => ({ ...current, [index]: value }))} onChoice={(index, id) => setChoices((current) => ({ ...current, [index]: id }))} onBack={() => { void host.sendNavigation(active, "back", choices, included); }} onSubmit={() => { if (active.presentation === "recap") setLastMessage("Stopped before approval. This synthetic showcase never changes a basket."); else void host.sendNavigation(active, "next", choices, included); }} />
        <details><summary>Last host message</summary><pre>{lastMessage || "Use the navigation controls."}</pre></details>
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
