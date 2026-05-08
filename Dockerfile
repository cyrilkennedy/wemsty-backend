FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PM2_HOME=/tmp/.pm2
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN addgroup -S wemsty && adduser -S wemsty -G wemsty
USER wemsty
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./node_modules/.bin/pm2-runtime", "ecosystem.config.js"]
