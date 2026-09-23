# Pinned by digest, not just by tag: `node:20-alpine` moves, so an image built
# today and one built next month are not the same image. The digest makes a
# rebuild reproducible; bump it deliberately when picking up a Node patch.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app

# Dependencies first, so a source-only change reuses this layer. `npm ci`
# installs exactly what package-lock.json pins and fails if the two files
# disagree, which `npm install` would silently paper over.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only the application source: tests, scripts, coverage, .env and the local
# uploads directory are excluded by .dockerignore and are not runtime inputs.
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

# Exec form: node is PID 1 and receives SIGTERM itself, which is what makes the
# graceful shutdown in src/server.js run on `docker stop` (a shell wrapper
# would swallow the signal). The process spawns no children, so there is
# nothing for an init to reap.
CMD ["node", "src/server.js"]
