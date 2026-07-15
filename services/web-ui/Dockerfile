FROM node:20-alpine AS builder
WORKDIR /app/yaml-proj
COPY services/web-ui/package.json services/web-ui/package-lock.json services/web-ui/tsconfig.json /app/yaml-proj/services/web-ui/
COPY services/web-ui/src/ /app/yaml-proj/services/web-ui/src/
WORKDIR /app/yaml-proj/services/web-ui
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/web-ui/dist /app/dist
COPY --from=builder /app/yaml-proj/services/web-ui/node_modules /app/node_modules
COPY services/web-ui/src/public /app/dist/public
EXPOSE ${PORT:-5000}
CMD ["node", "dist/index.js"]
