import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { effectRemedaCandidate } from "../picker/comparison/effect-remeda.js";
import { fpTsCandidate } from "../picker/comparison/fp-ts.js";
import { runComparisonScenario, samplePayload, scenarios, type ComparisonScenario } from "../picker/comparison/harness.js";
import type { ComparisonCandidate } from "../picker/comparison/types.js";
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
    product: { id: 1, name: "Letmælk", brand: "Nemlig", unit_size: "1 l", price: 13.95, available: true },
    alternatives: [
      { id: 2, name: "Minimælk", brand: "Arla", unit_size: "1 l", price: 14.5, available: true },
      { id: 3, name: "Økologisk letmælk", unit_size: "1 l", price: 16.95, available: false },
    ],
  }],
  rejected: [{ ingredient: "sæsonvare", reason: "Ikke fundet" }],
};

const comparisonCandidates = [fpTsCandidate, effectRemedaCandidate] as const;

function Comparison() {
  const [candidateId, setCandidateId] = useState<ComparisonCandidate["id"]>("fp-ts");
  const [scenario, setScenario] = useState<ComparisonScenario>("success");
  const [result, setResult] = useState<Awaited<ReturnType<typeof runComparisonScenario>>["actual"]>();
  const [elapsedMs, setElapsedMs] = useState<number>();
  const candidate = comparisonCandidates.find(({ id }) => id === candidateId) ?? fpTsCandidate;
  const displayModel = candidate.derive(samplePayload);

  const run = async () => {
    const started = performance.now();
    const next = await runComparisonScenario(candidate, scenario);
    setElapsedMs(performance.now() - started);
    setResult(next.actual);
  };

  return <section className="comparison-panel">
    <h2>Functional approach comparison</h2>
    <p>Development-only synthetic harness. No Nemlig service or basket is contacted.</p>
    <div className="showcase-controls">
      <label>Approach
        <select value={candidateId} onChange={(event) => { setCandidateId(event.target.value as ComparisonCandidate["id"]); setResult(undefined); }}>
          {comparisonCandidates.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label>Scenario
        <select value={scenario} onChange={(event) => { setScenario(event.target.value as ComparisonScenario); setResult(undefined); }}>
          {scenarios.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => { void run(); }}>Run scenario</button>
    </div>
    <div className="comparison-columns">
      <div>
        <h3>Derived display model</h3>
        <pre>{JSON.stringify(displayModel, null, 2)}</pre>
      </div>
      <div aria-live="polite">
        <h3>End-user state and host trace</h3>
        {result
          ? <><ol>{result.trace.map((event, index) => <li key={`${index}:${event}`}><code>{event}</code></li>)}</ol><p>Local orchestration: {elapsedMs?.toFixed(2)} ms</p></>
          : <p>Choose an approach and scenario, then run it.</p>}
      </div>
    </div>
  </section>;
}

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
      <Comparison />
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
