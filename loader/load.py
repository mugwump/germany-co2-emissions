#!/usr/bin/env python3
"""Load Climate TRACE (DEU, CO2) CSVs into Cassandra.

Discovers files by type from $DATA_ROOT, maps each CSV row to a prepared
INSERT, and streams them in with bounded concurrency. Big source files
(millions of rows) are handled the same streaming way, never held in memory.

Usage:
  python load.py --apply-schema --types country_emissions
  python load.py --types emissions_sources,confidence,ownership
  python load.py --types all
"""
import argparse
import csv
import glob
import os
import re
import sys
from datetime import datetime

from cassandra.cluster import Cluster
from cassandra.concurrent import execute_concurrent_with_args

# CSV cells can exceed the default field-size limit (long ownership_path etc.)
csv.field_size_limit(sys.maxsize)

DATA_ROOT = os.environ.get("DATA_ROOT", "/data/DEU/DATA")
CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
SCHEMA_FILE = os.environ.get("SCHEMA_FILE", "/schema/schema.cql")
KEYSPACE = "climate_trace"
CONCURRENCY = 100


# ---- value converters -------------------------------------------------------
def ts(v):
    """Parse a Climate TRACE timestamp, with or without microseconds."""
    if not v:
        return None
    v = v.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def f(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def i(v):
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def s(v):
    if v is None:
        return None
    v = v.strip()
    return v or None


def year_of(v):
    """Year as int from a 'YYYY-...' start_time string."""
    return int(v[:4]) if v and len(v) >= 4 and v[:4].isdigit() else None


# ---- per-type configuration -------------------------------------------------
# Each entry: filename pattern, target table, ordered column list, row->tuple fn.

def _other_map(row):
    """Collapse the sparse other1..other10 / otherN_def pairs into a map."""
    out = {}
    for n in range(1, 11):
        key = s(row.get(f"other{n}_def"))
        val = s(row.get(f"other{n}"))
        if key and val is not None:
            out[key] = val
    return out or None


TYPES = {
    "country_emissions": {
        "pattern": "_country_emissions_v",
        "table": "country_emissions",
        "columns": [
            "iso3_country", "sector", "subsector", "year", "gas",
            "start_time", "end_time", "emissions_quantity",
            "emissions_quantity_units", "temporal_granularity",
            "created_date", "modified_date",
        ],
        "row": lambda r: (
            s(r["iso3_country"]), s(r["sector"]), s(r["subsector"]),
            year_of(r["start_time"]), s(r["gas"]),
            ts(r["start_time"]), ts(r["end_time"]), f(r["emissions_quantity"]),
            s(r["emissions_quantity_units"]), s(r["temporal_granularity"]),
            ts(r["created_date"]), ts(r["modified_date"]),
        ),
    },
    "emissions_sources": {
        "pattern": "_emissions_sources_v",
        "table": "emissions_sources",
        "columns": [
            "subsector", "source_id", "start_time", "end_time", "source_name",
            "source_type", "iso3_country", "sector", "lat", "lon",
            "geometry_ref", "gas", "emissions_quantity", "temporal_granularity",
            "activity", "activity_units", "emissions_factor",
            "emissions_factor_units", "capacity", "capacity_units",
            "capacity_factor", "other", "created_date", "modified_date",
        ],
        "row": lambda r: (
            s(r["subsector"]), i(r["source_id"]), ts(r["start_time"]),
            ts(r["end_time"]), s(r["source_name"]), s(r["source_type"]),
            s(r["iso3_country"]), s(r["sector"]), f(r["lat"]), f(r["lon"]),
            s(r["geometry_ref"]), s(r["gas"]), f(r["emissions_quantity"]),
            s(r["temporal_granularity"]), f(r["activity"]), s(r["activity_units"]),
            f(r["emissions_factor"]), s(r["emissions_factor_units"]),
            f(r["capacity"]), s(r["capacity_units"]), f(r["capacity_factor"]),
            _other_map(r), ts(r["created_date"]), ts(r["modified_date"]),
        ),
    },
    "confidence": {
        "pattern": "_emissions_sources_confidence_v",
        "table": "emissions_sources_confidence",
        "columns": [
            "subsector", "source_id", "start_time", "end_time", "source_name",
            "iso3_country", "sector", "source_type", "gas", "capacity",
            "capacity_factor", "activity", "emissions_factor",
            "emissions_quantity", "created_date", "modified_date",
        ],
        "row": lambda r: (
            s(r["subsector"]), i(r["source_id"]), ts(r["start_time"]),
            ts(r["end_time"]), s(r["source_name"]), s(r["iso3_country"]),
            s(r["sector"]), s(r["source_type"]), s(r["gas"]), s(r["capacity"]),
            s(r["capacity_factor"]), s(r["activity"]), s(r["emissions_factor"]),
            s(r["emissions_quantity"]), ts(r["created_date"]),
            ts(r["modified_date"]),
        ),
    },
    "ownership": {
        "pattern": "_emissions_sources_ownership_v",
        "table": "emissions_sources_ownership",
        "columns": [
            "source_subsector", "source_id", "parent_entity_id", "parent_name",
            "parent_entity_type", "parent_lei", "parent_permid",
            "parent_registration_country", "parent_headquarter_country",
            "overall_share_percent", "ownership_path", "immediate_source_owner",
            "immediate_source_owner_entity_id", "source_operator",
            "source_operator_id", "percentage_of_operation", "source_name",
            "source_sector", "iso3_country",
        ],
        "row": lambda r: (
            s(r["source_subsector"]), i(r["source_id"]),
            s(r["parent_entity_id"]) or "?", s(r["parent_name"]),
            s(r["parent_entity_type"]), s(r["parent_lei"]), s(r["parent_permid"]),
            s(r["parent_registration_country"]),
            s(r["parent_headquarter_country"]), f(r["overall_share_percent"]),
            s(r["ownership_path"]), s(r["immediate_source_owner"]),
            s(r["immediate_source_owner_entity_id"]), s(r["source_operator"]),
            s(r["source_operator_id"]), f(r["percentage_of_operation"]),
            s(r["source_name"]), s(r["source_sector"]), s(r["iso3_country"]),
        ),
    },
}


def discover(pattern, name_filter=None):
    files = glob.glob(os.path.join(DATA_ROOT, "*", "*.csv"))
    files = [p for p in files if pattern in os.path.basename(p)]
    if name_filter:
        files = [p for p in files if name_filter in p]
    return sorted(files)


def apply_schema(session):
    print(f"Applying schema from {SCHEMA_FILE} ...", flush=True)
    with open(SCHEMA_FILE) as fh:
        body = fh.read()
    # Strip comments and split on ';'
    body = re.sub(r"--.*", "", body)
    for stmt in (x.strip() for x in body.split(";")):
        if not stmt:
            continue
        if stmt.upper().startswith("USE"):
            session.set_keyspace(stmt.split()[1].strip())
        else:
            session.execute(stmt)
    print("Schema applied.", flush=True)


def load_type(session, name, name_filter=None):
    cfg = TYPES[name]
    files = discover(cfg["pattern"], name_filter)
    table = cfg["table"]
    cols = cfg["columns"]
    insert = session.prepare(
        f"INSERT INTO {KEYSPACE}.{table} ({', '.join(cols)}) "
        f"VALUES ({', '.join(['?'] * len(cols))})"
    )
    to_row = cfg["row"]
    print(f"\n=== {name}: {len(files)} file(s) -> {table} ===", flush=True)
    grand = 0
    for path in files:
        n = 0
        batch = []
        with open(path, newline="") as fh:
            reader = csv.DictReader(fh)
            for r in reader:
                try:
                    batch.append(to_row(r))
                except (KeyError, ValueError) as e:
                    print(f"  skip row in {os.path.basename(path)}: {e}",
                          flush=True)
                    continue
                if len(batch) >= 1000:
                    execute_concurrent_with_args(
                        session, insert, batch, concurrency=CONCURRENCY)
                    n += len(batch)
                    batch = []
        if batch:
            execute_concurrent_with_args(
                session, insert, batch, concurrency=CONCURRENCY)
            n += len(batch)
        grand += n
        print(f"  {os.path.basename(path)}: {n:,} rows", flush=True)
    print(f"--- {name} total: {grand:,} rows ---", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply-schema", action="store_true")
    ap.add_argument("--types", default="all",
                    help="comma list of: " + ",".join(TYPES) + ",all")
    ap.add_argument("--filter", default=None,
                    help="only load files whose path contains this substring "
                         "(e.g. a sector dir or subsector name)")
    args = ap.parse_args()

    cluster = Cluster([CASSANDRA_HOST], protocol_version=4)
    session = cluster.connect()

    if args.apply_schema:
        apply_schema(session)

    requested = list(TYPES) if args.types == "all" else \
        [t.strip() for t in args.types.split(",") if t.strip()]
    for name in requested:
        if name not in TYPES:
            print(f"unknown type: {name}", flush=True)
            continue
        load_type(session, name, args.filter)

    cluster.shutdown()
    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
