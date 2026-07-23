# H_Tracker — Horas+ (Impact Point Hours Tracker)

Sistema de seguimiento de horas y facturación para empresas de servicios profesionales.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI 0.122, Python 3.12, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Base de datos | PostgreSQL 16 (Docker) |
| Frontend | React 18, TypeScript, Vite 5, React Router v6 |
| UI | Shadcn/ui, Tailwind CSS |
| Estado/Fetching | TanStack React Query v5 |
| Fechas | date-fns |
| Notificaciones | Sonner |
| Auth | Usuario/contraseña → JWT (HS256, python-jose + passlib/bcrypt) |
| Facturación programada | Azure Container Apps Job (cron diario) — `python -m jobs.generate_invoices` |
| Exportación | ReportLab / xhtml2pdf (PDF), OpenPyXL (Excel) |
| Almacenamiento | Azure Blob Storage para adjuntos (fallback a filesystem local) |
| Contenerización | Docker Compose + Nginx (local) · Azure Container Apps + Bicep (prod) |

---

## Estructura de directorios

```
H_Tracker/
├── Backend/
│   ├── main.py                    # Entrada FastAPI, routers (sin scheduler in-process)
│   ├── config/
│   │   └── database.py            # SQLAlchemy engine, SessionLocal, Base
│   ├── models/                    # ~24 modelos SQLAlchemy
│   ├── schemas/                   # ~20 schemas Pydantic (Create/Update/Out)
│   ├── services/                  # ~27 servicios de negocio
│   ├── routers/                   # ~21 routers FastAPI
│   ├── jobs/                      # Entrypoints de una sola ejecución:
│   │   ├── bootstrap_admin.py     #   crea el admin inicial (idempotente, al arranque)
│   │   └── generate_invoices.py   #   generación programada de facturas (Container Apps Job)
│   ├── utils/
│   │   ├── auth_jwt.py            # hash/verify password, create/verify JWT
│   │   └── blob_storage.py       # Azure Blob (upload/SAS/delete) con fallback local
│   ├── alembic/versions/          # 25 migraciones (001–025)
│   ├── reset_all_passwords.py     # Utilidad admin (manual)
│   └── requirements.txt
├── Frontend/
│   ├── public/config.js          # Config runtime (window.__ENV__.API_URL) — reescrito al arranque
│   ├── src/
│   │   ├── App.tsx                # Rutas React Router (lazy loading)
│   │   ├── pages/                 # ~14 páginas
│   │   ├── hooks/                 # ~15 archivos de hooks (React Query)
│   │   ├── components/ui/         # Shadcn/ui components
│   │   ├── contexts/AuthContext.tsx  # login(email,password) → JWT en localStorage
│   │   ├── lib/api.ts             # Cliente HTTP (fetch + Bearer token)
│   │   └── types/index.ts         # Tipos TypeScript globales
├── infra/                         # IaC de Azure
│   ├── main.bicep                #   ACR, PostgreSQL, Storage, Container Apps Env, apps + Job
│   ├── main.bicepparam
│   └── setup.sh                  #   bootstrap único (RG, ACR, OIDC, roles)
├── .github/workflows/deploy.yml   # CI/CD: build+push a ACR → deploy Bicep → update imágenes
├── backend.Dockerfile
├── frontend.Dockerfile / frontend-entrypoint.sh
├── docker-compose.yml
├── nginx.conf
└── CLAUDE.md                      # Este archivo
```

---

## Docker

### docker-compose.yml
```
postgres  → puerto 5433:5432 (pgdata volume)
backend   → puerto 8001:8000 (uploads volume)
frontend  → puerto 3000:80
```

