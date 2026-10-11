import styled from "@emotion/styled";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import type { ProductView } from "../../product-presentation.js";
import { safeNemligImageUrl } from "../../product-presentation.js";
import { ViewerButton } from "./button.js";
import { isUsable, money, productName } from "./format.js";

type SummaryLayout = "row" | "detail";
type CompleteProductView = Extract<ProductView, { status: "complete" }>;
type CompleteProduct = CompleteProductView["product"];

const SummaryContent = styled.span<{
  $fillImageToRow: boolean;
  $layout: SummaryLayout;
}>(({ $fillImageToRow, $layout }) => ({
  display: "grid",
  width: "100%",
  minWidth: 0,
  gridTemplateColumns:
    $layout === "detail"
      ? "minmax(0, 1fr)"
      : $fillImageToRow
        ? "80px minmax(0, 1fr)"
        : "58px minmax(0, 1fr)",
  alignItems:
    $layout === "detail" ? "start" : $fillImageToRow ? "stretch" : "start",
  gap: $layout === "detail" ? 16 : 12,
  "@media (max-width: 360px)": {
    gridTemplateColumns:
      $layout === "detail"
        ? "minmax(0, 1fr)"
        : $fillImageToRow
          ? "70px minmax(0, 1fr)"
          : "52px minmax(0, 1fr)",
  },
}));
const ProductVisual = styled.span<{
  $fillImageToRow: boolean;
  $layout: SummaryLayout;
}>(({ $fillImageToRow, $layout }) => ({
  display: "grid",
  position: "relative",
  minHeight: 58,
  minWidth: 0,
  width: $layout === "detail" ? "min(100%, 240px)" : undefined,
  aspectRatio: $layout === "detail" ? "1" : undefined,
  justifySelf: $layout === "detail" ? "center" : undefined,
  alignSelf:
    $layout === "detail" ? "start" : $fillImageToRow ? "stretch" : "start",
  background: "var(--soft)",
  overflow: "hidden",
  "@media (max-width: 360px)": {
    minHeight: 52,
  },
}));
const ProductImage = styled.img({
  position: "absolute",
  inset: 0,
  display: "block",
  width: "100%",
  height: "100%",
  border: 0,
  objectFit: "cover",
  fontSize: ".65rem",
});
const ImageFallback = styled.span({
  position: "absolute",
  inset: 0,
  display: "grid",
  width: "100%",
  height: "100%",
  placeItems: "center",
  color: "var(--muted)",
  textAlign: "center",
  fontSize: ".65rem",
});
const ProductCopy = styled.span({ display: "grid", minWidth: 0, gap: 3 });
const ProductHeading = styled.span({
  "& strong": {
    display: "-webkit-box",
    minWidth: 0,
    overflowWrap: "anywhere",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: ".9rem",
    lineHeight: 1.35,
    fontWeight: 650,
  },
});
const ProductPrice = styled.span({
  fontSize: ".9rem",
  fontWeight: 650,
  fontVariantNumeric: "tabular-nums",
});
const ProductMeta = styled.span({
  color: "var(--muted)",
  fontSize: ".76rem",
  lineHeight: 1.4,
  overflowWrap: "anywhere",
});
const ProductQuantity = styled.span({
  width: "100%",
  marginTop: 2,
  color: "var(--accent)",
  fontSize: ".8rem",
  fontWeight: 650,
  textAlign: "right",
});
const Chips = styled.span({
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  marginTop: 2,
});
const QuantityControlRoot = styled.div({
  display: "grid",
  width: "100%",
  gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  padding: "8px 0",
  borderTop: "1px solid var(--line)",
  borderBottom: "1px solid var(--line)",
  fontSize: ".82rem",
  "& > :first-child": { gridColumn: "1 / -1" },
  "& button": { width: "100%", minHeight: 40, padding: 0 },
  "& [aria-live]": {
    width: 28,
    textAlign: "center",
    fontWeight: 650,
    fontVariantNumeric: "tabular-nums",
  },
});
const Fact = styled.details({
  padding: 0,
  borderBottom: "1px solid var(--line)",
});
const FactSummary = styled.summary({
  display: "flex",
  minHeight: 40,
  alignItems: "center",
  listStyle: "none",
  cursor: "pointer",
  fontSize: ".82rem",
  fontWeight: 650,
  "&::-webkit-details-marker": { display: "none" },
  "&::after": {
    marginLeft: "auto",
    content: '"+"',
    color: "var(--muted)",
    fontSize: "1.15rem",
    fontWeight: 400,
  },
  "details[open] > &::after": { content: '"−"' },
});
const FactBody = styled.p({
  margin: 0,
  padding: "0 0 10px",
  color: "var(--muted)",
  fontSize: ".8rem",
  lineHeight: 1.45,
});
const FactList = styled.dl({ display: "grid", gap: 8, margin: 0 });
const FactListItem = styled.div({
  display: "grid",
  gap: 2,
  "& dt": { color: "var(--muted)", fontSize: ".8rem", fontWeight: 600 },
  "& dd": { margin: 0 },
});

