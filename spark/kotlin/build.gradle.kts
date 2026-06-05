import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    kotlin("jvm") version "1.9.25"
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

repositories { mavenCentral() }

// The apache/spark:3.5.3 runtime is Java 11 — emit class file version 55.
// Both Kotlin and Java targets must agree (Gradle validates consistency).
java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}
tasks.withType<KotlinCompile> {
    kotlinOptions { jvmTarget = "11" }
}

dependencies {
    // Spark (+ Scala) is provided by the cluster at runtime — compile against it
    // but do NOT bundle it into the app jar. The Cassandra connector is supplied
    // separately via spark-submit --packages.
    compileOnly("org.apache.spark:spark-sql_2.12:3.5.3")
    // kotlin-stdlib is added by the kotlin plugin as `implementation` and IS
    // shaded into the jar so it reaches the Spark executors.
}

// Produce build/libs/analysis.jar (thin uber-jar: our code + kotlin-stdlib).
tasks.named<ShadowJar>("shadowJar") {
    archiveBaseName.set("analysis")
    archiveClassifier.set("")
    archiveVersion.set("")
}
