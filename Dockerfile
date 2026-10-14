# Runs on the Oracle Arm64 VM (node:22-slim is multi-arch). See DEPLOY.md.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
# The built-in database lives in the /data volume so rebuilds keep products, reels and stats.
ENV DATA_DIR=/data/pgdata
CMD ["node", "src/server.js"]
