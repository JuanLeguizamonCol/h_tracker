// =============================================================================
// <PROJECT_NAME> — Bicep Parameters File (reusable template)
// =============================================================================
// Usage (CI passes secure params via env vars — see deploy.yml):
//   az deployment group create \
//     --resource-group myapp-rg \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam
//
// Secure params (dbAdminPassword, jwtSecretKey, adminPassword) are read from
// env vars via readEnvironmentVariable() so they are never stored in source
// control. NOTE: a .bicepparam file must assign EVERY required parameter, so
// these cannot be left to inline `--parameters` on the CLI — doing so fails
// compilation with BCP258.
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
param dbAdminLogin = 'myapp_admin'

// Name of the logical database created inside the server.
param dbName = 'myapp_db'

// Secure params are sourced from environment variables at deploy time (CI sets
// them from GitHub secrets). They stay out of source control this way.
param dbAdminPassword = readEnvironmentVariable('DB_PASSWORD')

// ---------------------------------------------------------------------------
// Application secrets
// ---------------------------------------------------------------------------

// JWT signing key (min 32 chars). Generate with: openssl rand -base64 48
param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY')

// Initial admin account. Email is safe to keep here; the password comes from the
// ADMIN_PASSWORD env var (CI secret). Create the admin idempotently at backend
// startup with must_change_password=true.
param adminPassword = readEnvironmentVariable('ADMIN_PASSWORD')
param adminEmail = 'admin@example.com'

// Domains allowed to self-register (comma-separated). Empty string disables it.
param allowedEmailDomains = 'example.com'

// ---------------------------------------------------------------------------
// Your app-specific params
// Add assignments for any extra params you declared in main.bicep here.
// For secrets: param myKey = readEnvironmentVariable('MY_KEY', '')
// ---------------------------------------------------------------------------
