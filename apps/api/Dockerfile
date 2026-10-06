# Build context: repository root (see docker-compose.yml).
FROM node:22.23.3-alpine3.24 AS base
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Full toolchain (Prisma CLI, tsx, esbuild). Also the image of the one-shot `migrate` service.
FROM base AS build
RUN npm ci --ignore-scripts --workspace @scheduling/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build
USER node

FROM base AS prod-deps
# `--omit=dev` keeps "devOptional" packages (the Prisma CLI, Studio, TypeScript: optional peers of
# @prisma/client that are also dev dependencies), about 200 MB the bundle never loads. They are
# removed by their lockfile flag; `--omit=optional` is not an option because it would also drop
# the platform-specific argon2 binary.
RUN npm ci --omit=dev --ignore-scripts --workspace @scheduling/api \
 && node -e "const fs=require('node:fs');for(const[path,meta]of Object.entries(require('./package-lock.json').packages))if(meta.devOptional&&path.startsWith('node_modules/'))fs.rmSync(path,{recursive:true,force:true})" \
 && npm cache clean --force

FROM node:22.23.3-alpine3.24 AS runtime
# Safe default for anyone running the image directly; compose overrides it for local evaluation.
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
