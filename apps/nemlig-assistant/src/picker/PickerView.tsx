import { useId } from "react";
import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { pickerProductEvidence, type PickerPayload, safePickerImageUrl } from "./contract.js";

const kr = (value: number | undefined) => value === undefined ? "" : `${value.toFixed(2).replace(".", ",")} kr.`;
type Item = PickerPayload["items"][number];
type Product = Item["product"];

function DetailList({ details }: { details: Array<{ key: string; value: string }> }) {
  return <dl>{details.map(({ key, value }, index) => <div key={`${index}-${key}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function ProductCard({ item, product, radio, showMatch = true }: {
  item: Item;
  product: Product;
  radio?: { checked: boolean; name: string; onChange: () => void; disabled?: boolean };
  showMatch?: boolean;
}) {
  const image = safePickerImageUrl(product.image_url);
  const evidence = pickerProductEvidence(product);
  const total = product.price === undefined ? undefined : product.price * item.quantity;
  const choiceId = radio ? `${radio.name}-${product.id}` : undefined;
  const summary = <div className="picker-product">
    <div className="picker-visual">
      {image
        ? <img className="picker-image" src={image} alt={`Billede af ${product.name ?? "vare"}`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />
        : <div className="picker-image picker-image-fallback" aria-hidden="true">●</div>}
    </div>
    <div className="picker-copy">
      <strong>{product.name ?? "Unknown product"}</strong>
      <small>{[product.brand, product.unit_size, `${item.quantity} ${item.quantity === 1 ? "package" : "packages"}`, product.available ? "Available" : "Unavailable"].filter(Boolean).join(" · ")}</small>
      {showMatch ? <div className="picker-badges">
          <Badge color={item.favorite_match ? "success" : "secondary"} size="sm">{item.favorite_match ? "favorite" : "catalogue"}</Badge>
          <Badge color="secondary" size="sm">{item.confidence}% match</Badge>
          {item.changed ? <Badge color="success" size="sm">Changed</Badge> : null}
        </div> : null}
      <div className="picker-price">
        <strong>{kr(total)}</strong>
        {item.quantity > 1 && product.price !== undefined
          ? <small>{item.quantity} × {kr(product.price)}</small>
          : product.unit_price === undefined ? null : <small>{kr(product.unit_price)}/unit</small>}
      </div>
    </div>
  </div>;

  return <article className={`picker-card picker-island${radio?.checked ? " picker-card-selected" : ""}`}>
    {radio
      ? <div className="picker-choice"><input id={choiceId} aria-label={`Choose ${product.name ?? "product"} for ${item.ingredient}`} type="radio" name={radio.name} value={product.id} checked={radio.checked} onChange={radio.onChange} disabled={radio.disabled} /><label htmlFor={choiceId}>{summary}</label></div>
      : summary}
    {evidence.length ? <details className="picker-product-info"><summary>Product details</summary><div>
      {evidence.map(({ label, text, details }) => <details key={label}><summary>{label}</summary>{text ? <p>{text}</p> : <DetailList details={details ?? []} />}</details>)}
    </div></details> : null}
  </article>;
}

export type PickerViewProps = {
  choices: Record<number, number>;
  failure?: string;
  onChoice: (itemIndex: number, productId: number) => void;
  onSubmit: () => void;
  onBack?: () => void;
  onInclude?: (index: number, included: boolean) => void;
  onAlternatives?: (index: number) => void;
  included?: Record<number, boolean>;
  payload?: PickerPayload;
  pending?: boolean;
  submitted?: boolean;
};

const copy = {
  list: ["Shopping list", "Choose what Nemlig should search for"],
  proposal: ["Proposed basket", "Real products selected for your list"],
  choices: ["Choose replacements", "Only the products you questioned"],
  recap: ["Final basket review", "One complete recap before approval"],
} as const;

export function PickerView({ payload, failure, choices, onChoice, onSubmit, onBack, onInclude, onAlternatives, included = {}, pending, submitted }: PickerViewProps) {
  const choiceGroupPrefix = useId();
  const presentation = payload?.presentation ?? "proposal";
  const itemCount = payload?.presentation === "list" ? payload.list.filter((row, index) => included[index] ?? row.included).length : payload?.items.length;
  const [title, subtitle] = copy[presentation];
  const stageIndex = ["list", "proposal", "choices", "recap"].indexOf(presentation);
  const guidance = {
    list: "Check what you need, or tell ChatGPT to add, remove, or adjust an item.",
    proposal: "Choose alternatives here or tell ChatGPT what to change. Happy with these? Continue; Choices is optional.",
    choices: "Select a replacement or tell ChatGPT what you need. Unchallenged products stay unchanged.",
    recap: "Nothing has been added. Review everything, or tell ChatGPT what to adjust before a fresh recap.",
  };
  return <main className="picker-root" aria-live="polite">
    <nav aria-label="Shopping journey"><ol className="picker-steps">{["List", "Proposal", "Choices", "Approve"].map((label, index) => {
      const skipped = index === 2 && presentation === "recap" && payload?.presentation === "recap" && payload.journey?.previous !== "choices";
      const state = index === stageIndex ? "current" : skipped ? "skipped" : index < stageIndex ? "completed" : "upcoming";
      return <li key={label} className={`picker-step picker-step-${state}`} aria-current={state === "current" ? "step" : undefined}>
        <span className="picker-step-number" aria-hidden="true">{index + 1}</span>
        <span>{label}</span><small className="picker-sr-only">{skipped ? "Skipped" : index === 2 && stageIndex < 2 ? "Optional" : state === "completed" ? "Done" : state === "current" ? "Current" : "Next"}</small>
      </li>;
    })}</ol></nav>
    <div className="picker-flow">
    <header className="picker-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <span className="picker-count">{itemCount === undefined ? "…" : `${itemCount} ${presentation === "list" ? "selected" : presentation === "choices" ? itemCount === 1 ? "choice" : "choices" : itemCount === 1 ? "item" : "items"}`}</span>
    </header>
    <div className="picker-content">
      {!payload
        ? failure ? null : <p className="picker-empty">Loading products…</p>
        : payload.presentation === "list" ? <>
          <p className="picker-note picker-list-intro">{guidance.list}</p>
          <div className="picker-list picker-card">{payload.list.map((row, index) => <label className="picker-list-row" key={`${index}-${row.ingredient}`}>
            <input type="checkbox" checked={included[index] ?? row.included} onChange={(event) => onInclude?.(index, event.currentTarget.checked)} disabled={pending || submitted} />
            <strong>{row.ingredient}</strong><span className="picker-have">{(included[index] ?? row.included) ? row.amount : <>Already have<span className="picker-sr-only"> · {row.amount}</span></>}</span>
          </label>)}</div>
        </> : !payload.items.length
          ? <p className="picker-empty">{payload.rejected?.length ? `Could not match: ${payload.rejected.map(({ ingredient }) => ingredient).join(", ")}` : "No proposed products."}</p>
          : <>
            <p className="picker-note">{guidance[payload.presentation]}</p>
            {payload.pantry_assumptions?.length ? <p className="picker-note">Already in the pantry: {payload.pantry_assumptions.join(", ")}</p> : null}
            <div className="picker-grid">
              {payload.items.map((item, itemIndex) => <section className="picker-ingredient" key={`${itemIndex}-${item.ingredient}-${item.product.id}`}>
                {presentation === "choices" ? <div className="picker-section-heading"><h2>{item.ingredient} · {item.quantity} {item.quantity === 1 ? "package" : "packages"}</h2></div> : null}
                {presentation === "choices"
                  ? <div className="picker-grid">{[item.product, ...(item.alternatives ?? [])].map((product) =>
                    <ProductCard key={product.id} item={item} product={product} radio={{
                      checked: choices[itemIndex] === product.id,
                      disabled: pending || submitted,
                      name: `${choiceGroupPrefix}-picker-choice-${itemIndex}`,
                      onChange: () => onChoice(itemIndex, product.id),
                    }} showMatch={product.id === item.product.id} />)}
                    {!item.alternatives?.length ? <p className="picker-note">No other reliable candidate was found. Ask ChatGPT for a more specific Danish product term, package, or acceptable substitute.</p> : null}
                  </div>
                  : <><ProductCard item={item} product={item.product} />
                    {presentation === "proposal" && item.alternatives?.length ? <Button className="picker-alternatives" color="secondary" variant="outline" size="md" pill={false} onClick={() => onAlternatives?.(itemIndex)} disabled={pending || submitted}>Choose alternatives</Button> : null}</>}
              </section>)}
            </div>
            {payload.rejected?.length ? <div className="picker-unresolved" role="status">
              <strong>Not matched: {payload.rejected.map(({ ingredient }) => ingredient).join(", ")}</strong>
              <p>Nothing will be added for these lines. Ask ChatGPT with a more specific Danish product term, package, or acceptable substitute.</p>
            </div> : null}
            {presentation === "recap" ? <p className="picker-note">Products and basket state will be freshly validated before the first write.</p> : null}
          </>}
      {failure ? <p role="alert">{failure}</p> : null}
    </div>
    {payload ? <footer className="picker-actions">
      {presentation !== "list" ? <Button className="picker-back" color="secondary" variant="outline" size="lg" pill={false} onClick={onBack} disabled={pending || submitted}>
        {presentation === "proposal" ? "Back to shopping list" : presentation === "choices" ? "Back to proposal" : "Back"}
      </Button> : null}
      <Button className="picker-submit" color="success" size="lg" pill={false} onClick={onSubmit} loading={pending} disabled={pending || submitted || !itemCount}>
        {submitted ? "Sent" : presentation === "list" ? "Search selected items with Nemlig" : presentation === "proposal" ? "Continue to final review" : presentation === "choices" ? "Use these choices" : "Add to Nemlig basket"}
      </Button>
    </footer> : null}
    </div>
  </main>;
}
