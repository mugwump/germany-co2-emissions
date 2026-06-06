# German CO2 emissions pipeline — reproducible runbook.
#
# Prereqs on a fresh machine:
#   1. Docker + Docker Compose
#   2. The DEU/ data folder at the repo root (NOT in git — 4.8 GB). Either copy
#      it over from another machine, or download the Germany dataset from
#      https://climatetrace.org/data and place the CSVs under DEU/DATA/<sector>/.
#
# Quick start:  make all   (then open http://localhost:3000)
# Step by step: make up && make load && make analyze && make api && make web

COMPOSE   = docker compose
CONNECTOR = com.datastax.spark:spark-cassandra-connector_2.12:3.5.1

.PHONY: all up wait-cassandra load load-country load-sources analyze api web ps logs down clean

all: up load analyze api web ## Bring the whole stack up from scratch

up: ## Start Cassandra and wait until it accepts queries
	$(COMPOSE) up -d cassandra
	$(MAKE) wait-cassandra

wait-cassandra:
	@echo "Waiting for Cassandra to become healthy..."
	@until [ "$$($(COMPOSE) ps -q cassandra | xargs docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do \
		sleep 5; echo "  ...still starting"; \
	done
	@echo "Cassandra is healthy."

load: load-country load-sources ## Load all CSV data into Cassandra

load-country: ## Build loader, apply schema, load annual country totals
	$(COMPOSE) build loader
	$(COMPOSE) run --rm loader python load.py --apply-schema --types country_emissions

load-sources: ## Load facility sources + confidence + ownership (~9M rows; slow)
	$(COMPOSE) run --rm loader python load.py --types ownership,emissions_sources,confidence

analyze: ## Build the Kotlin Spark job and run it (writes analysis_* tables)
	$(COMPOSE) run --rm spark-build
	$(COMPOSE) run --rm --entrypoint "" spark /opt/spark/bin/spark-submit \
		--packages $(CONNECTOR) \
		--conf spark.jars.ivy=/tmp/.ivy --class co2.AnalysisKt /jars/analysis.jar

api: ## Build + start the API (http://localhost:8080, Swagger UI at /docs)
	$(COMPOSE) up -d --build api

web: ## Build + start the dashboard (http://localhost:3000)
	$(COMPOSE) up -d --build web

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Tail all logs
	$(COMPOSE) logs -f

down: ## Stop all containers (keeps loaded data)
	$(COMPOSE) down

clean: ## Stop containers AND delete volumes (wipes the loaded database)
	$(COMPOSE) down -v
