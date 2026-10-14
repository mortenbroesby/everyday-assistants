import styled from "@emotion/styled";
import type { ReactNode } from "react";
import { ViewerButton } from "./button.js";

type Tone = "neutral" | "success" | "warning";

const Surface = styled.section<{ tone: Tone }>(({ tone }) => ({
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid var(--line)",
  borderRadius: 16,
  background: tone === "success" ? "var(--soft)" : "var(--surface)",
  ...(tone === "warning"
    ? { borderColor: "var(--accent)", background: "var(--soft)" }
    : {}),
  "& h2": { margin: 0, fontSize: "1rem", lineHeight: 1.3 },
  "& p": {
    margin: 0,
    color: "var(--muted)",
    fontSize: ".84rem",
    lineHeight: 1.5,
  },
}));
const Actions = styled.div({ display: "grid", gap: 8, marginTop: 2 });

/** Compact status, confirmation, and zero-selection composition. It owns no business state. */
export function OutcomeSurface({
  tone = "neutral",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children: ReactNode;
}) {
  return (
    <Surface tone={tone} data-viewer-component="outcome-surface">
      <h2>{title}</h2>
      {children}
    </Surface>
  );
}

/** Conversational entry points deliberately use the already-supported host-message bridge. */
export function ShoppingListStarters({
  message,
  onChoose,
}: {
  message?: string;
  onChoose: (prompt: string) => void;
}) {
  return (
    <OutcomeSurface title="Start a Nemlig shopping list">
      <p>
        Search and compare products without changing Nemlig. When you choose
        products, they are added to a named Nemlig shopping list and edits save
        as you make them. Adding that list to the actual Nemlig basket is a
        separate action.
      </p>
      {message && <p role="status">{message}</p>}
      <Actions>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me plan groceries for the week. Search and compare products first. When I choose products, create a named Nemlig shopping list and save my edits there automatically. Do not add anything to the actual basket.",
            )
          }
        >
          Plan groceries for the week
        </ViewerButton>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me find ingredients for dinner. Search and compare products first. When I choose products, create a named Nemlig shopping list and save my edits there automatically. Do not add anything to the actual basket.",
            )
          }
        >
          Find ingredients for dinner
        </ViewerButton>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me find a product. Search and compare options first. When I choose a product, create a Nemlig shopping list and save edits there automatically. Do not add anything to the actual basket.",
            )
          }
        >
          Find a product
        </ViewerButton>
      </Actions>
    </OutcomeSurface>
  );
}
