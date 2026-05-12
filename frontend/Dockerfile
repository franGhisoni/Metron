FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
# All API calls use relative paths — nginx proxies /api at runtime.
# VITE_API_BASE_URL must NOT be set; it bypasses nginx and breaks cookies.
RUN pnpm build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# envsubst replaces $PORT and $BACKEND_URL; other nginx $vars are left alone
CMD ["/bin/sh", "-c", "export BACKEND_URL=${BACKEND_URL:-https://metron-production.up.railway.app} && envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
