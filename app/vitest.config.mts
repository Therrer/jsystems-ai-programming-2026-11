import path from "node:path";
import { defineConfig } from "vitest/config";

// ADR-000 §10: unit + integration tests run in Node, component tests in jsdom.
// Every run loads the network guard (TAC-02): no test may reach a real external host.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Tests run server modules in Node: use the package's own "react-server" export (empty.js)
      // instead of the default export, which throws outside React Server Components.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    setupFiles: ["./tests/setup/network-guard.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.tsx"],
        },
      },
    ],
  },
});
