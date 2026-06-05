import { defineConfig } from "orval";

// Generates a TanStack Query client from the API's OpenAPI document.
// Re-run with `npm run gen` after the API schema changes (refresh openapi.json
// first: `curl localhost:8080/docs/json | python3 -m json.tool > web/openapi.json`).
export default defineConfig({
  co2: {
    input: "./openapi.json",
    output: {
      target: "./src/api/endpoints.ts",
      client: "react-query",
      mode: "single",
      prettier: false,
      override: {
        mutator: {
          path: "./src/api/fetcher.ts",
          name: "customFetch",
        },
        query: {
          useQuery: true,
        },
      },
    },
  },
});
