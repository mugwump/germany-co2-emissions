// Post-gen cleanup for the Orval client.
//
// Orval's baseUrl (getBaseUrlFromSpecification) bakes the API origin into BOTH
// the request-URL builders (getXUrl — needed, that's the real fetch target) and
// the query-key builders (getXQueryKey — noise: the path alone uniquely
// identifies the cache entry). This strips the origin from query keys only,
// leaving the request URLs untouched. Run automatically via Orval's
// hooks.afterAllFilesWrite.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../src/api/endpoints.ts", import.meta.url);
const before = readFileSync(file, "utf8");

// Within each `...QueryKey = (…) => { return [ \`<ORIGIN>/path…\`` block, drop
// the scheme+host, keeping the leading slash of the path.
const after = before.replace(
  /(QueryKey = [\s\S]*?return \[\s*`)https?:\/\/[^/`]+/g,
  "$1",
);

writeFileSync(file, after);
const n = (before.match(/QueryKey = /g) || []).length;
console.log(`strip-querykey-host: cleaned ${n} query-key builders`);
