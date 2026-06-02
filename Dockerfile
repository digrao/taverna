FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── runtime ────────────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

ENV VAULT_PATH=/vault

EXPOSE 2948

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