/** Full-width product summary with the same compact hierarchy in every view. */
export const ProductSummaryButton = styled(ViewerButton)({
  display: "block",
  width: "100%",
  minWidth: 0,
  minHeight: 62,
  padding: "1px 0",
  border: 0,
  borderRadius: 12,
  color: "inherit",
  background: "transparent",
  textAlign: "left",
  whiteSpace: "normal",
  "&:hover:not(:disabled)": { background: "var(--soft)" },
});

function StatusChip({ children }: { children: string }) {
  return (
    <StatusChipVisual data-viewer-component="status-chip">
      {children}
    </StatusChipVisual>
  );
}

const StatusChipVisual = styled.span({
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  minHeight: 20,
  padding: "2px 6px",
  borderRadius: 999,
  color: "var(--accent)",
  background: "var(--soft)",
  fontSize: ".7rem",
  fontWeight: 650,
  lineHeight: 1,
});

function ProductStatusChips({ view }: { view: ProductView }) {
  if (view.status !== "complete") {
    return null;
  }
  const product = view.product;
  const chips = [
    product.is_organic === true && "Organic",
    product.is_frozen === true && "Frozen",
    product.is_on_discount === true && "Offer",
    product.available === false && "Unavailable",
    product.available === undefined && "Availability unknown",
  ].filter((chip): chip is string => Boolean(chip));
  return chips.length ? (
    <Chips>
      {chips.map((chip) => (
        <StatusChip key={chip}>{chip}</StatusChip>
      ))}
    </Chips>
  ) : null;
}

function ProductVisualImage({
  image,
  alt,
  fillImageToRow,
  layout,
}: {
  image?: string;
  alt: string;
  fillImageToRow: boolean;
  layout: SummaryLayout;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <ProductVisual $fillImageToRow={fillImageToRow} $layout={layout}>
      {image && !imageFailed ? (
        <ProductImage
          src={image}
          draggable={false}
          alt={alt}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ImageFallback
          data-viewer-component="image-fallback"
          aria-hidden="true"
        >
          No image
        </ImageFallback>
      )}
    </ProductVisual>
  );
}

function lineTotal(price: number | undefined, quantity: number | undefined) {
  return quantity !== undefined && typeof price === "number"
    ? quantity * price
    : price;
}

function productPackage(product: CompleteProduct) {
  return (
    [product.brand, product.unit_size].filter(Boolean).join(" · ") ||
    "Package details unavailable"
  );
}

function productUnitPrice(product: CompleteProduct) {
  if (product.unit_price === undefined) {
    return product.unit ?? "Unit price unavailable";
  }
  return `${money(product.unit_price)}${product.unit ? ` · ${product.unit}` : ""}`;
}

function CompleteProductSummary({
  view,
  quantity,
  thumbnailSrc,
  fillImageToRow,
  layout,
}: {
  view: CompleteProductView;
  quantity?: number;
  thumbnailSrc?: string;
  fillImageToRow: boolean;
  layout: SummaryLayout;
}) {
  const product = view.product;

  return (
    <SummaryContent $fillImageToRow={fillImageToRow} $layout={layout}>
      <ProductVisualImage
        image={thumbnailSrc ?? safeNemligImageUrl(product.image_url)}
        alt={product.name ?? "Product"}
        fillImageToRow={fillImageToRow}
        layout={layout}
      />
      <ProductCopy>
        <ProductHeading>
          <strong>{productName(view)}</strong>
        </ProductHeading>
        <ProductPrice data-viewer-component="product-price">
          {money(lineTotal(product.price, quantity))}
        </ProductPrice>
        <ProductMeta>{productPackage(product)}</ProductMeta>
        <ProductMeta>{productUnitPrice(product)}</ProductMeta>
        {quantity !== undefined && (
          <ProductQuantity data-viewer-component="product-quantity">
            {quantity} ×
          </ProductQuantity>
        )}
        <ProductStatusChips view={view} />
      </ProductCopy>
    </SummaryContent>
  );
}

export function ProductSummary({
  view,
  quantity,
  thumbnailSrc,
  fillImageToRow = false,
  layout = "row",
}: {
  view: ProductView;
  quantity?: number;
  thumbnailSrc?: string;
  fillImageToRow?: boolean;
  layout?: SummaryLayout;
}) {
  if (view.status !== "complete") {
    return (
      <span>Product {view.product_id ?? "details"} details unavailable.</span>
    );
  }
  return (
    <CompleteProductSummary
      view={view}
      quantity={quantity}
      thumbnailSrc={thumbnailSrc}
      fillImageToRow={fillImageToRow}
      layout={layout}
    />
  );
}

