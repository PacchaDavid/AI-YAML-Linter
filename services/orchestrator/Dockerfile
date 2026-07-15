FROM node:20-alpine AS builder
# Replicate local project structure so ../../../ relative imports resolve correctly
WORKDIR /app/yaml-proj
COPY services/orchestrator/package.json services/orchestrator/package-lock.json services/orchestrator/tsconfig.json /app/yaml-proj/services/orchestrator/
COPY services/orchestrator/src/ /app/yaml-proj/services/orchestrator/src/
COPY shared/ /app/yaml-proj/shared/
WORKDIR /app/yaml-proj/services/orchestrator
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/orchestrator/dist /app/dist
COPY --from=builder /app/yaml-proj/services/orchestrator/node_modules /app/node_modules
EXPOSE ${PORT:-4000}
CMD ["node", "dist/services/orchestrator/src/index.js"]
