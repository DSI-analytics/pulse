import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // Ver test/server-only-stub.ts.
      "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname,
    },
  },
});