export function QuantityControl({
  label,
  quantity,
  disabled,
  onQuantity,
}: {
  label: string;
  quantity: number;
  disabled: boolean;
  onQuantity?: (quantity: number) => void;
}) {
  return (
    <QuantityControlRoot
      className="product-action-quantity"
      data-viewer-component="quantity-control"
    >
      <span className="product-action-quantity-label">Quantity</span>
      <ViewerButton
        className="product-action-quantity-button"
        color="secondary"
        aria-label={`Decrease quantity of ${label}`}
        disabled={disabled || quantity <= 1}
        onClick={() => onQuantity?.(quantity - 1)}
      >
        −
      </ViewerButton>
      <span className="product-action-quantity-value" aria-live="polite">
        {quantity}
      </span>
      <ViewerButton
        className="product-action-quantity-button"
        color="secondary"
        aria-label={`Increase quantity of ${label}`}
        disabled={disabled || quantity >= Number.MAX_SAFE_INTEGER}
        onClick={() => onQuantity?.(quantity + 1)}
      >
        +
      </ViewerButton>
    </QuantityControlRoot>
  );
}

type ProductFact = { key: string; content: ReactNode };

function productFacts(product: CompleteProduct): ProductFact[] {
  const suppliedDetails =
    product.details?.filter((fact) => fact.key.trim() && fact.value.trim()) ??
    [];
  const facts: ProductFact[] = [];
  if (product.description) {
    facts.push({
      key: "Varebeskrivelse",
      content: <FactBody>{product.description}</FactBody>,
    });
  }
  if (product.declaration) {
    facts.push({
      key: "Varedeklaration",
      content: <FactBody>{product.declaration}</FactBody>,
    });
  }
  if (suppliedDetails.length > 0) {
    facts.push({
      key: "Detaljer om varen",
      content: (
        <FactList>
          {suppliedDetails.map(({ key, value }) => (
            <FactListItem key={`${key}:${value}`}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </FactListItem>
          ))}
        </FactList>
      ),
    });
  }
  return facts;
}

function selectAdjacentFact(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  facts: ProductFact[],
  setActiveFact: (key: string) => void,
) {
  const direction =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (direction === 0) {
    return;
  }
  event.preventDefault();
  const nextIndex = (index + direction + facts.length) % facts.length;
  setActiveFact(facts[nextIndex]!.key);
  document.getElementById(`product-fact-tab-${nextIndex}`)?.focus();
}

function ProductFactTabs({ facts }: { facts: ProductFact[] }) {
  const [activeFact, setActiveFact] = useState<string>();
  const selectedFact =
    facts.find((fact) => fact.key === activeFact) ?? facts[0];
  if (!selectedFact) {
    return null;
  }
  const selectedIndex = facts.indexOf(selectedFact);
  return (
    <section className="product-fact-tabs" aria-label="Product information">
      <div
        className="product-fact-tablist"
        role="tablist"
        aria-label="Product information sections"
      >
        {facts.map((fact, index) => {
          const selected = fact.key === selectedFact.key;
          return (
            <button
              key={fact.key}
              className="product-fact-tab"
              id={`product-fact-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="product-fact-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveFact(fact.key)}
              onKeyDown={(event) =>
                selectAdjacentFact(event, index, facts, setActiveFact)
              }
            >
              {fact.key}
            </button>
          );
        })}
      </div>
      <div
        id="product-fact-panel"
        className="product-fact-panel"
        role="tabpanel"
        aria-labelledby={`product-fact-tab-${selectedIndex}`}
      >
        {selectedFact.content}
      </div>
    </section>
  );
}

function ProductFactDisclosures({
  facts,
  expandedFacts,
  onFactExpandedChange,
}: {
  facts: ProductFact[];
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
}) {
  return (
    <>
      {facts.map((fact) => (
        <Fact
          key={fact.key}
          data-viewer-component="product-fact"
          open={expandedFacts?.has(fact.key)}
          onToggle={
            onFactExpandedChange
              ? (event) =>
                  onFactExpandedChange(fact.key, event.currentTarget.open)
              : undefined
          }
        >
          <FactSummary>{fact.key}</FactSummary>
          {fact.content}
        </Fact>
      ))}
    </>
  );
}

export function ProductFacts({
  view,
  expandedFacts,
  onFactExpandedChange,
  variant = "disclosures",
}: {
  view: ProductView;
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
  variant?: "disclosures" | "tabs";
}) {
  if (view.status !== "complete") {
    return null;
  }
  const facts = productFacts(view.product);
  return variant === "tabs" ? (
    <ProductFactTabs facts={facts} />
  ) : (
    <ProductFactDisclosures
      facts={facts}
      expandedFacts={expandedFacts}
      onFactExpandedChange={onFactExpandedChange}
    />
  );
}

export { isUsable, money, productName };
