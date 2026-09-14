import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "no-throw-literal": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Node scripts are gates too (constitution); lint them like src.
    files: ["scripts/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "scripts/*.mjs", "test-results/", "playwright-report/"],
  },
);
