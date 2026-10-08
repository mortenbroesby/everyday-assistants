import styled from "@emotion/styled";
import type { ReactNode } from "react";
import { ViewerButton } from "./button.js";

const ViewerRoot = styled.div({ minWidth: 0, padding: "max(10px, env(safe-area-inset-top, 0px)) max(10px, env(safe-area-inset-right, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px)" });
const Viewer = styled.main({ width: "min(100%, 560px)", margin: "0 auto" });
const WorkspaceHeader = styled.header({ display: "flex", alignItems: "center", gap: 9, margin: "2px 2px 18px" });
const BrandMark = styled.span({ display: "grid", width: 30, height: 30, placeItems: "center", flex: "none", borderRadius: 10, color: "var(--accent-ink)", background: "var(--accent)", fontSize: ".82rem", fontWeight: 700 });
const BrandCopy = styled.span({ display: "grid", gap: 1, minWidth: 0, "& strong": { fontSize: ".82rem", lineHeight: 1.2, fontWeight: 650 }, "& span": { color: "var(--muted)", fontSize: ".72rem", lineHeight: 1.25 } });
const ScreenHeading = styled.h1({ margin: "0 4px 5px", fontSize: "1.45rem", lineHeight: 1.15, letterSpacing: "-.035em", fontWeight: 650 });
const ScreenIntro = styled.p({ maxWidth: "42ch", margin: "0 4px 14px", color: "var(--muted)", fontSize: ".84rem" });
const DestinationNavigation = styled.nav({ display: "grid", gap: 8, marginBottom: 14 });
const Segments = styled.span({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 14, background: "var(--soft)", "& > button": { width: "100%", minHeight: 42, border: 0, color: "var(--muted)", background: "transparent" }, "& > button[aria-current=page]": { color: "var(--ink)", background: "var(--surface)", boxShadow: "0 1px 4px rgb(20 48 28 / 10%)" } });
const ReturnToAlternatives = styled(ViewerButton)({ justifySelf: "start" });
const Footer = styled.footer({ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12, "& > button[data-viewer-tone=primary]": { flex: "1 1 13rem" } });

/** Shared visual shell for every viewer state; it does not own shopping state or host effects. */
export function ViewerShell({ title, intro, children, maxWidth }: { title?: string; intro?: ReactNode; children: ReactNode; maxWidth?: number }) {
  return <ViewerRoot className="app-frame" data-viewer-component="viewer-shell"><Viewer className="viewer" aria-label={title ? undefined : "Nemlig Assistant Draft list"} aria-labelledby={title ? "title" : undefined} style={maxWidth ? { maxWidth } : undefined}>
    <WorkspaceHeader>
      <BrandMark aria-hidden="true">N</BrandMark>
      <BrandCopy><strong>Nemlig Assistant</strong><span>Draft list</span></BrandCopy>
    </WorkspaceHeader>
    {title && <ScreenHeading id="title">{title}</ScreenHeading>}
    {intro && <ScreenIntro className="intro">{intro}</ScreenIntro>}
    {children}
  </Viewer></ViewerRoot>;
}

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
