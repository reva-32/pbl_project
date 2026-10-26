FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
# Build context is ./frontend
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Serve with a minimal static server
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy only the build output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Serve with serve (lightweight)
RUN npm install -g serve

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]