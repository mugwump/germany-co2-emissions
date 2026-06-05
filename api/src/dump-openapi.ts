// Writes the OpenAPI document to ../openapi.json without needing a DB or a
// running server. Orval consumes this file to generate the TanStack Query client.
import { writeFileSync } from "node:fs";
import { buildServer } from "./server.js";

const app = await buildServer();
await app.ready();
const doc = app.swagger();
writeFileSync(
  new URL("../openapi.json", import.meta.url),
  JSON.stringify(doc, null, 2),
);
console.log("Wrote api/openapi.json");
await app.close();
process.exit(0);