### Variables de entorno clave (backend)
```
DATABASE_URL                     postgresql://hours_user:hours_pass@postgres:5432/hours_tracker
JWT_SECRET_KEY                   clave de firma de tokens (obligatoria en prod)
ADMIN_EMAIL / ADMIN_PASSWORD     admin inicial creado idempotentemente al arranque
ADMIN_NAME                       (opcional) nombre del admin
ALLOWED_EMAIL_DOMAINS            dominios permitidos para /auth/register (default: impactpoint.com)
CORS_ORIGINS                     http://localhost:8080,http://localhost:3000
UPLOAD_DIR                       /app/uploads (fallback si no hay Blob)
AZURE_STORAGE_CONNECTION_STRING  si está seteada, los adjuntos van a Blob Storage
AZURE_STORAGE_CONTAINER          invoice-attachments
COP_TO_USD_RATE / EUR_TO_USD_RATE   4200 / 1.08
EXPENSIFY_* / FRESHSALES_*        integraciones opcionales
```
> No existe `AUTH_MODE`. La auth es siempre usuario/contraseña → JWT.

### Startup del backend
El `backend.Dockerfile` ejecuta al inicio (sin seed):
```bash
python -m jobs.init_db && python -m jobs.bootstrap_admin && uvicorn main:app --host 0.0.0.0 --port 8000
```
- **`jobs/init_db.py`**: DB nueva → `create_all` + `alembic stamp head`; DB existente → `alembic upgrade head`.
  ⚠️ La cadena de migraciones NO construye desde cero (la 002 hace `DROP TABLE` de las
  tablas core esperando `create_all`), por eso `alembic upgrade head` directo falla en
  una DB vacía. `init_db` resuelve esto. El índice único de `invoices` está declarado
  también en el modelo (`__table_args__`) para que `create_all` lo cree en deploys nuevos.

### Nginx (frontend)
- `/config.js` → config runtime (`window.__ENV__.API_URL`), sin caché
- `/api/*` → backend (solo local/same-origin; upstream por variable+resolver para no
  romper el arranque cuando el host `backend` no existe, p.ej. en Azure)
- Todo lo demás → `index.html` (SPA fallback)
- **En Azure el SPA llama al backend por URL absoluta** (`config.js`), no por `/api`.

---

## Modelos de base de datos (~24)

Los principales (hay más: skills, costos internos, secuencias de numeración, on-hold, etc.):

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| Employee | employees | Perfil de empleado + credenciales (email, password_hash, must_change_password, title, department, business_unit) |
| Client | clients | Cliente con campos de facturación extendidos |
| Project | projects | Proyecto con client_id, manager_id, status, is_internal, project_code |
| ProjectCategory | project_categories | Categorías (area_category / business_unit) |
| ProjectRole | project_roles | Rol en proyecto con hourly_rate_usd |
| UserRole | user_roles | Roles de app (employee / admin) |
| EmployeeProject | employee_projects | Asignación empleado↔proyecto con role_id |
| TimeEntry | time_entries | Entrada de horas (date, hours, billable, status=normal) |
| Invoice | invoices | Factura (status, period_start/end, owner_company, auto_generated). Índice único parcial `(project_id, period_start, period_end) WHERE auto_generated` → no duplica facturas auto |
| InvoiceLine | invoice_lines | Línea de factura (employee, hours, rate_snapshot, discount) |
| InvoiceManualLine | invoice_manual_lines | Línea manual (person_name, hours, rate_usd) |
| InvoiceFee | invoice_fees | Honorario (label, quantity, unit_price_usd) |
| InvoiceFeeAttachment | invoice_fee_attachments | Archivos adjuntos a honorarios |
| InvoiceTimeEntry | invoice_time_entries | Vínculo factura↔time_entry (evita doble facturación) |
| InvoiceExpense | invoice_expenses | Gasto (category, amount_usd, professional, vendor) |
| SchedulerLog | scheduler_log | Log de ejecuciones del job de facturas (`jobs/generate_invoices`) |

### Relaciones clave
```
Employee ──< EmployeeProject >── Project
Employee ──< TimeEntry >── Project
Project ──< Invoice ──< InvoiceLine
                    ──< InvoiceManualLine
                    ──< InvoiceFee ──< InvoiceFeeAttachment
                    ──< InvoiceTimeEntry >── TimeEntry
                    ──< InvoiceExpense
```

