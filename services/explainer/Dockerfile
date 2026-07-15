FROM node:20-alpine AS builder
# Replicate local project structure so ../../../ relative imports resolve correctly
WORKDIR /app/yaml-proj
COPY services/explainer/package.json services/explainer/package-lock.json services/explainer/tsconfig.json /app/yaml-proj/services/explainer/
COPY services/explainer/src/ /app/yaml-proj/services/explainer/src/
COPY shared/ /app/yaml-proj/shared/
WORKDIR /app/yaml-proj/services/explainer
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/explainer/dist /app/dist
COPY --from=builder /app/yaml-proj/services/explainer/node_modules /app/node_modules
EXPOSE ${PORT:-4004}
CMD ["node", "dist/services/explainer/src/index.js"]
