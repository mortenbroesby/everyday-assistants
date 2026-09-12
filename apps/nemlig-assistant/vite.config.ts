import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: false,
    modulePreload: false,
    outDir: "dist",
    rollupOptions: { input: fileURLToPath(new URL("picker.html", import.meta.url)) },
    target: "baseline-widely-available",
  },
});