### Nota FK importante
`time_entries.user_id` es FK a `employees.id` (UUID interno), **NO** a `employees.user_id`.
Siempre usar `employee.id` al crear TimeEntry desde el frontend.
(`employees.user_id` es un identificador interno propio, ya no un OID de Azure AD.)

---

## API Backend — Endpoints

### Auth (público excepto donde se indica)
```
POST /auth/login                          → {access_token, token_type} body:{email, password}
POST /auth/register                       → EmployeeOut (restringido a ALLOWED_EMAIL_DOMAINS)
GET  /auth/me                             → EmployeeOut (requiere token)
POST /auth/change-password                → 204 (requiere token)
POST /auth/admin-reset-password/{id}      → 204 (solo admin)
```
> Todos los routers salvo `/auth` requieren `Authorization: Bearer <jwt>`
> (dependencia global `get_current_employee` en `main.py`).

Routers adicionales no listados abajo: `freshsales`, `skill-catalog`,
`notifications`, `invoice-hours-on-hold`, `profile`.

### Employees
```
GET  /employees/me                → EmployeeOut (auto-crea desde token)
POST /employees/                  → EmployeeOut
GET  /employees/                  → List[EmployeeOut] ?active ?user_role ?search
GET  /employees/{id}              → EmployeeOut
PUT  /employees/{id}              → EmployeeOut
DEL  /employees/{id}              → 204
```

### Clients
```
POST /clients/                    → ClientOut
GET  /clients/                    → List[ClientOut] ?active
GET  /clients/{id}                → ClientOut
PUT  /clients/{id}                → ClientOut
DEL  /clients/{id}                → 204
```

### Projects
```
GET  /projects/categories         → List[ProjectCategoryOut] ?type
POST /projects/                   → ProjectOut
GET  /projects/                   → List[ProjectOut] ?active ?client_id ?status
GET  /projects/{id}/assignments   → List[ProjectAssignmentOut]
GET  /projects/{id}               → ProjectOut
PUT  /projects/{id}               → ProjectOut
PATCH /projects/{id}              → ProjectOut
DEL  /projects/{id}               → 204
```

### Project Roles
```
POST /project-roles/              → ProjectRoleOut
GET  /project-roles/              → List[ProjectRoleOut] ?project_id
PUT  /project-roles/{id}          → ProjectRoleOut
DEL  /project-roles/{id}          → 204
```

### Employee Projects (asignaciones)
```
POST /employee-projects/          → EmployeeProjectOut
GET  /employee-projects/          → List[EmployeeProjectOut] ?user_id ?project_id
GET  /employee-projects/{uid}/details → List[EmployeeProjectWithDetails]
PUT  /employee-projects/{uid}/bulk    → List[EmployeeProjectOut] (reemplaza todas)
PUT  /employee-projects/{id}          → EmployeeProjectOut (actualizar role_id)
DEL  /employee-projects/{id}          → 204
```

### Time Entries
```
POST /time-entries/               → TimeEntryOut
GET  /time-entries/               → List[TimeEntryOut] ?user_id ?project_id ?date_gte ?date_lte ?billable ?status
GET  /time-entries/{id}           → TimeEntryOut
PUT  /time-entries/{id}           → TimeEntryOut
DEL  /time-entries/{id}           → 204
```

### Invoices
```
POST /invoices/                   → InvoiceOut
GET  /invoices/                   → List[InvoiceOut] ?project_id ?status
GET  /invoices/check-hours        → {has_entries, total_hours, total_amount, entry_count} ?project_id ?period_start ?period_end
POST /invoices/generate-monthly   → {generated, skipped, errors} body:{period_start, period_end}
GET  /invoices/scheduler-status   → {last_run, last_period, invoices_generated, next_run, status}
GET  /invoices/{id}/edit-data     → InvoiceEditDataOut (invoice + lines + expenses)
PATCH /invoices/{id}              → InvoiceOut body:InvoicePatch
GET  /invoices/{id}/export/pdf    → PDF binary
GET  /invoices/{id}/export/xlsx   → XLSX binary
GET  /invoices/{id}               → InvoiceOut
PUT  /invoices/{id}               → InvoiceOut
DEL  /invoices/{id}               → 204
```

