// =============================================================================
// H_Tracker — Bicep Parameters File
// =============================================================================
// Usage:
//   az deployment group create \
//     --resource-group impactpoint-hours-rg \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam \
//              dbAdminPassword='<from-keyvault-or-prompt>' \
//              jwtSecretKey='<from-keyvault-or-prompt>'
//
// Secure params (dbAdminPassword, jwtSecretKey) are intentionally omitted here
// so they are never stored in source control. Pass them at deploy time via:
//   --parameters dbAdminPassword=$DB_PASSWORD jwtSecretKey=$JWT_SECRET_KEY
// or via a Key Vault reference block if you add one later.
// =============================================================================

using './main.bicep'

// ---------------------------------------------------------------------------
// Region & environment
// ---------------------------------------------------------------------------

// Azure region for all resources.
param location = 'eastus2'

// Logical environment label applied as a tag. Options: prod | staging | dev
param environment = 'prod'

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

// Administrator username for the PostgreSQL Flexible Server.
// Must not be 'azure_superuser', 'azure_pg_admin', 'admin', 'administrator',
// 'root', 'guest', or 'public' — Azure rejects those.
param dbAdminLogin = 'hours_admin'

// Name of the logical database created inside the server.
param dbName = 'hours_tracker'

// Secure params are sourced from environment variables at deploy time (CI sets
// them from GitHub secrets). They stay out of source control this way. NOTE: a
// .bicepparam file must assign EVERY required parameter, so these cannot be left
// to inline `--parameters` on the CLI — doing so fails compilation with BCP258.
param dbAdminPassword = readEnvironmentVariable('DB_PASSWORD')

// ---------------------------------------------------------------------------
// Application secrets
// ---------------------------------------------------------------------------

// JWT signing key (min 32 chars). Generate with: openssl rand -base64 48
param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY')

// Initial admin account. Email is safe to keep here; the password comes from the
// ADMIN_PASSWORD env var (CI secret). The admin is created idempotently at backend
// startup with must_change_password=true.
param adminPassword = readEnvironmentVariable('ADMIN_PASSWORD')
param adminEmail = 'jleguizamon@impactpoint.com'

// Auth is handled entirely by the FastAPI backend (username/password → JWT),
// so no Entra ID / App Registration parameters are required here.

// ---------------------------------------------------------------------------
// Exchange rates (adjust as needed without redeploying code)
// ---------------------------------------------------------------------------

param copToUsdRate = '4200'
param eurToUsdRate = '1.08'
