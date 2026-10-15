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
    <OutcomeSurface title="Start a grocery draft">
      <p>
        Search and compare products without changing Nemlig. Chosen products
        stay in a temporary draft. Only an explicit Submit adds the approved
        quantities to your existing basket in one request. Saved shopping lists
        can be loaded as read-only sources; draft edits do not change them.
      </p>
      {message && <p role="status">{message}</p>}
      <Actions>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me plan groceries for the week. Search and compare products first. Keep my choices in a temporary draft. When I explicitly submit, add the approved quantities to my existing Nemlig basket in one request. Do not create or edit a shopping list.",
            )
          }
        >
          Plan groceries for the week
        </ViewerButton>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me find ingredients for dinner. Search and compare products first. When I choose products, prepare a temporary draft that I can edit before explicitly adding it to my basket.",
            )
          }
        >
          Find ingredients for dinner
        </ViewerButton>
        <ViewerButton
          color="secondary"
          onClick={() =>
            onChoose(
              "Help me find a product. Search and compare options first. When I choose a product, prepare a temporary draft that I can edit before explicitly adding it to my basket.",
            )
          }
        >
          Find a product
        </ViewerButton>
      </Actions>
    </OutcomeSurface>
  );
}
