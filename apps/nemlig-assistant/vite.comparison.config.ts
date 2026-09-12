import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const entries = {
  "fp-ts": "src/picker/comparison/fp-ts.ts",
  "effect-remeda": "src/picker/comparison/effect-remeda.ts",
} as const;

export default defineConfig(({ mode }) => {
  if (!(mode in entries)) throw new Error(`Unknown comparison candidate: ${mode}`);
  const candidate = mode as keyof typeof entries;

  return {
    publicDir: false,
    build: {
      copyPublicDir: false,
      emptyOutDir: true,
      lib: {
        entry: fileURLToPath(new URL(entries[candidate], import.meta.url)),
        fileName: "candidate",
        formats: ["es"],
      },
      minify: "esbuild",
      outDir: `.comparison/${candidate}`,
      target: "baseline-widely-available",
    },
  };
});
