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

// dbAdminPassword — DO NOT set here. Pass at deploy time.
// Example: --parameters dbAdminPassword=$env:DB_PASSWORD

// ---------------------------------------------------------------------------
// Application secrets
// ---------------------------------------------------------------------------

// jwtSecretKey — DO NOT set here. Pass at deploy time.
// The key must be at least 32 characters long. Generate with:
//   openssl rand -base64 48

// Auth is handled entirely by the FastAPI backend (username/password → JWT),
// so no Entra ID / App Registration parameters are required here.

// ---------------------------------------------------------------------------
// Exchange rates (adjust as needed without redeploying code)
// ---------------------------------------------------------------------------

param copToUsdRate = '4200'
param eurToUsdRate = '1.08'
