import tseslint from "typescript-eslint";

const INNER_HTML_ALLOWED = [
  "src/shared/ui/tribute/dom.ts",
  "src/shared/ui/components/overlay/shell.ts",
  "src/client/modules/media/media.tsx",
  "src/client/modules/modals/docs-modal/docs.tsx",
  "src/client/modules/renderer/media/render-media.tsx",
  "src/client/modules/renderer/render-page.ts",
  "src/client/modules/renderer/render-slots.ts",
  "src/client/modules/renderer/render.tsx",
  "src/client/modules/tabs/tab-search.tsx",
  "src/client/utils/search/actions/search-actions-perform.tsx",
  "src/client/utils/search/streaming/streaming-search-dom.tsx",
];

const INNER_HTML_MESSAGE =
  "Assigning innerHTML is banned. Build a component and use render() or clear() from shared/ui/tribute/dom. Theme templates, plugin HTML and sanitised markdown are the only exceptions, and they live in the allowlist in eslint.config.js.";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "src/public/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-duplicate-imports": "error",
      "@typescript-eslint/no-shadow": "error",
      "no-shadow": "off",
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: INNER_HTML_ALLOWED,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression > MemberExpression[property.name='innerHTML']",
          message: INNER_HTML_MESSAGE,
        },
        {
          selector:
            "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: INNER_HTML_MESSAGE,
        },
      ],
    },
  },
  {
    files: ["src/server/**/*.ts", "src/server/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "shared/ui(/index|/components(/index)?|/tribute/dom)?$|shared/ui/components/overlay/",
              message:
                "Server code must import deep component paths, never the shared/ui barrels. The barrels pull in tribute/dom and the overlay shell, which touch document and crash at startup.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/ui/jsx-runtime.ts", "src/shared/ui/jsx.d.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
