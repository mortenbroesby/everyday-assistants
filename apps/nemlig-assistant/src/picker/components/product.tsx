import styled from '@emotion/styled';
import { useState } from 'react';
import type { ProductView } from '../../product-presentation.js';
import { safeNemligImageUrl } from '../../product-presentation.js';
import { ViewerButton } from './button.js';
import { isUsable, money, productName } from './format.js';

const SummaryContent = styled.span({
  display: 'grid',
  width: '100%',
  minWidth: 0,
  gridTemplateColumns: '58px minmax(0, 1fr)',
  alignItems: 'start',
  gap: 9,
  '@media (max-width: 360px)': { gridTemplateColumns: '52px minmax(0, 1fr)' },
});
const ProductImage = styled.img({
  display: 'grid',
  width: 58,
  height: 58,
  placeItems: 'center',
  border: 0,
  borderRadius: 14,
  background: 'var(--soft)',
  objectFit: 'contain',
  fontSize: '.65rem',
  '@media (max-width: 360px)': { width: 52, height: 52, borderRadius: 13 },
});
const ImageFallback = styled.span({
  display: 'grid',
  width: 58,
  height: 58,
  placeItems: 'center',
  borderRadius: 14,
  background: 'var(--soft)',
  color: 'var(--muted)',
  textAlign: 'center',
  fontSize: '.65rem',
  '@media (max-width: 360px)': { width: 52, height: 52, borderRadius: 13 },
});
const ProductCopy = styled.span({ display: 'grid', minWidth: 0, gap: 3 });
const ProductHeading = styled.span({
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  gap: 8,
  '& strong': {
    minWidth: 0,
    overflowWrap: 'anywhere',
    fontSize: '.92rem',
    lineHeight: 1.35,
    fontWeight: 650,
  },
  '& > span': {
    flex: 'none',
    fontSize: '.9rem',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
  '@media (max-width: 360px)': {
    display: 'grid',
    gap: 2,
    '& > span': { textAlign: 'left' },
  },
});
const ProductMeta = styled.span({
  color: 'var(--muted)',
  fontSize: '.76rem',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
});
const ProductQuantity = styled.span({
  justifySelf: 'start',
  marginTop: 2,
  color: 'var(--accent)',
  fontSize: '.8rem',
  fontWeight: 650,
});
const Chips = styled.span({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 2,
});
const QuantityControlRoot = styled.div({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
  justifyContent: 'space-between',
  padding: '8px 0',
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  fontSize: '.82rem',
  '& > :first-child': { marginRight: 'auto' },
  '& button': { minWidth: 34, minHeight: 34, padding: 0 },
  '& [aria-live]': {
    width: 28,
    textAlign: 'center',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
});
const Fact = styled.details({
  padding: 0,
  borderBottom: '1px solid var(--line)',
});
const FactSummary = styled.summary({
  display: 'flex',
  minHeight: 40,
  alignItems: 'center',
  listStyle: 'none',
  cursor: 'pointer',
  fontSize: '.82rem',
  fontWeight: 650,
  '&::-webkit-details-marker': { display: 'none' },
  '&::after': {
    marginLeft: 'auto',
    content: '"+"',
    color: 'var(--muted)',
    fontSize: '1.15rem',
    fontWeight: 400,
  },
  'details[open] > &::after': { content: '"−"' },
});
const FactBody = styled.p({
  margin: 0,
  padding: '0 0 10px',
  color: 'var(--muted)',
  fontSize: '.8rem',
  lineHeight: 1.45,
});
const FactList = styled.dl({ display: 'grid', gap: 8, margin: 0 });
const FactListItem = styled.div({
  display: 'grid',
  gap: 2,
  '& dt': { color: 'var(--muted)', fontSize: '.8rem', fontWeight: 600 },
  '& dd': { margin: 0 },
});

/** Full-width product disclosure with the same compact hierarchy in every view. */
export const ProductSummaryButton = styled(ViewerButton)({
  display: 'block',
  width: '100%',
  minWidth: 0,
  minHeight: 62,
  padding: '1px 0',
  border: 0,
  borderRadius: 12,
  color: 'inherit',
  background: 'transparent',
  textAlign: 'left',
  whiteSpace: 'normal',
  '&:hover:not(:disabled)': { background: 'var(--soft)' },
});

function StatusChip({ children }: { children: string }) {
  return (
    <StatusChipVisual data-viewer-component="status-chip">
      {children}
    </StatusChipVisual>
  );
}

const StatusChipVisual = styled.span({
  display: 'inline-flex',
  width: 'fit-content',
  alignItems: 'center',
  minHeight: 20,
  padding: '2px 6px',
  borderRadius: 999,
  color: 'var(--accent)',
  background: 'var(--soft)',
  fontSize: '.68rem',
  fontWeight: 650,
  lineHeight: 1,
});

function ProductStatusChips({ view }: { view: ProductView }) {
  if (view.status !== 'complete') {
    return null;
  }
  const product = view.product;
  const chips = [
    product.is_organic === true && 'Organic',
    product.is_frozen === true && 'Frozen',
    product.is_on_discount === true && 'Offer',
    product.available === false && 'Unavailable',
    product.available === undefined && 'Availability unknown',
  ].filter((chip): chip is string => Boolean(chip));
  return chips.length ? (
    <Chips>
      {chips.map((chip) => (
        <StatusChip key={chip}>{chip}</StatusChip>
      ))}
    </Chips>
  ) : null;
}

export function ProductSummary({
  view,
  quantity,
}: {
  view: ProductView;
  quantity?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  if (view.status !== 'complete') {
    return (
      <span>Product {view.product_id ?? 'details'} details unavailable.</span>
    );
  }

  const product = view.product;
  const image = safeNemligImageUrl(product.image_url);
  const quantityTotal =
    quantity !== undefined && typeof product.price === 'number'
      ? quantity * product.price
      : product.price;

  return (
    <SummaryContent>
      {image && !imageFailed ? (
        <ProductImage
          src={image}
          alt={product.name ?? 'Product'}
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
      <ProductCopy>
        <ProductHeading>
          <strong>{productName(view)}</strong>
          <span>{money(quantityTotal)}</span>
        </ProductHeading>
        <ProductMeta>
          {[product.brand, product.unit_size].filter(Boolean).join(' · ') ||
            'Package details unavailable'}
        </ProductMeta>
        <ProductMeta>
          {product.unit_price === undefined
            ? (product.unit ?? 'Unit price unavailable')
            : `${money(product.unit_price)}${product.unit ? ` · ${product.unit}` : ''}`}
        </ProductMeta>
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
    <QuantityControlRoot data-viewer-component="quantity-control">
      <span>Quantity</span>
      <ViewerButton
        color="secondary"
        aria-label={`Decrease quantity of ${label}`}
        disabled={disabled || quantity <= 1}
        onClick={() => onQuantity?.(quantity - 1)}
      >
        −
      </ViewerButton>
      <span aria-live="polite">{quantity}</span>
      <ViewerButton
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

export function ProductFacts({
  view,
  expandedFacts,
  onFactExpandedChange,
}: {
  view: ProductView;
  expandedFacts?: ReadonlySet<string>;
  onFactExpandedChange?: (factKey: string, expanded: boolean) => void;
}) {
  if (view.status !== 'complete') {
    return null;
  }
  const product = view.product;
  const suppliedDetails =
    product.details?.filter((fact) => fact.key.trim() && fact.value.trim()) ??
    [];
  return (
    <>
      {product.description && (
        <Fact
          data-viewer-component="product-fact"
          open={expandedFacts?.has('Varebeskrivelse')}
          onToggle={
            onFactExpandedChange
              ? (event) =>
                  onFactExpandedChange(
                    'Varebeskrivelse',
                    event.currentTarget.open,
                  )
              : undefined
          }
        >
          <FactSummary>Varebeskrivelse</FactSummary>
          <FactBody>{product.description}</FactBody>
        </Fact>
      )}
      {product.declaration && (
        <Fact
          data-viewer-component="product-fact"
          open={expandedFacts?.has('Varedeklaration')}
          onToggle={
            onFactExpandedChange
              ? (event) =>
                  onFactExpandedChange(
                    'Varedeklaration',
                    event.currentTarget.open,
                  )
              : undefined
          }
        >
          <FactSummary>Varedeklaration</FactSummary>
          <FactBody>{product.declaration}</FactBody>
        </Fact>
      )}
      {suppliedDetails.length > 0 && (
        <Fact
          data-viewer-component="product-fact"
          open={expandedFacts?.has('Detaljer om varen')}
          onToggle={
            onFactExpandedChange
              ? (event) =>
                  onFactExpandedChange(
                    'Detaljer om varen',
                    event.currentTarget.open,
                  )
              : undefined
          }
        >
          <FactSummary>Detaljer om varen</FactSummary>
          <FactList>
            {suppliedDetails.map(({ key, value }) => (
              <FactListItem key={`${key}:${value}`}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </FactListItem>
            ))}
          </FactList>
        </Fact>
      )}
    </>
  );
}

export { isUsable, money, productName };
