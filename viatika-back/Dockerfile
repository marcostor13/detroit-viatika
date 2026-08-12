# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# poppler-utils (pdftoppm): rasteriza PDF a imagen para el OCR de facturas
# (expense.service.ts). Se probó antes con un addon nativo (@napi-rs/canvas)
# que requería AVX2 y crasheaba con SIGILL en este servidor; pdftoppm es un
# binario de sistema sin ese requisito.
RUN apk add --no-cache poppler-utils
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
EXPOSE 3040
CMD ["node", "--max-old-space-size=1400", "--expose-gc", "dist/main"]
