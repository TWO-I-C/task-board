FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server/ ./server/
ENV NODE_ENV=production \
    API_HOST=0.0.0.0
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
