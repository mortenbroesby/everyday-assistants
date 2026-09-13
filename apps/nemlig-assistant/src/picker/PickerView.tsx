import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { pickerProductEvidence, type PickerPayload, safePickerImageUrl } from "./contract.js";

const kr = (value: number | undefined) => value === undefined ? "" : `${value.toFixed(2).replace(".", ",")} kr.`;

type ProductCardProps = {
  blocked?: boolean;
  choose?: () => void;
  pending?: boolean;
  product: PickerPayload["items"][number]["product"];
  proposed: boolean;
  selected?: boolean;
};

function DetailList({ details }: { details: Array<{ key: string; value: string }> }) {
  return <dl>{details.map(({ key, value }, index) => <div key={`${index}-${key}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function ProductCard({ product, proposed, choose, pending, selected, blocked }: ProductCardProps) {
  const image = safePickerImageUrl(product.image_url);
  const evidence = pickerProductEvidence(product);
  return <article className="picker-card picker-island">
    <div className="picker-product">
      <div className="picker-visual">
        {image ? <img className="picker-image" src={image} alt={`Billede af ${product.name ?? "vare"}`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : <div className="picker-image picker-image-fallback" aria-hidden="true">●</div>}
        <div className="picker-under-image">
          {proposed
            ? <Badge color="success" size="sm">Foreslået</Badge>
            : <Button className="picker-select" color="success" size="lg" gutterSize="sm" pill={false} onClick={choose} loading={pending} disabled={!product.available || blocked || selected}>{selected ? "Valgt" : "Vælg varen"}</Button>}
        </div>
      </div>
      <div className="picker-copy">
        <strong>{product.name ?? "Ukendt vare"}</strong>
        <small>{[product.brand, product.unit_size, product.available ? "Tilgængelig" : "Ikke tilgængelig"].filter(Boolean).join(" · ")}</small>
        <div className="picker-price">
          <strong>{kr(product.price)}</strong>
          {product.unit_price === undefined ? null : <small>{kr(product.unit_price)}/enhed</small>}
        </div>
      </div>
    </div>
    <div className="picker-product-info">
      {evidence.map(({ label, text, details }) => <details key={label}><summary>{label}</summary>{text ? <p>{text}</p> : <DetailList details={details ?? []} />}</details>)}
    </div>
  </article>;
}

export type PickerViewProps = {
  failure?: string;
  onChoose: (id: number, ingredient: string, choice: string) => void;
  payload?: PickerPayload;
  pendingChoice?: string;
  selectedChoice?: string;
};

export function PickerView({ payload, failure, pendingChoice, selectedChoice, onChoose }: PickerViewProps) {
  const itemCount = payload?.items.length;
  return <main className="picker-root" aria-live="polite">
    <header className="picker-header">
      <div><h1>Vælg varer</h1><p>Sammenlign forslag og skift direkte</p></div>
      <span className="picker-count">{itemCount === undefined ? "…" : `${itemCount} ${itemCount === 1 ? "vare" : "varer"}`}</span>
    </header>
    <div className="picker-content">
      {!payload
        ? failure ? null : <p className="picker-empty">Henter varer…</p>
        : !payload.items.length
          ? <p className="picker-empty">{payload.rejected?.length ? `Kunne ikke bekræfte: ${payload.rejected.map(({ ingredient }) => ingredient).join(", ")}` : "Ingen foreslåede varer."}</p>
          : <div className="picker-grid">
            {payload.pantry_assumptions?.length ? <p className="picker-note">Antager allerede: {payload.pantry_assumptions.join(", ")}</p> : null}
            {payload.items.map((item, itemIndex) => <section className="picker-ingredient" key={`${itemIndex}-${item.ingredient}-${item.product.id}`}>
              <div className="picker-section-heading">
                <h2>{item.ingredient} · {item.quantity} stk.</h2>
                <span>{item.confidence}% match {item.favorite_match ? <Badge>favorit</Badge> : null}</span>
              </div>
              <ProductCard product={item.product} proposed />
              {item.alternatives?.length ? <details className="picker-alternatives">
                <summary>Andre muligheder for {item.ingredient} <span>{item.alternatives.length} {item.alternatives.length === 1 ? "vare" : "varer"}</span></summary>
                <div className="picker-grid">{item.alternatives.map((product) => {
                  const choice = `${itemIndex}:${product.id}`;
                  return <ProductCard key={product.id} product={product} proposed={false} pending={pendingChoice === choice} selected={selectedChoice === choice} blocked={Boolean(pendingChoice)} choose={() => onChoose(product.id, item.ingredient, choice)} />;
                })}</div>
              </details> : null}
            </section>)}
            {payload.rejected?.length ? <p className="picker-note">Kunne ikke bekræfte: {payload.rejected.map(({ ingredient }) => ingredient).join(", ")}</p> : null}
          </div>}
      {failure ? <p role="alert">{failure}</p> : null}
    </div>
  </main>;
}
