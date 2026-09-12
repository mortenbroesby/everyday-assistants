import { defineConfig } from "tsdown";

const executable = {
  format: "esm",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  outputOptions: { codeSplitting: false },
  platform: "node",
  sourcemap: true,
  target: "node22",
} as const;

export default defineConfig([
  { ...executable, clean: true, entry: { cli: "src/cli.ts" } },
  { ...executable, clean: false, entry: { mcp: "src/mcp.ts" } },
  { ...executable, clean: false, entry: { http: "src/http.ts" } },
  { entry: { picker: "src/picker/main.tsx" }, format: "iife", outDir: "dist/picker", platform: "browser", target: "es2022", minify: true, sourcemap: false, deps: { alwaysBundle: [/./] } },
]);
