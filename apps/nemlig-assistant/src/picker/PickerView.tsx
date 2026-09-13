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
  radio?: { checked: boolean; name: string; onChange: () => void };
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
      ? <div className="picker-choice"><input id={choiceId} aria-label={`Choose ${product.name ?? "product"} for ${item.ingredient}`} type="radio" name={radio.name} value={product.id} checked={radio.checked} onChange={radio.onChange} /><label htmlFor={choiceId}>{summary}</label></div>
      : summary}
    <div className="picker-product-info">
      {evidence.map(({ label, text, details }) => <details key={label}><summary>{label}</summary>{text ? <p>{text}</p> : <DetailList details={details ?? []} />}</details>)}
    </div>
  </article>;
}

export type PickerViewProps = {
  choices: Record<number, number>;
  failure?: string;
  onChoice: (itemIndex: number, productId: number) => void;
  onSubmit: () => void;
  payload?: PickerPayload;
  pending?: boolean;
  submitted?: boolean;
};

const copy = {
  proposal: ["Proposed basket", "Real products selected for your list"],
  choices: ["Choose replacements", "Only the products you questioned"],
  recap: ["Final basket review", "One complete recap before approval"],
} as const;

export function PickerView({ payload, failure, choices, onChoice, onSubmit, pending, submitted }: PickerViewProps) {
  const presentation = payload?.presentation ?? "proposal";
  const itemCount = payload?.items.length;
  const [title, subtitle] = copy[presentation];
  return <main className="picker-root" aria-live="polite">
    <header className="picker-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <span className="picker-count">{itemCount === undefined ? "…" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}</span>
    </header>
    <div className="picker-content">
      {!payload
        ? failure ? null : <p className="picker-empty">Loading products…</p>
        : !payload.items.length
          ? <p className="picker-empty">{payload.rejected?.length ? `Could not match: ${payload.rejected.map(({ ingredient }) => ingredient).join(", ")}` : "No proposed products."}</p>
          : <>
            {presentation === "proposal" ? <p className="picker-note">Nothing has been added yet. Tell ChatGPT naturally which choices are wrong and ask it to keep everything else.</p> : null}
            {presentation === "recap" ? <p className="picker-note">Nothing has been added yet. Changed products are marked; everything else stayed as proposed.</p> : null}
            {payload.pantry_assumptions?.length ? <p className="picker-note">Already in the pantry: {payload.pantry_assumptions.join(", ")}</p> : null}
            <div className="picker-grid">
              {payload.items.map((item, itemIndex) => <section className="picker-ingredient" key={`${itemIndex}-${item.ingredient}-${item.product.id}`}>
                <div className="picker-section-heading"><h2>{item.ingredient} · {item.quantity} {item.quantity === 1 ? "package" : "packages"}</h2></div>
                {presentation === "choices"
                  ? <div className="picker-grid">{[item.product, ...(item.alternatives ?? [])].map((product) =>
                    <ProductCard key={product.id} item={item} product={product} radio={{
                      checked: choices[itemIndex] === product.id,
                      name: `picker-choice-${itemIndex}`,
                      onChange: () => onChoice(itemIndex, product.id),
                    }} showMatch={product.id === item.product.id} />)}
                    {!item.alternatives?.length ? <p className="picker-note">No other reliable candidate was found. Ask ChatGPT for a more specific Danish product term, package, or acceptable substitute.</p> : null}
                  </div>
                  : <ProductCard item={item} product={item.product} />}
              </section>)}
            </div>
            {payload.rejected?.length ? <div className="picker-unresolved" role="status">
              <strong>Not matched: {payload.rejected.map(({ ingredient }) => ingredient).join(", ")}</strong>
              <p>Nothing will be added for these lines. Ask ChatGPT with a more specific Danish product term, package, or acceptable substitute.</p>
            </div> : null}
            {presentation === "choices" ? <p className="picker-note">All unchallenged products remain unchanged.</p> : null}
            {presentation !== "proposal" ? <Button className="picker-submit" color="success" size="lg" pill={false} onClick={onSubmit} loading={pending} disabled={pending || submitted}>
              {submitted ? "Sent" : presentation === "choices" ? "Use these choices" : "Add to Nemlig basket"}
            </Button> : null}
            {presentation === "recap" ? <p className="picker-note">Products and basket state will be freshly validated before the first write.</p> : null}
          </>}
      {failure ? <p role="alert">{failure}</p> : null}
    </div>
  </main>;
}
