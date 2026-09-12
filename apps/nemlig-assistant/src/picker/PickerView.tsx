import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { type PickerPayload, safePickerImageUrl } from "./contract.js";

const kr = (value: number | undefined) => value === undefined ? "" : `${value.toFixed(2).replace(".", ",")} kr.`;

type ProductCardProps = {
  blocked?: boolean;
  choose?: () => void;
  pending?: boolean;
  product: PickerPayload["items"][number]["product"];
  proposed: boolean;
  selected?: boolean;
};

function ProductCard({ product, proposed, choose, pending, selected, blocked }: ProductCardProps) {
  const image = safePickerImageUrl(product.image_url);
  return <article className="picker-card">
    <div className="picker-product">
      {image ? <img className="picker-image" src={image} alt={`Billede af ${product.name ?? "vare"}`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
      <div>
        <strong>{product.name ?? "Ukendt vare"}</strong>
        {product.description ? <p>{product.description}</p> : null}
        <small>{[product.brand, product.unit_size, product.available ? "Tilgængelig" : "Ikke tilgængelig"].filter(Boolean).join(" · ")}</small>
      </div>
    </div>
    <div className="picker-actions">
      <strong>{[kr(product.price), product.unit_price === undefined ? "" : `${kr(product.unit_price)}/enhed`].filter(Boolean).join(" · ")}</strong>
      {proposed
        ? <Badge color="success">Foreslået</Badge>
        : <Button color="primary" size="2xl" onClick={choose} loading={pending} disabled={!product.available || blocked || selected}>{selected ? "Valgt" : "Vælg dette"}</Button>}
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
  return <main className="picker-root" aria-live="polite">
    {!payload
      ? failure ? null : <p className="picker-empty">Henter varer…</p>
      : !payload.items.length
        ? <p className="picker-empty">{payload.rejected?.length ? `Kunne ikke bekræfte: ${payload.rejected.map(({ ingredient }) => ingredient).join(", ")}` : "Ingen foreslåede varer."}</p>
        : <div className="picker-grid">
          {payload.pantry_assumptions?.length ? <p>Antager allerede: {payload.pantry_assumptions.join(", ")}</p> : null}
          {payload.items.map((item, itemIndex) => <section key={`${itemIndex}-${item.ingredient}-${item.product.id}`}>
            <h2 className="picker-section-heading">{item.ingredient} · {item.quantity} stk · {item.confidence}% match {item.favorite_match ? <Badge>favorit</Badge> : null}</h2>
            <ProductCard product={item.product} proposed />
            {item.alternatives?.length ? <details open={item.confidence < 80}>
              <summary>Andre muligheder ({item.alternatives.length})</summary>
              <div className="picker-grid">{item.alternatives.map((product) => {
                const choice = `${itemIndex}:${product.id}`;
                return <ProductCard key={product.id} product={product} proposed={false} pending={pendingChoice === choice} selected={selectedChoice === choice} blocked={Boolean(pendingChoice)} choose={() => onChoose(product.id, item.ingredient, choice)} />;
              })}</div>
            </details> : null}
          </section>)}
          {payload.rejected?.length ? <p>Kunne ikke bekræfte: {payload.rejected.map(({ ingredient }) => ingredient).join(", ")}</p> : null}
        </div>}
    {failure ? <p role="alert">{failure}</p> : null}
  </main>;
}
