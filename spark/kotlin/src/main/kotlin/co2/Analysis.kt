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
 * Build:  gradle shadowJar   (-> build/libs/analysis.jar)
 * Run:    spark-submit --packages com.datastax.spark:spark-cassandra-connector_2.12:3.5.1 \
 *           --class co2.AnalysisKt /jars/analysis.jar
 */
private const val KEYSPACE = "climate_trace"

fun main() {
    val host = System.getenv("CASSANDRA_HOST") ?: "cassandra"

    val spark = SparkSession.builder()
        .appName("co2-analysis-kotlin")
        .config("spark.cassandra.connection.host", host)
        .config("spark.sql.shuffle.partitions", "8")
        .getOrCreate()
    spark.sparkContext().setLogLevel("WARN")

    fun read(table: String): Dataset<Row> =
        spark.read().format("org.apache.spark.sql.cassandra")
            .option("keyspace", KEYSPACE).option("table", table).load()

    fun write(df: Dataset<Row>, table: String) {
        df.write().format("org.apache.spark.sql.cassandra")
            .option("keyspace", KEYSPACE).option("table", table)
            .mode("append").save()
    }

    // --- 1) CO2 per sector per year (from annual country totals) -------------
    val country = read("country_emissions")
    val sectorYear = country
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

    write(sectorYear, "analysis_sector_year")
    println("-> wrote analysis_sector_year (${sectorYear.count()} rows)")

    // --- 2) Top emitting facilities per subsector (latest year) --------------
    val src = read("emissions_sources").select(
        col("subsector"), col("source_id"), col("source_name"),
        col("lat"), col("lon"),
        year(col("start_time")).alias("year"),
        col("emissions_quantity"),
    )

    val perSourceYear = src
        .groupBy("subsector", "year", "source_id", "source_name", "lat", "lon")
        .agg(sum("emissions_quantity").alias("emissions_quantity"))

    // Every facility's annual total -> map source.
    write(
        perSourceYear.select(
            col("subsector"), col("year"), col("source_id"), col("source_name"),
            col("lat"), col("lon"), col("emissions_quantity"),
        ),
        "analysis_source_year",
    )
    println("-> wrote analysis_source_year (${perSourceYear.count()} rows)")

    val w = Window.partitionBy("subsector", "year").orderBy(desc("emissions_quantity"))
    val top = perSourceYear
        .withColumn("rank", row_number().over(w))
        .filter(col("rank").leq(20))
        .select(
            col("subsector"), col("year"), col("rank"), col("source_id"),
            col("source_name"), col("lat"), col("lon"), col("emissions_quantity"),
        )

    val srcLatest = perSourceYear.agg(max("year")).first().get(0)
    println("=== Top 10 power facilities, $srcLatest ===")
    top.filter(
        col("subsector").equalTo("electricity-generation")
            .and(col("year").equalTo(srcLatest)),
    ).orderBy("rank").show(10, false)

    write(top, "analysis_top_sources")
    println("-> wrote analysis_top_sources (${top.count()} rows)")

    spark.stop()
    println("\nAnalysis complete.")
}
