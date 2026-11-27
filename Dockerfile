# Gerador de Lista de Corte — imagem para rodar em Linux (Docker).
#
# Um processo Node só: o servidor Express serve a interface já compilada e a
# API de leitura de foto/PDF, na porta 5175. Veja deploy/LEIA-ME-DOCKER.md.
#
#   docker compose up -d --build

# ---- 1) Compila o leitor (packages/parser), o servidor e a interface --------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Primeiro só os package.json: a camada do "npm ci" só refaz quando as
# dependências mudam, não a cada alteração de código.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/parser/package.json packages/parser/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY packages packages
COPY server server
COPY client client
RUN npm run build

# ---- 2) Imagem final: só o servidor compilado + a interface ----------------
FROM node:22-bookworm-slim

# Tesseract (leitura de foto/PDF sem internet). O idioma "por" é o usado pelo
# sistema (TESSERACT_LANG).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    OCR_SERVER_PORT=5175 \
    AUTO_UPDATE_ENABLED=false

WORKDIR /app

# Só as dependências de produção do servidor. Os package.json dos outros
# workspaces entram porque o "npm ci" confere o package-lock.json inteiro.
COPY package.json package-lock.json ./
COPY packages/parser/package.json packages/parser/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace=server \
    && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

USER node
WORKDIR /app/server
EXPOSE 5175

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.OCR_SERVER_PORT || 5175) + '/api/version').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
