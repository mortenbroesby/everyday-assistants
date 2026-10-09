import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import type { ProductView } from "../../product-presentation.js";
import {
  ActionFooter,
  DestinationTabs,
  DraftListStarters,
  OutcomeSurface,
  ProductFacts,
  ProductSummary,
  ProductSummaryButton,
  QuantityControl,
  ViewerButton,
  ViewerShell,
} from "./index.js";

const milk: ProductView = {
  context: "review",
  status: "complete",
  product: {
    id: 1,
    name: "Arla ØKO Minimælk",
    brand: "Arla",
    unit_size: "1 L",
    price: 12.95,
    unit_price: 12.95,
    unit: "kr/L",
    currency: "DKK",
    description: "Økologisk minimælk til morgenmad, kaffe og madlavning.",
    declaration: "MÆLK, 1,5 % fedt.",
    details: [
      { key: "Oprindelsesland", value: "Danmark" },
      { key: "Opbevaring", value: "Opbevares køligt" },
    ],
    available: true,
    is_organic: true,
    is_frozen: false,
    is_on_discount: true,
    image_url: undefined,
    labels: ["Økologisk", "Tilbud"],
    tags: ["organic"],
  },
  review: { kind: "review", quantity: 2, line_total: 25.9, approved: false },
};

const unavailable: ProductView = {
  context: "review",
  status: "unavailable",
  product_id: 99,
};

function Frame({
  children,
  width = 375,
}: {
  children: ReactNode;
  width?: number;
}) {
  return (
    <ViewerShell title="Draft list" maxWidth={width}>
      {children}
    </ViewerShell>
  );
}

function ProductRow({
  view = milk,
  quantity = 2,
  expanded = false,
  ready = false,
}: {
  view?: ProductView;
  quantity?: number;
  expanded?: boolean;
  ready?: boolean;
}) {
  const name =
    view.status === "complete" ? (view.product.name ?? "Product") : "Product";
  return (
    <article className="product-card">
      {!ready && (
        <label className="product-select">
          <input type="checkbox" aria-label={`Select ${name}`} />
        </label>
      )}
      <div className="product-details">
        <ProductSummaryButton
          color="secondary"
          variant="ghost"
          aria-expanded={expanded}
        >
          <ProductSummary view={view} quantity={quantity} />
        </ProductSummaryButton>
        {expanded && (
          <div className="product-expanded">
            <ProductFacts
              view={view}
              expandedFacts={new Set(["Varebeskrivelse"])}
            />
            <QuantityControl
              label={name}
              quantity={quantity}
              disabled={false}
            />
            {!ready && (
              <div className="review-controls">
                <ViewerButton color="secondary">
                  Choose alternative
                </ViewerButton>
              </div>
            )}
          </div>
        )}
        {ready && (
          <QuantityControl label={name} quantity={quantity} disabled={false} />
        )}
      </div>
    </article>
  );
}

function AlternativeRow({ selected = false }: { selected?: boolean }) {
  return (
    <article className="product-card product-comparison">
      <div className="product-details">
        <button
          className="product-comparison-summary alternative-choice"
          type="button"
          role="radio"
          aria-checked={selected}
        >
          <ProductSummary view={milk} quantity={1} />
          <span className="alternative-choice-state" aria-hidden="true">
            {selected ? "Selected" : "Select"}
          </span>
        </button>
        <div className="product-expanded">
          <ProductFacts
            view={milk}
            expandedFacts={new Set(["Varebeskrivelse"])}
          />
        </div>
      </div>
    </article>
  );
}

