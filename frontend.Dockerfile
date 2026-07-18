FROM node:20-alpine AS build

WORKDIR /app

COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm install

COPY Frontend/ .

# Vite MUST see these as env vars at build time — not just .env files.
# Values are passed from docker-compose build.args (sourced from azure.env).
# VITE_API_URL — absolute URL of the backend Container App. When set, the SPA
# calls the backend directly (CORS); when empty (local dev) it uses /api proxy.
ARG VITE_API_URL
ARG VITE_AUTH_MODE=azure
ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_TENANT_ID
ARG VITE_AZURE_API_SCOPE
ARG VITE_AZURE_REDIRECT_URI

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID
ENV VITE_AZURE_API_SCOPE=$VITE_AZURE_API_SCOPE
ENV VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
