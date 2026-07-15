FROM node:20-alpine AS builder
# Replicate local project structure so ../../../ relative imports resolve correctly
WORKDIR /app/yaml-proj
COPY services/semantic-analyzer/package.json services/semantic-analyzer/package-lock.json services/semantic-analyzer/tsconfig.json /app/yaml-proj/services/semantic-analyzer/
COPY services/semantic-analyzer/src/ /app/yaml-proj/services/semantic-analyzer/src/
COPY shared/ /app/yaml-proj/shared/
WORKDIR /app/yaml-proj/services/semantic-analyzer
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/semantic-analyzer/dist /app/dist
COPY --from=builder /app/yaml-proj/services/semantic-analyzer/node_modules /app/node_modules
EXPOSE ${PORT:-4003}
CMD ["node", "dist/services/semantic-analyzer/src/index.js"]