### Invoice Lines
```
POST /invoice-lines/              → InvoiceLineOut
POST /invoice-lines/bulk          → List[InvoiceLineOut]
GET  /invoice-lines/              → List[InvoiceLineOut] ?invoice_id
PUT  /invoice-lines/{id}          → InvoiceLineOut
DEL  /invoice-lines/{id}          → 204
```

### Invoice Time Entries (vínculos)
```
GET  /invoice-time-entries/linked-ids → List[str]
POST /invoice-time-entries/bulk       → List[InvoiceTimeEntryOut] body:{invoice_id, time_entry_ids}
DEL  /invoice-time-entries/{id}       → 204
```

### Invoice Expenses
```
POST /invoice-expenses/           → InvoiceExpenseOut
GET  /invoice-expenses/           → List[InvoiceExpenseOut] ?invoice_id
PUT  /invoice-expenses/{id}       → InvoiceExpenseOut
DEL  /invoice-expenses/{id}       → 204
```

### Invoice Fees
```
POST /invoice-fees/               → InvoiceFeeOut
GET  /invoice-fees/               → List[InvoiceFeeOut] ?invoice_id
PUT  /invoice-fees/{id}           → InvoiceFeeOut
DEL  /invoice-fees/{id}           → 204
```

### Invoice Fee Attachments
```
POST /invoice-fee-attachments/upload → InvoiceFeeAttachmentOut (multipart: fee_id + file)
GET  /invoice-fee-attachments/       → List[InvoiceFeeAttachmentOut] ?fee_id
DEL  /invoice-fee-attachments/{id}   → 204
```

### Expensify
```
GET  /expensify/status            → {configured, last_sync, last_sync_count, last_sync_invoice_id}
GET  /expensify/reports           → {count, reports[]} preview ?project_code ?employee_email ?date_from ?date_to
POST /expensify/sync              → {imported, skipped, reports_processed} body o query params
```

### User Roles
```
GET  /user-roles/                 → List[UserRoleOut]
PUT  /user-roles/{user_id}        → UserRoleOut body:{role}
DEL  /user-roles/{user_id}        → 204
```

### Health
```
GET  /health                      → {status: "ok"}
```

---

## Frontend — Rutas

```
/                      Dashboard
/timesheet             Registro semanal de horas
/history               Historial de entradas
/projects              Lista de proyectos
/projects/new          Nuevo proyecto
/projects/:id          Detalle de proyecto
/projects/:id/edit     Editar proyecto
/clients               Lista de clientes
/employees             Lista de empleados
/invoices              Lista de facturas
/invoices/new          Nueva factura (desde time entries)
/invoices/new/manual   Factura manual (sin time entries)
/invoices/:id/edit     Editor completo de factura
/reports               Reportes y análisis
/auth                  Login (redirige a /)
```

---

## Frontend — Hooks React Query

| Hook | Archivo | Qué hace |
|------|---------|----------|
| useProjects / useActiveProjects | useProjects.ts | Lista proyectos |
| useClients | useClients.ts | Lista clientes |
| useEmployees | useEmployees.ts | Lista empleados |
| useTimeEntriesByWeek | useTimeEntries.ts | Entradas de una semana |
| useTimeEntriesByDateRange | useTimeEntries.ts | Entradas por rango |
| useCreateTimeEntry | useTimeEntries.ts | POST /time-entries |
| useUpdateTimeEntry | useTimeEntries.ts | PUT /time-entries/{id} |
| useDeleteTimeEntry | useTimeEntries.ts | DELETE /time-entries/{id} |
| useAssignedProjects | useAssignedProjects.ts | GET /employee-projects |
| useAssignedProjectsWithDetails | useAssignedProjects.ts | GET /employee-projects/{id}/details |
| useBulkAssignProjects | useAssignedProjects.ts | PUT /employee-projects/{id}/bulk |
| useInvoices | useInvoices.ts | GET /invoices |
| useCreateInvoice | useInvoices.ts | POST /invoices |
| useUpdateInvoice | useInvoices.ts | PUT /invoices/{id} |
| usePatchInvoice | useInvoices.ts | PATCH /invoices/{id} |
| useCreateInvoiceLines | useInvoices.ts | POST /invoice-lines/bulk |
| useLinkTimeEntries | useInvoices.ts | POST /invoice-time-entries/bulk |
| useGenerateMonthlyInvoices | useInvoices.ts | POST /invoices/generate-monthly |

