# Stage 1: Build the application
FROM node:lts-alpine3.21 AS builder
WORKDIR /app
ENV NODE_ENV=development

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with npm ci for consistent builds
RUN npm ci

# Copy source
COPY . .

# Build with tsc
RUN npm run build

# Verify the otel-setup.js file exists
RUN ls -la dist/ 

# Stage 2: Production image
FROM node:lts-alpine3.21 AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled code and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/lib/jsonld-context.json ./dist/lib/jsonld-context.json

EXPOSE 3000

# Run with Node.js
CMD ["node", "--require", "./dist/otel-setup.js", "dist/index.js"]