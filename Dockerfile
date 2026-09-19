# ── IB-SACKO — Image Docker pour Render / Railway / Koyeb ──
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p sessions temp

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "web.js"]

