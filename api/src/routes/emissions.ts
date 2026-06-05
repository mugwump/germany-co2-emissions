import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { cassandra } from "../cassandra.js";

const COUNTRY = "DEU";

// ---- response schemas (also drive the OpenAPI document) --------------------
const SectorTotal = z.object({
  year: z.number().int(),
  sector: z.string(),
  emissions_quantity: z.number(),
});
const SubsectorRow = z.object({
  subsector: z.string(),
  year: z.number().int(),
  emissions_quantity: z.number(),
});
const SourcePoint = z.object({
  source_id: z.number().int(),
  source_name: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  emissions_quantity: z.number(),
});
const TopSource = SourcePoint.extend({ rank: z.number().int() });
const OwnershipRow = z.object({
  parent_name: z.string().nullable(),
  parent_entity_type: z.string().nullable(),
  parent_registration_country: z.string().nullable(),
  overall_share_percent: z.number().nullable(),
  immediate_source_owner: z.string().nullable(),
  ownership_path: z.string().nullable(),
});
const OwnerRow = z.object({
  owner: z.string(),
  emissions_quantity: z.number(),
  source_count: z.number().int(),
});
const OwnerTrendPoint = z.object({
  year: z.number().int(),
  emissions_quantity: z.number(),
  source_count: z.number().int(),
});

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function emissionsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // List of sectors (distinct partition keys — efficient in Cassandra).
  r.get("/sectors", {
    schema: {
      tags: ["meta"],
      operationId: "listSectors",
      response: { 200: z.object({ sectors: z.array(z.string()) }) },
    },
  }, async () => {
    const rs = await cassandra.execute(
      "SELECT DISTINCT iso3_country, sector FROM country_emissions",
    );
    const sectors = rs.rows
      .filter((x) => x.iso3_country === COUNTRY)
      .map((x) => x.sector as string)
      .sort();
    return { sectors };
  });

  // Top CO2-emitting owners (controlling parent) for a year (Spark rollup).
  r.get("/owners", {
    schema: {
      tags: ["analysis"],
      operationId: "topOwners",
      querystring: z.object({
        year: z.coerce.number().int(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
      response: { 200: z.object({ data: z.array(OwnerRow) }) },
    },
  }, async (req) => {
    const { year, limit } = req.query;
    const rs = await cassandra.execute(
      "SELECT owner, emissions_quantity, source_count FROM analysis_owner_year WHERE year = ?",
      [year], { prepare: true },
    );
    const data = rs.rows
      .map((x) => ({
        owner: x.owner as string,
        emissions_quantity: num(x.emissions_quantity),
        source_count: Number(x.source_count),
      }))
      .sort((a, b) => b.emissions_quantity - a.emissions_quantity)
      .slice(0, limit ?? 25);
    return { data };
  });

  // One owner's CO2 over time (single-partition read) — "did they reduce?".
  r.get("/owners/:owner/trend", {
    schema: {
      tags: ["analysis"],
      operationId: "ownerTrend",
      params: z.object({ owner: z.string() }),
      response: {
        200: z.object({ owner: z.string(), data: z.array(OwnerTrendPoint) }),
      },
    },
  }, async (req) => {
    const { owner } = req.params;
    const rs = await cassandra.execute(
      "SELECT year, emissions_quantity, source_count FROM analysis_owner_trend WHERE owner = ?",
      [owner], { prepare: true },
    );
    const data = rs.rows
      .map((x) => ({
        year: x.year as number,
        emissions_quantity: num(x.emissions_quantity),
        source_count: Number(x.source_count),
      }))
      .sort((a, b) => a.year - b.year);
    return { owner, data };
  });

  // Sector totals per year (Spark rollup) — for the stacked time-series.
  r.get("/sectors/timeseries", {
    schema: {
      tags: ["analysis"],
      operationId: "sectorTimeseries",
      response: { 200: z.object({ data: z.array(SectorTotal) }) },
    },
  }, async () => {
    const rs = await cassandra.execute(
      "SELECT year, sector, emissions_quantity FROM analysis_sector_year WHERE iso3_country = ?",
      [COUNTRY], { prepare: true },
    );
    return {
      data: rs.rows.map((x) => ({
        year: x.year as number,
        sector: x.sector as string,
        emissions_quantity: num(x.emissions_quantity),
      })),
    };
  });

  // All subsector-year rows for one sector (single partition) — breakdown drilldown.
  r.get("/sectors/:sector/subsectors", {
    schema: {
      tags: ["analysis"],
      operationId: "sectorSubsectors",
      params: z.object({ sector: z.string() }),
      response: { 200: z.object({ data: z.array(SubsectorRow) }) },
    },
  }, async (req) => {
    const { sector } = req.params;
    const rs = await cassandra.execute(
      "SELECT subsector, year, emissions_quantity FROM country_emissions WHERE iso3_country = ? AND sector = ?",
      [COUNTRY, sector], { prepare: true },
    );
    return {
      data: rs.rows.map((x) => ({
        subsector: x.subsector as string,
        year: x.year as number,
        emissions_quantity: num(x.emissions_quantity),
      })),
    };
  });

  // Top emitting facilities in a subsector for a year (Spark rollup).
  r.get("/subsectors/:subsector/top", {
    schema: {
      tags: ["analysis"],
      operationId: "topSources",
      params: z.object({ subsector: z.string() }),
      querystring: z.object({ year: z.coerce.number().int() }),
      response: { 200: z.object({ data: z.array(TopSource) }) },
    },
  }, async (req) => {
    const { subsector } = req.params;
    const { year } = req.query;
    const rs = await cassandra.execute(
      "SELECT rank, source_id, source_name, lat, lon, emissions_quantity FROM analysis_top_sources WHERE subsector = ? AND year = ?",
      [subsector, year], { prepare: true },
    );
    return {
      data: rs.rows.map((x) => ({
        rank: x.rank as number,
        source_id: Number(x.source_id),
        source_name: (x.source_name as string) ?? null,
        lat: x.lat == null ? null : Number(x.lat),
        lon: x.lon == null ? null : Number(x.lon),
        emissions_quantity: num(x.emissions_quantity),
      })),
    };
  });

  // All facility points in a subsector for a year (Spark per-source rollup) — for the map.
  r.get("/subsectors/:subsector/sources", {
    schema: {
      tags: ["analysis"],
      operationId: "subsectorSources",
      params: z.object({ subsector: z.string() }),
      querystring: z.object({ year: z.coerce.number().int() }),
      response: { 200: z.object({ data: z.array(SourcePoint) }) },
    },
  }, async (req) => {
    const { subsector } = req.params;
    const { year } = req.query;
    const rs = await cassandra.execute(
      "SELECT source_id, source_name, lat, lon, emissions_quantity FROM analysis_source_year WHERE subsector = ? AND year = ?",
      [subsector, year], { prepare: true },
    );
    return {
      data: rs.rows.map((x) => ({
        source_id: Number(x.source_id),
        source_name: (x.source_name as string) ?? null,
        lat: x.lat == null ? null : Number(x.lat),
        lon: x.lon == null ? null : Number(x.lon),
        emissions_quantity: num(x.emissions_quantity),
      })),
    };
  });

  // Corporate ownership for one facility — top-emitters drill-down.
  r.get("/subsectors/:subsector/sources/:sourceId/ownership", {
    schema: {
      tags: ["analysis"],
      operationId: "sourceOwnership",
      params: z.object({ subsector: z.string(), sourceId: z.coerce.number().int() }),
      response: { 200: z.object({ data: z.array(OwnershipRow) }) },
    },
  }, async (req) => {
    const { subsector, sourceId } = req.params;
    const rs = await cassandra.execute(
      "SELECT parent_name, parent_entity_type, parent_registration_country, overall_share_percent, immediate_source_owner, ownership_path FROM emissions_sources_ownership WHERE source_subsector = ? AND source_id = ?",
      [subsector, sourceId], { prepare: true },
    );
    return {
      data: rs.rows.map((x) => ({
        parent_name: (x.parent_name as string) ?? null,
        parent_entity_type: (x.parent_entity_type as string) ?? null,
        parent_registration_country: (x.parent_registration_country as string) ?? null,
        overall_share_percent: x.overall_share_percent == null ? null : Number(x.overall_share_percent),
        immediate_source_owner: (x.immediate_source_owner as string) ?? null,
        ownership_path: (x.ownership_path as string) ?? null,
      })),
    };
  });
}
