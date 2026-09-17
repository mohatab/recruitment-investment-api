FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# node:alpine already has a non-root `node` user (uid 1000) built in — no
# reason to run the process as root when nothing here needs it. The upload
# directory is created and owned by that user up front, since the app
# writes to it at runtime (local storage driver) and a root-owned /app
# would otherwise deny that write once we drop privileges below.
RUN mkdir -p uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Liveness only (/health checks no dependencies): a MongoDB outage must not get
# a healthy process restarted. Traffic gating belongs to /health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
