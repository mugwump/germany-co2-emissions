package co2

import org.apache.spark.sql.Dataset
import org.apache.spark.sql.Row
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.expressions.Window
import org.apache.spark.sql.functions.coalesce
import org.apache.spark.sql.functions.col
import org.apache.spark.sql.functions.count
import org.apache.spark.sql.functions.desc
import org.apache.spark.sql.functions.lit
import org.apache.spark.sql.functions.max
import org.apache.spark.sql.functions.row_number
import org.apache.spark.sql.functions.sum
import org.apache.spark.sql.functions.year

/**
 * Spark analyses over the Climate TRACE CO2 data in Cassandra — Kotlin port of
 * analysis.py, using the native Spark Java API (no kotlin-spark-api).
 *
 * Each statistic lives in its own function; [main] just wires them together.
 *
 * Build:  gradle shadowJar   (-> build/libs/analysis.jar)
 * Run:    spark-submit --packages com.datastax.spark:spark-cassandra-connector_2.12:3.5.1 \
 *           --class co2.AnalysisKt /jars/analysis.jar
 */
private const val KEYSPACE = "climate_trace"

fun main() {
    val spark = buildSession()
    try {
        sectorYearStat(spark)
        val perSourceYear = sourceYearStat(spark)
        topSourcesStat(perSourceYear)
        ownerYearStat(spark, perSourceYear)
    } finally {
        spark.stop()
    }
    println("\nAnalysis complete.")
}

// --- infrastructure ----------------------------------------------------------

private fun buildSession(): SparkSession {
    val host = System.getenv("CASSANDRA_HOST") ?: "cassandra"
    val spark = SparkSession.builder()
        .appName("co2-analysis-kotlin")
        .config("spark.cassandra.connection.host", host)
        .config("spark.sql.shuffle.partitions", "8")
        .getOrCreate()
    spark.sparkContext().setLogLevel("WARN") 
    return spark
}

private fun SparkSession.readTable(table: String): Dataset<Row> =
    read().format("org.apache.spark.sql.cassandra")
        .option("keyspace", KEYSPACE).option("table", table).load()

private fun Dataset<Row>.writeTable(table: String) {
    write().format("org.apache.spark.sql.cassandra")
        .option("keyspace", KEYSPACE).option("table", table)
        .mode("append").save()
}

// --- statistics --------------------------------------------------------------

/** CO2 per sector per year (from annual country totals) -> analysis_sector_year. */
private fun sectorYearStat(spark: SparkSession) {
    val sectorYear = spark.readTable(Tables.country_emissions)
        .groupBy(Col.iso3_country, Col.year, Col.sector)
        .agg(sum(Col.emissions_quantity).alias(Col.emissions_quantity))

    println("\n=== National CO2 by sector and year (tonnes) ===")
    sectorYear.groupBy(Col.year)
        .agg(sum(Col.emissions_quantity).alias("national_total"))
        .orderBy(Col.year)
        .show(20, false)

    val latestYear = sectorYear.agg(max(Col.year)).first().get(0)
    println("=== Top sectors, $latestYear ===")
    sectorYear.filter(col(Col.year).equalTo(latestYear))
        .orderBy(desc(Col.emissions_quantity))
        .show(20, false)

    sectorYear.writeTable(Tables.analysis_sector_year)
    println("-> wrote analysis_sector_year (${sectorYear.count()} rows)")
}

/**
 * Every facility's annual CO2 (monthly source rows summed) -> analysis_source_year.
 * Returns the cached aggregate so [topSourcesStat] can reuse it without
 * recomputing the (expensive) group-by over millions of source rows.
 */
private fun sourceYearStat(spark: SparkSession): Dataset<Row> {
    val perSourceYear = spark.readTable(Tables.emissions_sources)
        .select(
            col(Col.subsector), col(Col.source_id), col(Col.source_name),
            col(Col.lat), col(Col.lon),
            year(col(Col.start_time)).alias(Col.year),
            col(Col.emissions_quantity),
        )
        .groupBy(Col.subsector, Col.year, Col.source_id, Col.source_name, Col.lat, Col.lon)
        .agg(sum(Col.emissions_quantity).alias(Col.emissions_quantity))
        .cache()

    perSourceYear.writeTable(Tables.analysis_source_year)
    println("-> wrote analysis_source_year (${perSourceYear.count()} rows)")
    return perSourceYear
}

/** Top-20 emitting facilities per subsector/year -> analysis_top_sources. */
private fun topSourcesStat(perSourceYear: Dataset<Row>) {
    val ranked = Window.partitionBy(Col.subsector, Col.year).orderBy(desc(Col.emissions_quantity))
    val top = perSourceYear
        .withColumn(Col.rank, row_number().over(ranked))
        .filter(col(Col.rank).leq(20))
        .select(
            col(Col.subsector), col(Col.year), col(Col.rank), col(Col.source_id),
            col(Col.source_name), col(Col.lat), col(Col.lon), col(Col.emissions_quantity),
        )

    val latestYear = perSourceYear.agg(max(Col.year)).first().get(0)
    println("=== Top 10 power facilities, $latestYear ===")
    top.filter(
        col(Col.subsector).equalTo("electricity-generation")
            .and(col(Col.year).equalTo(latestYear)),
    ).orderBy(Col.rank).show(10, false)

    top.writeTable(Tables.analysis_top_sources)
    println("-> wrote analysis_top_sources (${top.count()} rows)")
}

/**
 * CO2 attributed to the controlling parent company -> analysis_owner_year.
 * "Controlling parent" = the ownership-path entry with the highest
 * overall_share_percent for that source (nulls treated as 0, so a named share
 * wins; ties broken by name). Each source's full annual emissions are credited
 * to that one company, then summed per owner per year. Only sources that have
 * an ownership record are included.
 */
private fun ownerYearStat(spark: SparkSession, perSourceYear: Dataset<Row>) {
    val byShare = Window.partitionBy(Col.source_id)
        .orderBy(coalesce(col(Col.overall_share_percent), lit(0.0)).desc(), col(Col.parent_name))
    val controlling = spark.readTable(Tables.emissions_sources_ownership)
        .filter(col(Col.parent_name).isNotNull())
        .select(col(Col.source_id), col(Col.parent_name), col(Col.overall_share_percent))
        .withColumn("rn", row_number().over(byShare))
        .filter(col("rn").equalTo(1))
        .select(col(Col.source_id), col(Col.parent_name).alias(Col.owner))

    val ownerYear = perSourceYear
        .join(controlling, Col.source_id)
        .groupBy(col(Col.owner), col(Col.year))
        .agg(
            sum(Col.emissions_quantity).alias(Col.emissions_quantity),
            count(Col.source_id).cast("int").alias(Col.source_count),
        )

    val latestYear = ownerYear.agg(max(Col.year)).first().get(0)
    println("=== Top 10 owners by CO2, $latestYear ===")
    ownerYear.filter(col(Col.year).equalTo(latestYear))
        .orderBy(desc(Col.emissions_quantity))
        .show(10, false)

    ownerYear.writeTable(Tables.analysis_owner_year)
    // Same rows keyed by owner -> per-company time series (single-partition read).
    ownerYear.writeTable(Tables.analysis_owner_trend)
    println("-> wrote analysis_owner_year / analysis_owner_trend (${ownerYear.count()} rows)")
}
