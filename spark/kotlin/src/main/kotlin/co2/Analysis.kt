package co2

import org.apache.spark.sql.Dataset
import org.apache.spark.sql.Row
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.expressions.Window
import org.apache.spark.sql.functions.col
import org.apache.spark.sql.functions.desc
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
    val sectorYear = spark.readTable("country_emissions")
        .groupBy("iso3_country", "year", "sector")
        .agg(sum("emissions_quantity").alias("emissions_quantity"))

    println("\n=== National CO2 by sector and year (tonnes) ===")
    sectorYear.groupBy("year")
        .agg(sum("emissions_quantity").alias("national_total"))
        .orderBy("year")
        .show(20, false)

    val latestYear = sectorYear.agg(max("year")).first().get(0)
    println("=== Top sectors, $latestYear ===")
    sectorYear.filter(col("year").equalTo(latestYear))
        .orderBy(desc("emissions_quantity"))
        .show(20, false)

    sectorYear.writeTable("analysis_sector_year")
    println("-> wrote analysis_sector_year (${sectorYear.count()} rows)")
}

/**
 * Every facility's annual CO2 (monthly source rows summed) -> analysis_source_year.
 * Returns the cached aggregate so [topSourcesStat] can reuse it without
 * recomputing the (expensive) group-by over millions of source rows.
 */
private fun sourceYearStat(spark: SparkSession): Dataset<Row> {
    val perSourceYear = spark.readTable("emissions_sources")
        .select(
            col("subsector"), col("source_id"), col("source_name"),
            col("lat"), col("lon"),
            year(col("start_time")).alias("year"),
            col("emissions_quantity"),
        )
        .groupBy("subsector", "year", "source_id", "source_name", "lat", "lon")
        .agg(sum("emissions_quantity").alias("emissions_quantity"))
        .cache()

    perSourceYear.writeTable("analysis_source_year")
    println("-> wrote analysis_source_year (${perSourceYear.count()} rows)")
    return perSourceYear
}

/** Top-20 emitting facilities per subsector/year -> analysis_top_sources. */
private fun topSourcesStat(perSourceYear: Dataset<Row>) {
    val ranked = Window.partitionBy("subsector", "year").orderBy(desc("emissions_quantity"))
    val top = perSourceYear
        .withColumn("rank", row_number().over(ranked))
        .filter(col("rank").leq(20))
        .select(
            col("subsector"), col("year"), col("rank"), col("source_id"),
            col("source_name"), col("lat"), col("lon"), col("emissions_quantity"),
        )

    val latestYear = perSourceYear.agg(max("year")).first().get(0)
    println("=== Top 10 power facilities, $latestYear ===")
    top.filter(
        col("subsector").equalTo("electricity-generation")
            .and(col("year").equalTo(latestYear)),
    ).orderBy("rank").show(10, false)

    top.writeTable("analysis_top_sources")
    println("-> wrote analysis_top_sources (${top.count()} rows)")
}
