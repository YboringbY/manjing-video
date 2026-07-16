import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: [".next/**", "next-env.d.ts", "node_modules/**", "public/uploads/**", "tsconfig.tsbuildinfo"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-img-element": "off"
    }
  },
  {
    files: ["prisma/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];

export default config;