const meta = {
  title: "Picker/Visual contract",
  parameters: {
    docs: {
      description: {
        component:
          "Deterministic component fixtures for visual review. These stories do not initialize the MCP Apps bridge or prove ChatGPT-host behavior.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ToDecideAt320: Story = {
  render: () => (
    <Frame width={320}>
      <p className="intro">
        Select products to move them into Ready. Open a product for details.
      </p>
      <DestinationTabs
        destination="needs-review"
        toDecideCount={2}
        readyCount={1}
        hasAlternatives={false}
        disabled={false}
        onNavigate={() => undefined}
      />
      <section className="product-list">
        <ProductRow expanded />
        <ProductRow quantity={1} />
      </section>
      <ActionFooter>
        <ViewerButton color="secondary">Select all</ViewerButton>
        <ViewerButton color="primary">Add selected to Ready</ViewerButton>
      </ActionFooter>
    </Frame>
  ),
};

export const ReadyAt375: Story = {
  render: () => (
    <Frame>
      <p className="intro">
        Adjust quantities directly. Open a product to move it back or remove it.
      </p>
      <DestinationTabs
        destination="ready"
        toDecideCount={2}
        readyCount={1}
        hasAlternatives={false}
        disabled={false}
        onNavigate={() => undefined}
      />
      <section className="product-list">
        <ProductRow ready />
      </section>
      <ActionFooter>
        <ViewerButton color="primary">Send to Nemlig basket</ViewerButton>
      </ActionFooter>
    </Frame>
  ),
};

export const EverythingReady: Story = {
  render: () => (
    <Frame>
      <p className="intro">
        All products are Ready for your final check. Nothing has been added to
        Nemlig.
      </p>
      <DestinationTabs
        destination="needs-review"
        toDecideCount={0}
        readyCount={2}
        hasAlternatives={false}
        disabled={false}
        onNavigate={() => undefined}
      />
      <OutcomeSurface title="Ready for your final check">
        <p>
          Review the local Ready products before deciding whether to add them to
          Nemlig.
        </p>
        <ViewerButton color="primary">View Ready products</ViewerButton>
      </OutcomeSurface>
    </Frame>
  ),
};

export const Alternatives: Story = {
  render: () => (
    <Frame>
      <p className="intro">
        Choose an alternative without accepting it into Ready.
      </p>
      <section className="alternatives-current">
        <h2>Current product</h2>
        <ProductRow ready />
      </section>
      <section
        className="alternative-options"
        role="radiogroup"
        aria-label="Alternatives"
      >
        <h2>Alternatives</h2>
        <AlternativeRow selected />
        <AlternativeRow />
      </section>
      <ActionFooter>
        <ViewerButton color="primary">Use selected alternative</ViewerButton>
      </ActionFooter>
    </Frame>
  ),
};

export const FactualDetails: Story = {
  render: () => (
    <Frame>
      <ProductRow expanded />
    </Frame>
  ),
};

export const Unavailable: Story = {
  render: () => (
    <Frame>
      <p className="intro">
        The returned data is incomplete, so this row stays honest and
        non-actionable.
      </p>
      <section className="product-list">
        <ProductRow view={unavailable} quantity={1} />
      </section>
    </Frame>
  ),
};

export const PreparedConfirmation: Story = {
  render: () => (
    <Frame>
      <OutcomeSurface title="Ready to add to Nemlig basket">
        <p>2 × Arla ØKO Minimælk · 12,95 kr. each · 25,90 kr.</p>
        <p>Expected product total: 25,90 kr.</p>
        <ViewerButton color="primary">Add to Nemlig basket</ViewerButton>
      </OutcomeSurface>
    </Frame>
  ),
};

export const VerifiedSuccess: Story = {
  render: () => (
    <Frame>
      <OutcomeSurface tone="success" title="Nemlig confirmed the addition">
        <p>
          Only the prepared products were added. Your real Nemlig basket was
          verified after the addition.
        </p>
        <ViewerButton color="secondary">Continue with Draft list</ViewerButton>
      </OutcomeSurface>
    </Frame>
  ),
};

export const EmptyDraftList: Story = {
  render: () => (
    <Frame>
      <DraftListStarters onChoose={() => undefined} />
    </Frame>
  ),
};
