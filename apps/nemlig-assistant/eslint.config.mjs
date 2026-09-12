import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "release/**/*.ts", "tsdown.config.ts", "vite.config.ts"],
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
);
