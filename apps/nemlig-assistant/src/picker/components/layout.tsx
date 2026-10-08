import styled from "@emotion/styled";
import type { ReactNode } from "react";
import { ViewerButton } from "./button.js";

const DestinationNavigation = styled.nav({ display: "grid", gap: 8, marginBottom: 14 });
const Segments = styled.span({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 14, background: "var(--soft)", "& > button": { width: "100%", minHeight: 42, border: 0, color: "var(--muted)", background: "transparent" }, "& > button[aria-current=page]": { color: "var(--ink)", background: "var(--surface)", boxShadow: "0 1px 4px rgb(20 48 28 / 10%)" } });
const ReturnToAlternatives = styled(ViewerButton)({ justifySelf: "start" });
const Footer = styled.footer({ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12, "& > button[data-viewer-tone=primary]": { flex: "1 1 13rem" } });

export function DestinationTabs({ destination, toDecideCount, readyCount, hasAlternatives, disabled, onNavigate }: {
  destination: "needs-review" | "ready" | "alternatives"; toDecideCount: number; readyCount: number; hasAlternatives: boolean; disabled: boolean;
  onNavigate: (destination: "needs-review" | "ready" | "alternatives") => void;
}) {
  return <DestinationNavigation aria-label="Draft list destinations">
    <Segments data-viewer-control="segmented-tabs">
      <ViewerButton color="secondary" aria-current={destination === "needs-review" ? "page" : undefined} disabled={disabled} onClick={() => onNavigate("needs-review")}>To decide ({toDecideCount})</ViewerButton>
      <ViewerButton color="secondary" aria-current={destination === "ready" ? "page" : undefined} disabled={disabled} onClick={() => onNavigate("ready")}>Ready ({readyCount})</ViewerButton>
    </Segments>
    {hasAlternatives && destination !== "alternatives" && <ReturnToAlternatives color="secondary" variant="ghost" disabled={disabled} onClick={() => onNavigate("alternatives")}>Return to existing alternatives</ReturnToAlternatives>}
  </DestinationNavigation>;
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <Footer data-viewer-component="action-footer">{children}</Footer>;
}
