FROM node:22-slim

# Dev tooling so you can attach VS Code to this container and run Claude Code
# inside it. git: diffs/history/commits for the frontend. claude: the CLI.
# (Cached early so app-layer changes don't reinstall these.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates less \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
# Regenerate the API client from openapi.json, then build the SSR bundle.
RUN npm run gen && npm run build

EXPOSE 3000
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
