# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time config consumed by scripts/set-env.js (see prebuild hook in package.json).
# Coolify: define these as "Build Variables" on the frontend app so they are passed
# as --build-arg automatically.
ARG API_URL
ARG GOOGLE_MAPS_API_KEY
ARG STORAGE_KEY
ARG STORAGE_PATH
ENV API_URL=$API_URL
ENV GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY
ENV STORAGE_KEY=$STORAGE_KEY
ENV STORAGE_PATH=$STORAGE_PATH

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build -- --configuration production

# Production stage
FROM nginx:alpine AS production
COPY --from=builder /app/dist/gastos/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
