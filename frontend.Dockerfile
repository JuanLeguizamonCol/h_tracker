FROM node:20-alpine AS build

WORKDIR /app

COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm install

COPY Frontend/ .

# The backend URL is NO LONGER baked in at build time. It is injected at
# runtime via /config.js (see frontend-entrypoint.sh), so this image is built
# once and targets any backend. The build is therefore backend-agnostic.
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend-entrypoint.sh /docker-entrypoint.d/99-write-config.sh
RUN chmod +x /docker-entrypoint.d/99-write-config.sh

EXPOSE 80

# nginx:alpine runs every executable script in /docker-entrypoint.d/ before
# starting nginx, so our config writer runs automatically. The base image's
# own CMD (`nginx -g 'daemon off;'`) then starts the server.
