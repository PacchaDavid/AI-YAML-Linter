FROM node:20-alpine AS builder
# Replicate local project structure so ../../../ relative imports resolve correctly
WORKDIR /app/yaml-proj
COPY services/parser/package.json services/parser/package-lock.json services/parser/tsconfig.json /app/yaml-proj/services/parser/
COPY services/parser/src/ /app/yaml-proj/services/parser/src/
COPY shared/ /app/yaml-proj/shared/
WORKDIR /app/yaml-proj/services/parser
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/parser/dist /app/dist
COPY --from=builder /app/yaml-proj/services/parser/node_modules /app/node_modules
EXPOSE ${PORT:-4002}
CMD ["node", "dist/services/parser/src/index.js"]
