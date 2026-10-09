import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    manifest: true,
    modulePreload: false,
    outDir: "dist/viewer-build",
    rollupOptions: {
      input: fileURLToPath(new URL("picker.html", import.meta.url)),
      output: { inlineDynamicImports: true },
    },
    target: "baseline-widely-available",
  },
});
