import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored design-system sources. They are the specification this app is
    // held to and are never edited here, so they are checked by
    // `npm run lint:ds` (against `_adherence.oxlintrc.json`) rather than by
    // the app's own rules.
    "src/ds/**",
  ]),
]);

export default eslintConfig;
