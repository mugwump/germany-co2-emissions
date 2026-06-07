-- Sample CQL for the climate_trace keyspace.
-- Run with:  make cql-file FILE=spark/kotlin/queries.cql
-- or paste individual statements into:  make cql
--
-- Cassandra requires filtering on the partition key (shown in each comment).
-- Queries that omit it need ALLOW FILTERING (fine ad-hoc, slow in general).

-- Top emitting owners for a year   [PK ((year), owner)]
SELECT owner, emissions_quantity, source_count
FROM analysis_owner_year WHERE year = 2023;

-- One company's emissions over time [PK ((owner), year)]
SELECT year, emissions_quantity, source_count
FROM analysis_owner_trend WHERE owner = 'RWE AG';

-- A sector's subsectors across years [PK ((iso3_country, sector), subsector, year, gas)]
SELECT subsector, year, emissions_quantity
FROM country_emissions WHERE iso3_country = 'DEU' AND sector = 'power';

-- All sectors for a country, every year [PK ((iso3_country), year, sector)]
SELECT year, sector, emissions_quantity
FROM analysis_sector_year WHERE iso3_country = 'DEU';

-- Top facilities in a subsector for a year [PK ((subsector, year), rank)]
SELECT rank, source_name, emissions_quantity
FROM analysis_top_sources
WHERE subsector = 'electricity-generation' AND year = 2023;

-- Every facility (map points) in a subsector/year [PK ((subsector, year), source_id)]
SELECT source_name, lat, lon, emissions_quantity
FROM analysis_source_year
WHERE subsector = 'electricity-generation' AND year = 2023 LIMIT 20;

-- One facility's monthly source rows [PK ((subsector), source_id, start_time)]
SELECT start_time, emissions_quantity, activity, capacity
FROM emissions_sources
WHERE subsector = 'electricity-generation' AND source_id = 25451939 LIMIT 12;

-- Corporate ownership of one facility [PK ((source_subsector), source_id, parent_entity_id)]
SELECT parent_name, overall_share_percent, ownership_path
FROM emissions_sources_ownership
WHERE source_subsector = 'electricity-generation' AND source_id = 25451939;
