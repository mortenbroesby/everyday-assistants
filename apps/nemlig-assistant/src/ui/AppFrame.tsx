import type { App } from "@modelcontextprotocol/ext-apps";
import type { CSSProperties, PropsWithChildren } from "react";

type SafeAreaInsets = NonNullable<ReturnType<App["getHostContext"]>>["safeAreaInsets"];
type SafeAreaProperties = CSSProperties & Record<`--safe-area-${"top" | "right" | "bottom" | "left"}`, string>;

export const safeAreaStyle = (insets: SafeAreaInsets): CSSProperties => insets ? {
  "--safe-area-top": `${insets.top}px`,
  "--safe-area-right": `${insets.right}px`,
  "--safe-area-bottom": `${insets.bottom}px`,
  "--safe-area-left": `${insets.left}px`,
} as SafeAreaProperties : {};

export function AppFrame({ children, safeAreaInsets }: PropsWithChildren<{ safeAreaInsets?: SafeAreaInsets }>) {
  return <div className="app-frame" style={safeAreaStyle(safeAreaInsets)}>{children}</div>;
}
