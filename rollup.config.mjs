import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const dev = process.env.ROLLUP_WATCH === "true";

export default {
  input: "src/ted-cards.ts",
  output: {
    file: "dist/ted-cards.js",
    format: "es",
    sourcemap: dev,
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", sourceMap: dev, inlineSources: dev }),
    json(),
    replace({
      preventAssignment: true,
      values: {
        "__TED_CARDS_VERSION__": JSON.stringify(pkg.version),
      },
    }),
    !dev && terser({ format: { comments: false } }),
  ].filter(Boolean),
};
