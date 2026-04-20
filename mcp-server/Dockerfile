FROM node:20-alpine

WORKDIR /app

# Install production deps only — smaller image, faster deploy
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source
COPY src ./src

# Railway injects PORT at runtime
ENV NODE_ENV=production
EXPOSE 3002

# Simple healthcheck against /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3002}/health || exit 1

CMD ["npm", "start"]
