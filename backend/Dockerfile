FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
# Build context is ./backend, so COPY sources are relative to backend/
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Production node process
ENV NODE_ENV=production
EXPOSE 5001
CMD ["node", "server.js"]