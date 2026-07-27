FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
# Provide a dummy DATABASE_URL for build if needed, though usually generate doesn't need it.
ENV DATABASE_URL="file:./dev.db"
RUN npx prisma generate

# Next.js telemetry can be disabled during the build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js app
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy necessary files for runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Ensure prisma folder exists and has correct permissions so SQLite can be written
RUN mkdir -p /app/prisma

# Start command
# Gets keys from the env (DATABASE_URL, NEXTAUTH_SECRET, etc)
# Runs the local SQLite db setup script, then migrations, then starts the app
CMD sh -c 'node scripts/ensure-sqlite-database.mjs && npx prisma migrate deploy && npm run start'
