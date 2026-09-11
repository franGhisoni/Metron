FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
# All API calls use relative paths — nginx proxies /api at runtime.
RUN pnpm build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# Appterix may expose an internal backend as `service:port`, while proxy_pass
# requires a URL with a scheme. Normalize that form before rendering nginx.
# envsubst replaces only $PORT and $BACKEND_URL; nginx runtime variables stay intact.
CMD ["/bin/sh", "-c", "export PORT=${PORT:-80}; export BACKEND_URL=${BACKEND_URL:-https://metron-production.up.railway.app}; case \"$BACKEND_URL\" in http://*|https://*) ;; *) BACKEND_URL=\"http://$BACKEND_URL\" ;; esac; export BACKEND_URL; envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf; nginx -t; exec nginx -g 'daemon off;'"]
