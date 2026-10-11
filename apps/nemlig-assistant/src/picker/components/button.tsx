import styled from "@emotion/styled";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ViewerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: "primary" | "secondary";
  variant?: "ghost";
  block?: boolean;
};

const StyledButton = styled("button", {
  shouldForwardProp: (prop) => !["tone", "variant", "block"].includes(prop),
})<{
  tone: NonNullable<ViewerButtonProps["color"]>;
  variant?: ViewerButtonProps["variant"];
  block?: boolean;
}>(({ tone, variant, block }) => ({
  minHeight: variant === "ghost" ? 38 : 40,
  padding: variant === "ghost" ? "9px 0" : "9px 12px",
  border:
    variant === "ghost"
      ? "1px solid transparent"
      : `1px solid ${tone === "primary" ? "var(--accent)" : "var(--line)"}`,
  borderRadius: 12,
  color: tone === "primary" ? "var(--accent-ink)" : "var(--accent)",
  background: tone === "primary" ? "var(--accent)" : "var(--surface)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: block ? "100%" : undefined,
  fontSize: ".84rem",
  fontWeight: 650,
  lineHeight: 1.2,
  ":disabled": { cursor: "not-allowed", opacity: 0.55 },
}));

/** Native control with viewer-owned hierarchy and host-independent layout. */
export const ViewerButton = forwardRef<HTMLButtonElement, ViewerButtonProps>(
  function ViewerButton(
    {
      color = "secondary",
      variant,
      block,
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <StyledButton
        ref={ref}
        type={type}
        tone={color}
        variant={variant}
        block={block}
        data-viewer-tone={color}
        className={className}
        {...props}
      />
    );
  },
);
