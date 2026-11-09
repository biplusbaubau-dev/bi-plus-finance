# ==========================================================
# BI+ Finance App — Dockerfile multi-stage
# Target: runner  = aplikasi produksi (standalone, ringan)
#         migrator = sekali pakai untuk `prisma migrate deploy`
# ==========================================================
ARG NODE_VERSION=22-alpine

# ---------- 1. dependency ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- 2. build ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma butuh DATABASE_URL hanya untuk `prisma generate` (tidak connect).
# `npm run build` TIDAK menyentuh database karena semua halaman memakai
# `export const dynamic = "force-dynamic"` — tanpa itu, Next.js mencoba
# prerender halaman dan gagal: "Can't reach database server at localhost:5432".
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

# ---------- 3. migrator (sekali jalan) ----------
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- 4. runner (produksi) ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
RUN apk add --no-cache openssl \
 && addgroup -g 1001 -S nodejs \
 && adduser  -S nextjs -u 1001

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# File statis + hasil standalone
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# ----------------------------------------------------------
# PENTING: `output: standalone` TIDAK menyertakan Prisma Client.
# Tanpa dua baris di bawah, container crash dengan
# PrismaClientInitializationError pada query pertama.
# ----------------------------------------------------------
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Siapkan folder upload agar bisa di-mount volume (foto unit tidak hilang saat rebuild)
RUN mkdir -p /app/public/uploads/units \
 && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
