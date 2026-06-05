#!/usr/bin/env python3
"""Spark analyses over the Climate TRACE CO2 data in Cassandra.

Reads `climate_trace.country_emissions` and `emissions_sources`, computes
rollups, prints headline findings, and writes results back into the
`analysis_*` tables for the API / React layer to serve.

Run:
  docker compose run --rm spark spark-submit \
    --packages com.datastax.spark:spark-cassandra-connector_2.12:3.5.1 \
    /jobs/analysis.py
"""
import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
KEYSPACE = "climate_trace"


def cass(spark, table):
    return (spark.read.format("org.apache.spark.sql.cassandra")
            .options(table=table, keyspace=KEYSPACE).load())


def write_cass(df, table):
    (df.write.format("org.apache.spark.sql.cassandra")
        .options(table=table, keyspace=KEYSPACE)
        .mode("append").save())


def main():
    spark = (SparkSession.builder
             .appName("co2-analysis")
             .config("spark.cassandra.connection.host", CASSANDRA_HOST)
             .config("spark.sql.shuffle.partitions", "8")
             .getOrCreate())
    spark.sparkContext.setLogLevel("WARN")

    # --- 1) CO2 per sector per year (from annual country totals) -------------
    country = cass(spark, "country_emissions")
    sector_year = (country
                   .groupBy("iso3_country", "year", "sector")
                   .agg(F.sum("emissions_quantity").alias("emissions_quantity")))

    print("\n=== National CO2 by sector and year (tonnes) ===")
    (sector_year
     .groupBy("year")
     .agg(F.sum("emissions_quantity").alias("national_total"))
     .orderBy("year")
     .show(20, truncate=False))

    print("=== Top sectors, latest year ===")
    latest_year = sector_year.agg(F.max("year")).first()[0]
    (sector_year.filter(F.col("year") == latest_year)
     .orderBy(F.desc("emissions_quantity"))
     .show(20, truncate=False))

    write_cass(sector_year, "analysis_sector_year")
    print(f"-> wrote analysis_sector_year ({sector_year.count()} rows)")

    # --- 2) Top emitting facilities per subsector (latest year) --------------
    src = cass(spark, "emissions_sources").select(
        "subsector", "source_id", "source_name", "lat", "lon",
        F.year("start_time").alias("year"), "emissions_quantity")

    per_source_year = (src
                       .groupBy("subsector", "year", "source_id",
                                "source_name", "lat", "lon")
                       .agg(F.sum("emissions_quantity").alias("emissions_quantity")))

    # Every facility's annual total -> map source.
    write_cass(per_source_year.select(
        "subsector", "year", "source_id", "source_name", "lat", "lon",
        "emissions_quantity"), "analysis_source_year")
    print(f"-> wrote analysis_source_year ({per_source_year.count()} rows)")

    w = Window.partitionBy("subsector", "year").orderBy(
        F.desc("emissions_quantity"))
    top = (per_source_year
           .withColumn("rank", F.row_number().over(w))
           .filter(F.col("rank") <= 20)
           .select("subsector", "year", "rank", "source_id", "source_name",
                   "lat", "lon", "emissions_quantity"))

    print("=== Top 10 power facilities, latest year ===")
    src_latest = per_source_year.agg(F.max("year")).first()[0]
    (top.filter((F.col("subsector") == "electricity-generation")
                & (F.col("year") == src_latest))
     .orderBy("rank").show(10, truncate=False))

    write_cass(top, "analysis_top_sources")
    print(f"-> wrote analysis_top_sources ({top.count()} rows)")

    spark.stop()
    print("\nAnalysis complete.")


if __name__ == "__main__":
    main()
