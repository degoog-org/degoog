import * as sass from "sass";
import * as esbuild from "esbuild";

const result = sass.compile("src/styles/style.scss");
await Bun.write("src/public/themes/degoog-theme/style.css", result.css);
console.log("SCSS compiled successfully.");

await esbuild.build({
  entryPoints: [
    { in: "src/client/app.ts", out: "app" },
    { in: "src/client/modules/settings/settings.ts", out: "settings-page" },
  ],
  bundle: true,
  outdir: "src/public",
  format: "esm",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  define: {
    "process.env.LOG_LEVEL": JSON.stringify(process.env.LOG_LEVEL ?? "info"),
  },
});

console.log("TypeScript bundled successfully.");
