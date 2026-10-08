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
  ...(tone === "warning" ? { borderColor: "var(--accent)", background: "var(--soft)" } : {}),
  "& h2": { margin: 0, fontSize: "1rem", lineHeight: 1.3 },
  "& p": { margin: 0, color: "var(--muted)", fontSize: ".84rem", lineHeight: 1.5 },
}));
const Actions = styled.div({ display: "grid", gap: 8, marginTop: 2 });
const LocalActions = styled.details({
  marginTop: 10,
  borderTop: "1px solid var(--line)",
  "& > summary": { minHeight: 40, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--muted)", fontSize: ".82rem", fontWeight: 650 },
  "& > div": { display: "grid", gap: 8, paddingBottom: 2 },
});

/** Compact status, confirmation, and zero-selection composition. It owns no business state. */
export function OutcomeSurface({ tone = "neutral", title, children }: { tone?: Tone; title: string; children: ReactNode }) {
  return <Surface tone={tone} data-viewer-component="outcome-surface"><h2>{title}</h2>{children}</Surface>;
}

/** Conversational entry points deliberately use the already-supported host-message bridge. */
export function DraftListStarters({ message, onChoose }: { message?: string; onChoose: (prompt: string) => void }) {
  return <OutcomeSurface title="What should we shop for?">
    <p>{message ?? "Ask Nemlig Assistant what you need. We will bring products here for you to decide."}</p>
    <Actions>
      <ViewerButton color="secondary" onClick={() => onChoose("Help me plan groceries for the week. Start a new local Draft list; do not add anything to Nemlig.")}>Plan groceries for the week</ViewerButton>
      <ViewerButton color="secondary" onClick={() => onChoose("Help me find ingredients for dinner. Start a new local Draft list; do not add anything to Nemlig.")}>Find ingredients for dinner</ViewerButton>
      <ViewerButton color="secondary" onClick={() => onChoose("Help me find a product for a new local Draft list. Do not add anything to Nemlig.")}>Find a product</ViewerButton>
    </Actions>
  </OutcomeSurface>;
}

/** Local-only actions are deliberately secondary to the active shopping decision. */
export function DraftListOverflow({ children }: { children: ReactNode }) {
  return <LocalActions data-viewer-component="draft-list-overflow"><summary>More Draft list actions</summary><div>{children}</div></LocalActions>;
}
