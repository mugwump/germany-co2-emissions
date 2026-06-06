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
      httpClient: "fetch",
      mode: "single",
      // Prepend the API origin (servers[0].url in openapi.json = http://localhost:8080)
      // so the browser calls the API directly. The API has CORS enabled.
      baseUrl: { getBaseUrlFromSpecification: true },
      override: {
        query: {
          useQuery: true,
        },
      },
    },
    // Strip the baked API origin from query keys only (keeps it in request URLs).
    hooks: {
      afterAllFilesWrite: "node scripts/strip-querykey-host.mjs",
    },
  },
});
