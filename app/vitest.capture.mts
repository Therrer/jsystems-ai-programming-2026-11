import path from "node:path";
import { defineConfig } from "vitest/config";

// T21 (plan §5): records REAL OpenRouter traffic through the real app modules with the final prompts.
// Run on purpose only: `npx vitest run --config vitest.capture.mts`. It calls the network and costs money,
// so it is not part of `npm test` and does not load the network guard.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/capture/**/*.capture.ts"],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