---

## Servicios backend clave

### invoice_generator.py
- `generate_invoice_for_project_period(db, project, ps, pe)` — genera **una** factura draft
  para un proyecto + período. **Idempotente**: chequea existencia previa y captura
  `IntegrityError` del índice único (carrera). Setea `period_start/end` y `auto_generated=True`.
- `generate_invoices_for_period(db, ps, pe)` — wrapper que itera todos los proyectos
  activos no internos (usado por el endpoint manual `/generate-monthly`).
- Solo toma time entries billables **no vinculadas** (evita re-facturar horas).
- Numeración vía `invoice_number_service.atomic_generate_number` (secuencia atómica
  por empresa, `INSERT … ON CONFLICT … RETURNING`).

### jobs/generate_invoices.py  (reemplaza al viejo APScheduler)
Entrypoint de una sola ejecución (`python -m jobs.generate_invoices`), corre como
**Azure Container Apps Job** (cron diario, `parallelism: 1`):
- Por cada proyecto activo no interno, si hoy es su día de facturación
  (`services/billing_periods.py`), genera la factura del período vigente.
- Registra en `scheduler_log` y sale con código 0/1.
- Doble garantía anti-duplicados: el Job corre una sola vez + el índice único parcial.

### services/billing_periods.py
Cálculo de períodos por proyecto (`next_invoice_date`, `period_bounds_for_project`)
según `billing_period` (monthly/bimonthly/quarterly/weekly/biweekly/custom).

### expensify_service.py
- Llama a Expensify Partner API
- Convierte COP→USD usando `COP_TO_USD_RATE`
- Detecta duplicados por `expensify_report_id` (si existe en expenses)
- Categoriza automáticamente según campo `category` de Expensify

### export_pdf.py / export_excel.py
- Generan reportes con branding de Impact Point
- PDF: líneas, honorarios, gastos, totales, descuentos
- XLSX: hoja por sección (resumen, líneas, gastos)

---

## Migraciones Alembic

25 migraciones (001–025). Hitos:

| Revisión | Descripción |
|----------|-------------|
| 001 | Schema inicial (todas las tablas core) |
| 003 | Soporte edición facturas (discount_type, discount_value, manual_lines) |
| 005 | Manager en proyectos + categorías |
| 006 | Tabla scheduler_log |
| 010 | Notifications |
| 017–022 | Numeración de facturas por empresa (secuencias, normalización) |
| 023–024 | Auth por contraseña (`password_hash`, `must_change_password`) |
| 025 | `invoices.auto_generated` + índice único parcial anti-duplicados |

Para correr migraciones:
```bash
alembic upgrade head       # Aplicar todas
alembic downgrade -1       # Revertir última
```

---

## Flujo de creación de factura

### Automático (Azure Container Apps Job — cron diario)
```
Container Apps Job (parallelism 1) → python -m jobs.generate_invoices
  → Por cada proyecto activo no interno:
    → ¿Hoy == día de facturación del proyecto? (billing_periods) — si no, skip
    → generate_invoice_for_project_period(project, período):
        → Si ya existe factura auto para (proyecto, período) → skip
        → time entries billables NO vinculadas → agrupar por empleado → horas × rate
        → Crear Invoice (draft, auto_generated) + InvoiceLines + InvoiceTimeEntry links
        → El índice único parcial impide duplicados aunque haya carrera
    → Registrar corrida en SchedulerLog
```

