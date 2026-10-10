import styled from "@emotion/styled";
import type { ReactNode } from "react";

const ViewerRoot = styled.div({
  minWidth: 0,
  padding:
    "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)",
});
const Viewer = styled.main({
  width: "min(100%, 560px)",
  maxHeight: 620,
  margin: "0 auto",
  overflowY: "auto",
  overscrollBehaviorY: "contain",
  padding: 16,
  background: "var(--surface)",
});
const ScreenHeading = styled.h1({
  margin: "0 4px 5px",
  fontSize: "1.45rem",
  lineHeight: 1.15,
  letterSpacing: "-.035em",
  fontWeight: 650,
});
const HeadingRow = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  "& h1": { minWidth: 0 },
});
const ScreenIntro = styled.p({
  maxWidth: "42ch",
  margin: "0 4px 14px",
  color: "var(--muted)",
  fontSize: ".84rem",
});
const Footer = styled.footer({
  display: "grid",
  gap: 8,
  paddingTop: 12,
  "& > button": { width: "100%" },
});

/** Shared visual shell for every viewer state; it does not own shopping state or host effects. */
export function ViewerShell({
  title,
  intro,
  children,
  maxWidth,
  headerActions,
}: {
  title?: string;
  intro?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  headerActions?: ReactNode;
}) {
  return (
    <ViewerRoot className="app-frame" data-viewer-component="viewer-shell">
      <Viewer
        className="viewer"
        tabIndex={-1}
        aria-label={title ? undefined : "Nemlig Assistant Local basket"}
        aria-labelledby={title ? "title" : undefined}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title && (
          <HeadingRow>
            <ScreenHeading id="title">{title}</ScreenHeading>
            {headerActions}
          </HeadingRow>
        )}
        {intro && <ScreenIntro className="intro">{intro}</ScreenIntro>}
        {children}
      </Viewer>
    </ViewerRoot>
  );
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <Footer data-viewer-component="action-footer">{children}</Footer>;
}
