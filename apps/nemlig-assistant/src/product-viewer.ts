import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ProductView } from './product-presentation.js';
import { PRODUCT_VIEWER_RESOURCE_URI } from './product-viewer-identity.js';

export { PRODUCT_VIEWER_RESOURCE_URI } from './product-viewer-identity.js';
export const PRODUCT_VIEWER_MIME_TYPE = 'text/html;profile=mcp-app';
export const PRODUCT_VIEWER_BUILD_MARKER = 'draft-list-stable-1';
export const PRODUCT_VIEWER_RESOURCE_DOMAINS = Object.freeze([
  'https://nemlig.com',
  'https://www.nemlig.com',
]);

/** Metadata shared by MCP tool registrations when they advertise the viewer. */
export const PRODUCT_VIEWER_RESOURCE_METADATA = Object.freeze({
  ui: Object.freeze({ resourceUri: PRODUCT_VIEWER_RESOURCE_URI }),
  'openai/outputTemplate': PRODUCT_VIEWER_RESOURCE_URI,
});

const formatNumber = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;

const formatMoney = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown price';
  }
  return `${value.toFixed(2)} kr`;
};

const formatProduct = (view: ProductView): string => {
  if (view.status !== 'complete') {
    return view.product_id === undefined
      ? 'Product details unavailable.'
      : `Product ${view.product_id} details unavailable.`;
  }
  const product = view.product;
  const facts = [
    product.name ?? 'Unnamed product',
    product.brand,
    `${formatMoney(product.price)}${product.currency ? ` ${product.currency}` : ''}`,
    product.unit,
    product.unit_size,
    product.available === undefined
      ? 'availability unknown'
      : product.available
        ? 'available'
        : 'unavailable',
  ].filter((value): value is string => Boolean(value));
  const labels = product.labels.length
    ? `labels: ${product.labels.join(', ')}`
    : '';
  const classifications = [
    product.is_organic === undefined
      ? undefined
      : `organic ${product.is_organic ? 'yes' : 'no'}`,
    product.is_frozen === undefined
      ? undefined
      : `frozen ${product.is_frozen ? 'yes' : 'no'}`,
    product.is_on_discount === undefined
      ? undefined
      : `on discount ${product.is_on_discount ? 'yes' : 'no'}`,
  ]
    .filter(Boolean)
    .join('; ');
  const category = [product.category, product.subcategory]
    .filter((value) => value?.trim())
    .join(' / ');
  const context =
    view.context === 'basket'
      ? `Nemlig basket quantity ${formatNumber(view.basket?.quantity) ?? 'unknown'}; line total ${formatMoney(view.basket?.line_total)}`
      : view.context === 'review'
        ? `draft list quantity ${formatNumber(view.review?.quantity) ?? 'unknown'}; line total ${formatMoney(view.review?.line_total)}; approved ${view.review?.approved === true ? 'yes' : 'no'}`
        : '';
  const details = product.details?.length
    ? product.details.map(({ key, value }) => `${key}: ${value}`).join('; ')
    : '';
  const description = product.description
    ? `description: ${product.description}`
    : '';
  const declaration = product.declaration
    ? `declaration: ${product.declaration}`
    : '';
  const unitPrice =
    product.unit_price === undefined
      ? ''
      : `unit price ${formatMoney(product.unit_price)} ${product.currency}${product.unit ? ` (${product.unit})` : ''}`;
  const content = [
    category ? `category: ${category}` : '',
    classifications,
    unitPrice,
    labels,
    context,
    description,
    declaration,
    details,
  ].filter(Boolean);
  return `${facts.join(' — ')}${content.length ? `; ${content.join('; ')}` : ''}.`;
};

/** Complete headless result retained when the host cannot display the UI resource. */
export function productViewsToText(views: readonly ProductView[]): string {
  if (!views.length) {
    return 'No products found.';
  }
  return views
    .map((view, index) => `${index + 1}. ${formatProduct(view)}`)
    .join('\n');
}

export interface ProductViewerArtifact {
  readonly html: string;
  /** SHA-256 of the exact self-contained HTML returned by the current resource. */
  readonly artifactId: string;
}

/** Reads the exact self-contained artifact included in the package. */
export function readProductViewerArtifact(): ProductViewerArtifact {
  const builtArtifact = new URL('./picker.html', import.meta.url);
  const sourceTestArtifact = new URL('../dist/picker.html', import.meta.url);
  const path = existsSync(builtArtifact) ? builtArtifact : sourceTestArtifact;
  try {
    const html = readFileSync(fileURLToPath(path), 'utf8');
    return {
      html,
      artifactId: createHash('sha256').update(html).digest('hex'),
    };
  } catch {
    throw new Error(
      'The React product viewer is not built. Run `pnpm build` before starting the MCP server.',
    );
  }
}

/** Serves the exact self-contained artifact included in the package. */
export function renderProductViewerHtml(): string {
  return readProductViewerArtifact().html;
}
