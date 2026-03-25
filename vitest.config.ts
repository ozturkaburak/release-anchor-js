import { defineConfig } from "vitest/config";
import pkg from "./package.json";

export default defineConfig({
  define: { __SDK_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
