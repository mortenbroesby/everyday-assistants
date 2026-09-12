import { App } from "@modelcontextprotocol/ext-apps";
import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type PickerPayload, readPickerPayload, safePickerImageUrl } from "./contract.js";
import { createPickerSession } from "./session.js";

const kr = (value: number | undefined) => value === undefined ? "" : `${value.toFixed(2).replace(".", ",")} kr.`;
const applyTheme = (theme: "light" | "dark") => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; };

applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function ProductCard({ product, proposed, choose, pending, selected, blocked }: { product: PickerPayload["items"][number]["product"]; proposed: boolean; choose?: () => void; pending?: boolean; selected?: boolean; blocked?: boolean }) {
  const image = safePickerImageUrl(product.image_url);
  return <article className="picker-card">
    <div className="picker-product">
      {image && <img className="picker-image" src={image} alt={`Billede af ${product.name ?? "vare"}`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
      <div><strong>{product.name ?? "Ukendt vare"}</strong>{product.description && <p>{product.description}</p>}<small>{[product.brand, product.unit_size, product.available ? "Tilgængelig" : "Ikke tilgængelig"].filter(Boolean).join(" · ")}</small></div>
    </div>
    <div className="picker-actions"><strong>{[kr(product.price), product.unit_price === undefined ? "" : `${kr(product.unit_price)}/enhed`].filter(Boolean).join(" · ")}</strong>
      {proposed ? <Badge color="success">Foreslået</Badge> : <Button color="primary" size="2xl" onClick={choose} loading={pending} disabled={!product.available || blocked || selected}>{selected ? "Valgt" : "Vælg dette"}</Button>}
    </div>
  </article>;
}

function Picker() {
  const [payload, setPayload] = useState<PickerPayload>();
  const [failure, setFailure] = useState("");
  const [pendingChoice, setPendingChoice] = useState<string>();
  const [selectedChoice, setSelectedChoice] = useState<string>();
  const pending = useRef(false);
  const current = useRef(0);
  const session = useRef<ReturnType<typeof createPickerSession> | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    const app = new App({ name: "Nemlig Picker", version: "1.0.0" }, {}, { autoResize: false });
    const nextSession = createPickerSession(app as unknown as Parameters<typeof createPickerSession>[0], (result) => {
      current.current += 1;
      pending.current = false;
      setPendingChoice(undefined);
      setSelectedChoice(undefined);
      const nextPayload = readPickerPayload(result);
      setPayload(nextPayload);
      setFailure(nextPayload ? "" : "Forslaget kunne ikke vises.");
    }, applyTheme);
    session.current = nextSession;
    void nextSession.connected.catch(() => { if (mounted) setFailure("Forbindelsen kunne ikke oprettes. Prøv igen."); });
    return () => { mounted = false; current.current += 1; pending.current = false; void nextSession.close(); };
  }, []);
  const choose = (id: number, ingredient: string, choice: string) => {
    if (pending.current || !session.current) return;
    pending.current = true; setPendingChoice(choice); setFailure(""); const generation = current.current;
    void session.current.sendChoice(id, ingredient).then(() => {
      if (generation === current.current) { pending.current = false; setPendingChoice(undefined); setSelectedChoice(choice); }
    }).catch(() => {
      if (generation === current.current) { pending.current = false; setPendingChoice(undefined); setFailure("Valget kunne ikke sendes. Prøv igen."); }
    });
  };
  return <main className="picker-root" aria-live="polite">
    {!payload ? failure ? null : <p className="picker-empty">Henter varer…</p> : !payload.items.length ? <p className="picker-empty">{payload.rejected?.length ? `Kunne ikke bekræfte: ${payload.rejected.map(({ ingredient }) => ingredient).join(", ")}` : "Ingen foreslåede varer."}</p> : <div className="picker-grid">
      {payload.pantry_assumptions?.length ? <p>Antager allerede: {payload.pantry_assumptions.join(", ")}</p> : null}
      {payload.items.map((item, itemIndex) => <section key={`${itemIndex}-${item.ingredient}-${item.product.id}`}><h2>{item.ingredient} · {item.quantity} stk · {item.confidence}% match {item.favorite_match && <Badge>favorit</Badge>}</h2><ProductCard product={item.product} proposed />
        {!!item.alternatives?.length && <details open={item.confidence < 80}><summary>Andre muligheder ({item.alternatives.length})</summary><div className="picker-grid">{item.alternatives.map((product) => {
          const choice = `${itemIndex}:${product.id}`;
          return <ProductCard key={product.id} product={product} proposed={false} pending={pendingChoice === choice} selected={selectedChoice === choice} blocked={Boolean(pendingChoice)} choose={() => choose(product.id, item.ingredient, choice)} />;
        })}</div></details>}
      </section>)}
      {payload.rejected?.length ? <p>Kunne ikke bekræfte: {payload.rejected.map(({ ingredient }) => ingredient).join(", ")}</p> : null}
    </div>}
    {failure && <p role="alert">{failure}</p>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Picker />);
