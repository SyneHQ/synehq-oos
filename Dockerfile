# syntax=docker/dockerfile:1.7
ARG OOS_BASE_PATH=""
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS web-build
ARG OOS_BASE_PATH
WORKDIR /source
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_OOS_BASE_PATH=$OOS_BASE_PATH
RUN apt-get update && apt-get install --no-install-recommends -y openssl tini && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/explorer/package.json packages/explorer/package.json
COPY packages/explorer-contracts/package.json packages/explorer-contracts/package.json
COPY packages/kelvo-client/package.json packages/kelvo-client/package.json
COPY packages/charts/package.json packages/charts/package.json
RUN npm ci --include=dev
COPY . .
RUN npm run db:generate && npm run build
RUN mkdir -p /runtime/node_modules/@prisma /runtime/node_modules/.prisma \
    && cp -a node_modules/@prisma/client /runtime/node_modules/@prisma/client \
    && cp -a node_modules/.prisma/client /runtime/node_modules/.prisma/client

FROM golang:1.26.8-bookworm@sha256:dc9ad6c05acc7a88e5b71bde60a5fe3bd4b9f0db209011711b464107438a8107 AS native-build
WORKDIR /kelvo
COPY --from=kelvo_source . .
RUN go work init . ./adapters/go \
    && go work edit "-replace=github.com/SYNEHQ/kelvo-go@$(awk '$1 == "github.com/SYNEHQ/kelvo-go" { print $2 }' adapters/go/go.mod)=." \
    && go work edit -replace=github.com/sijms/go-ora/v2@v2.9.0=./third_party/go-ora-v2.9.0
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=1 go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/kelvo ./cmd/kelvo \
    && cd adapters/go \
    && CGO_ENABLED=1 go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/kelvo-operation-adapter ./cmd/kelvo-adapter-go
RUN cc -O2 -Wall -Wextra -Werror -std=c11 -o /out/kelvo-sandbox sandbox/launcher.c
COPY deploy/certificates/ /certificates/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/oos-runtime /certificates/main.go

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f AS runtime
ARG OOS_BASE_PATH
ENV OOS_BASE_PATH=$OOS_BASE_PATH
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100 \
    OOS_DATA_DIR=/data/runtime \
    OOS_SQLITE_ROOT=/data/sqlite-databases \
    DATABASE_URL=file:/data/runtime/metadata.sqlite \
    OOS_STATIC_DIR=/app/public \
    OOS_TLS_TOOL=/app/bin/oos-runtime \
    KELVO_BIN_DIR=/app/bin \
    KELVO_CGROUP_ROOT=/run/kelvo-cgroup \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build /usr/local/bin/node /nodejs/bin/node
COPY --from=web-build /usr/bin/tini /usr/bin/tini
COPY --from=web-build /usr/share/doc/tini/copyright /app/licenses/tini/copyright
COPY --from=web-build /usr/local/LICENSE /app/licenses/node/LICENSE
COPY --from=web-build /source/dist /app/dist
COPY --from=web-build /source/apps/web/out /app/public
COPY --from=web-build /runtime/node_modules /app/node_modules
COPY --from=native-build /out /app/bin
COPY --from=kelvo_source LICENSE /app/licenses/kelvo/LICENSE
COPY --from=kelvo_source third_party/go-ora-v2.9.0/LICENSE /app/licenses/go-ora/LICENSE
COPY --from=kelvo_source third_party/go-ora-v2.9.0/PATCHES.md /app/licenses/go-ora/PATCHES.md
COPY LICENSE NOTICES /app/
COPY --chown=65532:65532 deploy/volume/ /data/
USER 65532:65532
VOLUME ["/data"]
EXPOSE 3100
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=45s --retries=3 \
  CMD ["/app/bin/oos-runtime", "health"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/bin/oos-runtime", "lock", "/data", "/nodejs/bin/node", "--max-old-space-size=192", "/app/dist/container.mjs"]
