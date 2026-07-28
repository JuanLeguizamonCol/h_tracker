# Azure Infra Template

Plantilla reutilizable de infraestructura Azure, extraída de H_Tracker y
genericizada. Arquitectura: **Log Analytics + ACR + PostgreSQL Flexible Server
+ Storage (Blob) + Container Apps Environment + backend app + frontend app +
(opcional) Container Apps Job programado**, con CI/CD por GitHub Actions vía
OIDC (sin secretos de cliente).

## Estructura

```
infra-template/
├── infra/
│   ├── main.bicep            # Todos los recursos Azure
│   ├── main.bicepparam       # Parámetros (secretos vía env vars)
│   └── setup.sh              # Bootstrap único: RG, ACR, App Registration OIDC, roles
├── .github/workflows/
│   └── deploy.yml            # Pipeline: build+push a ACR → deploy Bicep → update imágenes
├── backend.Dockerfile        # Imagen backend (FastAPI/uvicorn, ajusta el CMD)
├── frontend.Dockerfile       # Imagen frontend (build Vite → nginx)
├── frontend-entrypoint.sh    # Inyecta BACKEND_URL en /config.js al arranque
├── docker-compose.yml        # Entorno local (postgres + backend + frontend)
└── nginx.conf                # Proxy /api local + SPA fallback + cache headers
```

## Cómo adaptarlo a un nuevo proyecto

### 1. Reemplazos globales (find & replace)

Aplica estos reemplazos en **todos** los archivos de la carpeta:

| Placeholder | Reemplazar por | Dónde aparece | Reglas |
|-------------|----------------|---------------|--------|
| `myapp` | tu prefijo de proyecto | main.bicep, deploy.yml, setup.sh, compose | minúsculas, guiones ok |
| `myappacr` | nombre de tu ACR | main.bicep, deploy.yml, setup.sh | **solo alfanumérico**, 5-50 chars, único global |
| `myapp-rg` | tu resource group | main.bicep (comentario), deploy.yml, setup.sh | |
| `myapp_admin` | usuario admin de Postgres | main.bicep, main.bicepparam | no usar `admin`, `root`, etc. |
| `myapp_db` | nombre de la base de datos | main.bicep, main.bicepparam | |
| `admin@example.com` | email del admin inicial | main.bicep, main.bicepparam | |
| `example.com` | dominios de auto-registro | main.bicep, main.bicepparam | vacío = deshabilitado |
| `<PROJECT_NAME>` | nombre legible del proyecto | encabezados / tag `project` | |
| `your-github-org` | tu usuario/org de GitHub | setup.sh | exacto, sensible a mayúsculas |
| `your-repo` | nombre del repo | setup.sh | exacto |
| `main` | rama de despliegue | setup.sh, deploy.yml | |

> El storage account usa `'myapp${uniqueString(resourceGroup().id)}'` — solo
> cambia el prefijo `myapp` (≤ ~10 chars). Debe quedar en 3-24 chars, minúsculas.

### 2. Ajustes por archivo

- **backend.Dockerfile** — cambia el `CMD` para usar los entrypoints de migración/seed
  de tu app (o quítalos). Ajusta librerías de sistema del `apt-get` si no las necesitas.
- **frontend.Dockerfile / docker-compose.yml** — asumen `Backend/` y `Frontend/`
  como contextos de build. Ajusta rutas a tu layout.
- **main.bicep** — añade tus env vars de app en el bloque marcado
  *"YOUR APP-SPECIFIC ENV VARS GO HERE"*. Para secretos, decláralos como
  `@secure()` param + `secretRef`.
- **Job programado (sección 7 de main.bicep)** — reemplaza el `command`
  (`jobs.your_scheduled_task`) o **borra toda la sección** y el step
  *"Update cron Job image"* de deploy.yml si no necesitas cron.
- **deploy.yml** — ajusta el bloque `env:` y las rutas de contexto de build.

### 3. Requisitos de la app backend

Para que las health probes y el runtime funcionen sin cambios, el backend debería:
- Exponer `GET /health` → 200 en el puerto 8000.
- Leer `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`,
  `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`.
- Servir detrás de HTTPS con `--proxy-headers` (ya en el Dockerfile).

## Despliegue

```bash
# 1. Bootstrap único (crea RG, ACR, App Registration OIDC, roles)
chmod +x infra/setup.sh
./infra/setup.sh
# → copia los secretos que imprime a GitHub (Settings → Secrets → Actions)

# 2. Añade los secretos de GitHub:
#    AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
#    DB_PASSWORD, JWT_SECRET_KEY, ADMIN_PASSWORD

# 3. Push a la rama de despliegue (o workflow_dispatch manual) → CI hace el resto
```

## Notas de diseño heredadas

- **Backend-agnostic frontend**: la URL del backend se inyecta en runtime vía
  `/config.js` (`BACKEND_URL`), no en build → un solo deploy queda correcto desde
  el primer run.
- **CORS/FRONTEND_URL** se parchean tras el deploy con `az containerapp update`
  una vez conocido el FQDN del frontend.
- **PostgreSQL** con red pública pero firewall solo "Azure services"
  (`0.0.0.0→0.0.0.0`, NO es internet abierto). Roadmap de hardening: VNet +
  private endpoint.
- **Job programado** fuera del web app para ejecutarse exactamente una vez sin
  importar cuántas réplicas del backend corran.
