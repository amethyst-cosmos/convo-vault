import globals from "globals";

// Only one rule: no-undef. It catches code that was moved or deleted in a refactor but
// is still referenced. The content script is checked as the generated file, because its
// fragments share one scope and are not valid on their own.
export default [
  {
    files: ["extension/background.js", "extension/popup/*.js", "tmp/lint-build/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: { ...globals.browser, ...globals.webextensions } },
    rules: { "no-undef": "error" }
  },
  {
    files: ["extension/background.js"],
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    files: ["renderer/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "no-undef": "error" }
  },
  {
    // Parts of these files run inside the PDF page (page.evaluate, the DIL runtime).
    files: ["renderer/lib/pdf.js", "renderer/lib/dil-runtime.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ["cli/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    rules: { "no-undef": "error" }
  }
];
