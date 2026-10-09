import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    rules: { curly: ["error", "all"] },
  },
  {
    files: [
      "src/**/*.{ts,tsx}",
      "scripts/**/*.ts",
      "release/**/*.ts",
      "tsdown.config.ts",
      "vite.config.ts",
    ],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/mcp.ts", "src/http.ts", "src/cloudflare-worker.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./cli.js",
              message: "Server entrypoints must not depend on CLI composition.",
            },
          ],
        },
      ],
    },
  },
);
