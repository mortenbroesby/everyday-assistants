import { defineConfig } from "tsdown";

const executable = {
  format: "esm",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  outputOptions: { codeSplitting: false },
  platform: "node",
  sourcemap: true,
  target: "node24",
} as const;

export default defineConfig([
  { ...executable, clean: true, entry: { cli: "src/cli.ts" } },
  { ...executable, clean: false, entry: { mcp: "src/mcp.ts" } },
  {
    ...executable,
    clean: false,
    entry: { http: "src/http.ts" },
  },
  ...(process.env.NEMLIG_BUILD_JOURNEY === "1"
    ? [
        {
          ...executable,
          clean: false,
          define: { __NEMLIG_JOURNEY_BUILD__: "true" },
          entry: { "journey-http": "src/journey-http.ts" },
        },
      ]
    : []),
]);
