import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    // Mirror the tsconfig `@/*` path alias so tests import like app code.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
