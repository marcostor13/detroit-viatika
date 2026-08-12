# Build stage
# node:22+ requerido: pdfjs-dist (renderizado de PDF a imagen) declara
# engines.node >=22.13 || >=24; en 20 rompe en runtime al procesar PDFs.
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
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
EXPOSE 3040
CMD ["node", "--max-old-space-size=1400", "--expose-gc", "dist/main"]
