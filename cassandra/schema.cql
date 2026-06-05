-- Climate TRACE v5.7.0 — Germany (DEU), CO2 emissions
-- Keyspace + tables. Cassandra is query-driven: partition keys chosen to
-- match the read patterns of the analysis/visualisation layer.

CREATE KEYSPACE IF NOT EXISTS climate_trace
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE climate_trace;

-- 1) Country-level annual totals. The analytical backbone.
--    Query: "for a sector, give me each subsector's value per year".
CREATE TABLE IF NOT EXISTS country_emissions (
  iso3_country            text,
  sector                  text,
  subsector               text,
  year                    int,
  gas                     text,
  start_time              timestamp,
  end_time                timestamp,
  emissions_quantity      double,
  emissions_quantity_units text,
  temporal_granularity    text,
  created_date            timestamp,
  modified_date           timestamp,
  PRIMARY KEY ((iso3_country, sector), subsector, year, gas)
);

-- 2) Facility / source-level emissions (monthly granularity, ~46 cols in CSV).
--    Core columns kept as typed; the sparse other1..other10 pairs go into a map.
--    Query: "all sources in a subsector", then drill into one source over time.
CREATE TABLE IF NOT EXISTS emissions_sources (
  subsector               text,
  source_id               bigint,
  start_time              timestamp,
  end_time                timestamp,
  source_name             text,
  source_type             text,
  iso3_country            text,
  sector                  text,
  lat                     double,
  lon                     double,
  geometry_ref            text,
  gas                     text,
  emissions_quantity      double,
  temporal_granularity    text,
  activity                double,
  activity_units          text,
  emissions_factor        double,
  emissions_factor_units  text,
  capacity                double,
  capacity_units          text,
  capacity_factor         double,
  other                   map<text, text>,
  created_date            timestamp,
  modified_date           timestamp,
  PRIMARY KEY ((subsector), source_id, start_time)
);

-- 3) Confidence ratings per source-month.
CREATE TABLE IF NOT EXISTS emissions_sources_confidence (
  subsector               text,
  source_id               bigint,
  start_time              timestamp,
  end_time                timestamp,
  source_name             text,
  iso3_country            text,
  sector                  text,
  source_type             text,
  gas                     text,
  capacity                text,
  capacity_factor         text,
  activity                text,
  emissions_factor        text,
  emissions_quantity      text,
  created_date            timestamp,
  modified_date           timestamp,
  PRIMARY KEY ((subsector), source_id, start_time)
);

-- 4) Corporate ownership per source (one row per parent in the ownership path).
CREATE TABLE IF NOT EXISTS emissions_sources_ownership (
  source_subsector            text,
  source_id                   bigint,
  parent_entity_id            text,
  parent_name                 text,
  parent_entity_type          text,
  parent_lei                  text,
  parent_permid               text,
  parent_registration_country text,
  parent_headquarter_country  text,
  overall_share_percent       double,
  ownership_path              text,
  immediate_source_owner      text,
  immediate_source_owner_entity_id text,
  source_operator             text,
  source_operator_id          text,
  percentage_of_operation     double,
  source_name                 text,
  source_sector               text,
  iso3_country                text,
  PRIMARY KEY ((source_subsector), source_id, parent_entity_id)
);

-- 5) Spark analysis results written back for the API/React layer.
--    Total CO2 per sector per year.
CREATE TABLE IF NOT EXISTS analysis_sector_year (
  iso3_country       text,
  year               int,
  sector             text,
  emissions_quantity double,
  PRIMARY KEY ((iso3_country), year, sector)
);

--    Every facility's annual CO2 per subsector/year (bounded single-partition
--    reads for the facility map).
CREATE TABLE IF NOT EXISTS analysis_source_year (
  subsector          text,
  year               int,
  source_id          bigint,
  source_name        text,
  lat                double,
  lon                double,
  emissions_quantity double,
  PRIMARY KEY ((subsector, year), source_id)
);

--    Top emitting facilities per subsector (latest available year).
CREATE TABLE IF NOT EXISTS analysis_top_sources (
  subsector          text,
  year               int,
  rank               int,
  source_id          bigint,
  source_name        text,
  lat                double,
  lon                double,
  emissions_quantity double,
  PRIMARY KEY ((subsector, year), rank)
);

--    CO2 attributed to the controlling parent company (highest ownership share),
--    summed per owner per year. One partition per year -> "owners in year Y".
CREATE TABLE IF NOT EXISTS analysis_owner_year (
  year               int,
  owner              text,
  emissions_quantity double,
  source_count       int,
  PRIMARY KEY ((year), owner)
);
