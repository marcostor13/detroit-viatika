FROM node:20.11.1-alpine AS node
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm run build --configuration production
FROM nginx:latest AS nginx
COPY --from=node ./app/dist/gastos/browser /usr/share/nginx/html
COPY ./default.conf /etc/nginx/conf.d/default.conf