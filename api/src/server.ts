import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import { connectWithRetry } from "./cassandra.js";
import { emissionsRoutes } from "./routes/emissions.js";

export async function buildServer() {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: {
      info: { title: "CO2 Emissions API (DEU, Climate TRACE)", version: "0.1.0" },
      servers: [{ url: "http://localhost:8080" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(emissionsRoutes);

  return app;
}

const isMain = process.argv[1]?.endsWith("server.ts");
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  connectWithRetry()
    .then(buildServer)
    .then((app) => app.listen({ port, host: "0.0.0.0" }))
    .then(() => console.log(`API listening on :${port} (docs at /docs)`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
