FROM node:20-alpine AS builder
# Replicate local project structure so ../../../ relative imports resolve correctly
WORKDIR /app/yaml-proj
COPY services/lexer/package.json services/lexer/package-lock.json services/lexer/tsconfig.json /app/yaml-proj/services/lexer/
COPY services/lexer/src/ /app/yaml-proj/services/lexer/src/
COPY shared/ /app/yaml-proj/shared/
WORKDIR /app/yaml-proj/services/lexer
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/yaml-proj/services/lexer/dist /app/dist
COPY --from=builder /app/yaml-proj/services/lexer/node_modules /app/node_modules
EXPOSE ${PORT:-4001}
CMD ["node", "dist/services/lexer/src/index.js"]
