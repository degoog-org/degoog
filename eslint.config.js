import tseslint from "typescript-eslint";

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
    files: ["src/shared/ui/jsx-runtime.ts", "src/shared/ui/jsx.d.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