### Manual desde frontend
```
InvoiceNewPage:
  1. Usuario selecciona proyecto
  2. GET /invoices/check-hours?project_id=...
     → Si has_entries=false: Dialog → "¿Crear manual?" → InvoiceManualPage
     → Si has_entries=true:
        POST /invoices/ (crea invoice vacía)
        GET /invoice-time-entries/linked-ids
        GET /time-entries?project_id=...&billable=true&status=normal
        Filtra no vinculadas → agrupa por empleado → calcula amounts
        POST /invoice-lines/bulk
        POST /invoice-time-entries/bulk
        PUT /invoices/{id} (actualiza subtotal/total)
        → Navegar a /invoices/{id}/edit
```

---

## Autenticación (usuario/contraseña → JWT)

No hay Azure AD ni modo mock. Flujo:
1. `POST /auth/login` con `{email, password}` → JWT (HS256, exp 7 días, `sub` = `employee.id`).
2. El frontend guarda el token en `localStorage` (`auth_token`) y lo envía como `Bearer`.
3. `get_current_employee` (en `utils/auth_jwt.py`) valida el token en cada request y
   carga el `Employee` activo. Es dependencia global de todos los routers salvo `/auth`.

- Contraseñas hasheadas con bcrypt (passlib). `must_change_password` fuerza cambio en el primer login.
- Admin inicial: creado idempotentemente al arranque por `jobs/bootstrap_admin.py`
  desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Autoregistro (`/auth/register`) restringido a `ALLOWED_EMAIL_DOMAINS`.

En `AuthContext.tsx`:
- `login(email, password)` → guarda token → `GET /auth/me` retorna el Employee.
- `employee.id` = UUID interno; `employee.user_id` = identificador interno propio.

**IMPORTANTE:** Al crear `TimeEntry`, usar siempre `employee.id` como `user_id`,
nunca `employee.user_id`. El campo `time_entries.user_id` es FK a `employees.id`.

---

## Comandos útiles

```bash
# Levantar todo
docker-compose up -d

# Rebuild completo desde cero
docker-compose down && docker-compose build --no-cache && docker-compose up -d

# Rebuild solo frontend
docker-compose build frontend --no-cache && docker-compose up -d frontend

# Ver logs backend
docker-compose logs backend --tail=50 -f

# Acceder a la DB
docker exec -it h_tracker-postgres-1 psql -U hours_user -d hours_tracker

# Correr migraciones manualmente
docker exec h_tracker-backend-1 alembic upgrade head

# Ejecutar el job de facturas manualmente (mismo entrypoint que el Container Apps Job)
docker exec h_tracker-backend-1 python -m jobs.generate_invoices

# Crear/asegurar admin manualmente
docker exec -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... h_tracker-backend-1 python -m jobs.bootstrap_admin
```

---

## URLs en desarrollo

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| Swagger UI | http://localhost:8001/docs |
| PostgreSQL | localhost:5433 |

---

## Despliegue en Azure

IaC en `infra/` (Bicep) + CI/CD en `.github/workflows/deploy.yml`.

**Recursos (`infra/main.bicep`):** ACR, PostgreSQL Flexible Server, Storage Account +
contenedor Blob, Container Apps Environment, backend app, frontend app y el
**Container Apps Job** de facturas.

**Bootstrap único (una vez):** `infra/setup.sh` crea RG, ACR, App Registration con
federated credential (OIDC, sin secretos) y roles.

**Secrets de GitHub requeridos:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `DB_PASSWORD`, `JWT_SECRET_KEY`, `ADMIN_PASSWORD`.

**Pipeline (push a `master`):** build+push de imágenes a ACR → `az deployment group create`
(Bicep) → update de imágenes al tag SHA (backend, frontend, job) → patch de `CORS_ORIGINS`.

**URL del backend en el frontend:** inyectada en runtime vía `/config.js` desde la env
`BACKEND_URL` (no se hornea en build) → un solo deploy queda correcto desde el primer run.
