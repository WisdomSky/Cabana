# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS build
WORKDIR /src
COPY package.json ./
COPY server/package.json server/package-lock.json server/
COPY web/package.json web/package-lock.json web/
RUN npm --prefix server ci && npm --prefix web ci
COPY server server
COPY web web
ARG CABANA_VERSION=dev
RUN npm --prefix web run build \
 && npm --prefix server run build \
 && printf '%s\n' "${CABANA_VERSION}" > /version

FROM docker:28-cli AS dockercli
FROM node:26-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/bin/docker /usr/local/lib/docker/cli-plugins/docker-compose
WORKDIR /app
COPY --from=build /src/server/dist/server.cjs /app/server.cjs
COPY --from=build /src/web/dist /app/web/dist
COPY --from=build /version /app/VERSION
ENV NODE_ENV=production \
    CABANA_WEB_DIR=/app/web/dist \
    CABANA_PORT=8080
EXPOSE 8080
CMD ["node", "/app/server.cjs"]
