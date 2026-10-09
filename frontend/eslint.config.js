import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build output and dependencies are never linted.
    ignores: ["dist", "coverage", "node_modules"],
  },

  // Baseline JS recommended rules.
  js.configs.recommended,

  // Type-aware linting for the app sources.
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // The API layer deliberately narrows `unknown` payloads, so a few
      // unsafe-any rules are relaxed where JSON is parsed.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // Enforced rather than merely suggested: an unawaited promise in an
      // event handler is a real bug source in this codebase.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },

  // Test files may use the Vitest globals and are less strict about typing
  // mocks.
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Config files run in Node.
  {
    files: ["vite.config.ts", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Plain `.js` files — the ESLint config itself — are not part of the
  // TypeScript program, so type-aware rules cannot run on them. Without this,
  // `eslint .` fails outright with "you have used a rule which requires type
  // information".
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
