import { Client } from "cassandra-driver";

const contactPoint = process.env.CASSANDRA_HOST ?? "cassandra";

export const cassandra = new Client({
  contactPoints: [contactPoint],
  localDataCenter: process.env.CASSANDRA_DC ?? "datacenter1",
  keyspace: "climate_trace",
});

export async function connectWithRetry(retries = 30, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await cassandra.connect();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(
        `Cassandra not ready (attempt ${attempt}/${retries}), retrying...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
