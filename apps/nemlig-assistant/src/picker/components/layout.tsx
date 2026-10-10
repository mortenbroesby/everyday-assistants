import styled from "@emotion/styled";
import type { ReactNode } from "react";

const ViewerRoot = styled.div({
  minWidth: 0,
  padding:
    "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)",
});
const Viewer = styled.main({
  width: "min(calc(100% - 32px), 560px)",
  margin: "16px auto",
  padding: 16,
  border: "1px solid var(--line)",
  borderRadius: 20,
  background: "var(--surface)",
});
const ScreenHeading = styled.h1({
  margin: "0 4px 5px",
  fontSize: "1.45rem",
  lineHeight: 1.15,
  letterSpacing: "-.035em",
  fontWeight: 650,
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
}: {
  title?: string;
  intro?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <ViewerRoot className="app-frame" data-viewer-component="viewer-shell">
      <Viewer
        className="viewer"
        aria-label={title ? undefined : "Nemlig Assistant Local basket"}
        aria-labelledby={title ? "title" : undefined}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title && <ScreenHeading id="title">{title}</ScreenHeading>}
        {intro && <ScreenIntro className="intro">{intro}</ScreenIntro>}
        {children}
      </Viewer>
    </ViewerRoot>
  );
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <Footer data-viewer-component="action-footer">{children}</Footer>;
}
