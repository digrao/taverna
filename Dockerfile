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

# Vault e config são montados em runtime — a imagem nunca contém dados do usuário.
# vaultPath dentro do config.json montado deve apontar para /vault.
EXPOSE 3861

ENTRYPOINT ["node", "dist/cli.js", "--config", "/config/config.json"]
CMD ["serve"]
