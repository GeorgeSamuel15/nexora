// Flat ESLint config (ESLint 9+). Each service/package extends this.
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: false,
        sourceType: "module",
        ecmaVersion: "latest"
      },
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Nexora hard rule: no `any` without explicit, reviewed justification.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-undef": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  },
  {
    ignores: ["**/dist/**", "**/generated/**", "**/build/**", "**/node_modules/**", "**/coverage/**", "**/.next/**"]
  }
];
