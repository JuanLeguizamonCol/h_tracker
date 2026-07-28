// =============================================================================
// <PROJECT_NAME> — Azure Infrastructure (reusable template)
// Region : eastus2
// Prefix : myapp   <-- find/replace 'myapp' with your project prefix
// =============================================================================
// Architecture: Log Analytics + ACR + PostgreSQL Flexible Server + Storage
//   (Blob) + Container Apps Environment + backend app + frontend app +
//   optional scheduled Container Apps Job.
//
// Deploy:
//   az deployment group create \
//     --resource-group myapp-rg \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam
//
// PLACEHOLDERS TO REPLACE (see README.md for the full table):
//   myapp            → your project prefix (lowercase, hyphen-safe)
//   myappacr         → your ACR name (alphanumeric only, globally unique)
//   admin@example.com→ initial admin email
//   example.com      → allowed self-registration domain(s)
// =============================================================================

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Azure region for all resources.')
param location string = 'eastus2'

@description('Environment tag (prod | staging | dev).')
param environment string = 'prod'

@description('PostgreSQL administrator login name.')
param dbAdminLogin string = 'myapp_admin'

@description('PostgreSQL administrator password. Must meet Azure complexity requirements.')
@secure()
param dbAdminPassword string

@description('Name of the logical PostgreSQL database.')
param dbName string = 'myapp_db'

@description('JWT secret key used by the backend.')
@secure()
param jwtSecretKey string

@description('Email of the initial admin account created idempotently at startup.')
param adminEmail string = 'admin@example.com'

@description('Comma-separated email domains allowed to self-register. Empty string disables self-registration.')
param allowedEmailDomains string = 'example.com'

@description('Initial password for the admin account (min 8 chars). Passed at deploy time; never stored in source.')
@secure()
param adminPassword string

// ---------------------------------------------------------------------------
// App-specific extra parameters
// Add your own here (exchange rates, third-party keys, feature flags, ...).
// Keep secrets @secure() and source them from env vars in main.bicepparam.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Variables — naming
// ---------------------------------------------------------------------------

var prefix = 'myapp'
var acrName = 'myappacr'                    // ACR: alphanumeric only, 5-50 chars, globally unique
var logAnalyticsName = '${prefix}-logs'
var pgServerName = '${prefix}-db'
var containerAppsEnvName = '${prefix}-env'
var backendAppName = '${prefix}-backend'
var frontendAppName = '${prefix}-frontend'
var cronJobName = '${prefix}-cron-job'
// Storage account: 3-24 chars, lowercase alphanumeric, globally unique.
var storageAccountName = 'myapp${uniqueString(resourceGroup().id)}'
var uploadsContainerName = 'attachments'

var tags = {
  project: '<PROJECT_NAME>'
  environment: environment
  managedBy: 'bicep'
}

// ---------------------------------------------------------------------------
// 1. Log Analytics Workspace
// ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// 2. Azure Container Registry
// ---------------------------------------------------------------------------

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true          // Required for Container Apps pull via password
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

// ---------------------------------------------------------------------------
// 3. PostgreSQL Flexible Server
// ---------------------------------------------------------------------------

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgServerName
  location: location
  tags: tags
  sku: {
    // Burstable 2 vCore / 4 GiB. Compute can be scaled up/down freely later
    // (a brief restart, no data migration); only storageSizeGB is one-way (grow
    // only), so it is left as-is here.
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      // Public networking is ENABLED but the only firewall rule (below) is the
      // "Allow Azure services" range (0.0.0.0/0.0.0.0) — this does NOT open the
      // DB to the internet; only Azure-internal callers (e.g. our Container Apps)
      // can reach it, and they still need the admin credentials.
      //
      // HARDENING ROADMAP: for full isolation, move to VNet integration
      // (Container Apps Environment + PostgreSQL delegated subnet + Private DNS)
      // and set publicNetworkAccess: 'Disabled'. Deferred — it requires a VNet
      // and re-testing connectivity, so it is intentionally not enabled here.
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

// Allow connections from Azure services ONLY (0.0.0.0 → 0.0.0.0 is the Azure
// magic range — it is NOT 0.0.0.0/0; the public internet cannot connect).
resource pgFirewallAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pgServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pgServer
  name: dbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ---------------------------------------------------------------------------
// 3b. Storage Account + Blob container (file attachments)
// ---------------------------------------------------------------------------
// Uploaded files are stored in Blob Storage because the Container Apps
// filesystem is ephemeral (lost on restart/scale). The backend reads
// AZURE_STORAGE_CONNECTION_STRING and uploads/serves via short-lived SAS URLs.

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false          // Private — access only via SAS URLs
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource uploadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: uploadsContainerName
  properties: {
    publicAccess: 'None'
  }
}

// Connection string assembled from the account key (retrieved at deploy time).
var storageKey = storageAccount.listKeys().keys[0].value
// Use az.environment() (fully qualified): the `environment` param above shadows
// the bare environment() built-in, which newer Bicep rejects (BCP265).
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey};EndpointSuffix=${az.environment().suffixes.storage}'

// ---------------------------------------------------------------------------
// 4. Container Apps Environment
// ---------------------------------------------------------------------------

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

// ---------------------------------------------------------------------------
// Derived values used by container apps
// ---------------------------------------------------------------------------

var pgFqdn = pgServer.properties.fullyQualifiedDomainName
var databaseUrl = 'postgresql://${dbAdminLogin}:${dbAdminPassword}@${pgFqdn}:5432/${dbName}?sslmode=require'

// ACR credentials retrieved at deploy time — stored as Container App secrets
var acrLoginServer = acr.properties.loginServer
var acrAdminUsername = acr.listCredentials().username
var acrAdminPassword0 = acr.listCredentials().passwords[0].value

// ---------------------------------------------------------------------------
// 5. Backend Container App
// ---------------------------------------------------------------------------

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      // Secrets: DB URL, JWT key, admin password, storage, and ACR credentials
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'jwt-secret-key'
          value: jwtSecretKey
        }
        {
          name: 'admin-password'
          value: adminPassword
        }
        {
          name: 'storage-connection-string'
          value: storageConnectionString
        }
        {
          name: 'acr-password'
          value: acrAdminPassword0
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrAdminUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
        // CORS is handled by the backend app (CORS_ORIGINS env var, set to the
        // frontend FQDN by the deploy pipeline). Defining it here too would emit
        // duplicate Access-Control-Allow-Origin headers.
      }
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acrLoginServer}/backend:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            // CORS_ORIGINS is patched after frontend is deployed — placeholder here.
            // The deploy pipeline updates this via `az containerapp update`.
            {
              name: 'CORS_ORIGINS'
              value: 'https://placeholder.azurecontainerapps.io'
            }
            {
              name: 'JWT_SECRET_KEY'
              secretRef: 'jwt-secret-key'
            }
            {
              name: 'ADMIN_EMAIL'
              value: adminEmail
            }
            {
              name: 'ADMIN_PASSWORD'
              secretRef: 'admin-password'
            }
            {
              name: 'ALLOWED_EMAIL_DOMAINS'
              value: allowedEmailDomains
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              secretRef: 'storage-connection-string'
            }
            {
              name: 'AZURE_STORAGE_CONTAINER'
              value: uploadsContainerName
            }
            {
              name: 'UPLOAD_DIR'
              value: '/app/uploads'
            }
            // FRONTEND_URL is patched after the frontend is deployed (same step as
            // CORS_ORIGINS) — useful for building absolute links in emails, etc.
            {
              name: 'FRONTEND_URL'
              value: 'https://placeholder.azurecontainerapps.io'
            }
            // -----------------------------------------------------------------
            // YOUR APP-SPECIFIC ENV VARS GO HERE
            // e.g. third-party API keys (use secretRef for secrets), feature
            // flags, exchange rates, external service URLs, etc.
            // -----------------------------------------------------------------
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Frontend Container App
// ---------------------------------------------------------------------------

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: frontendAppName
  location: location
  tags: tags
  // The frontend image is backend-agnostic. The backend URL is provided at
  // runtime via the BACKEND_URL env var below, which the container entrypoint
  // writes into /config.js before nginx starts — no build-time bake, so a
  // single deploy is always correct even on the first run.
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      secrets: [
        {
          name: 'acr-password'
          value: acrAdminPassword0
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrAdminUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${acrLoginServer}/frontend:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            // Read at startup by the entrypoint hook, which writes it into
            // /config.js (window.__ENV__.API_URL) so the SPA calls this backend.
            {
              name: 'BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 5
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/config.js'
                port: 80
              }
              initialDelaySeconds: 3
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '30'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. (OPTIONAL) Scheduled task — Container Apps Job
// ---------------------------------------------------------------------------
// Runs a one-shot command once per schedule on a single replica. Kept OUT of
// the backend web app so it executes exactly once regardless of how many
// backend replicas are running. Delete this whole block if you don't need a
// scheduled job.
//
// cronExpression is UTC. '0 13 * * *' = 13:00 UTC = 08:00 America/Bogota (UTC-5).
// Replace the `command` with your own job entrypoint.

resource cronJob 'Microsoft.App/jobs@2024-03-01' = {
  name: cronJobName
  location: location
  tags: tags
  properties: {
    environmentId: containerAppsEnv.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 1800          // 30 min hard cap per run
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: '0 13 * * *'
        parallelism: 1              // never run two replicas at once
        replicaCompletionCount: 1
      }
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'acr-password'
          value: acrAdminPassword0
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrAdminUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'cron-job'
          image: '${acrLoginServer}/backend:latest'
          command: [
            'python'
            '-m'
            'jobs.your_scheduled_task'    // <-- replace with your job entrypoint
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
          ]
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Public URL of the frontend Container App.')
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'

@description('Public URL of the backend Container App.')
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'

@description('Backend FQDN (without scheme).')
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn

@description('Frontend FQDN (without scheme).')
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn

@description('Azure Container Registry login server.')
output acrLoginServer string = acr.properties.loginServer

@description('PostgreSQL Flexible Server FQDN.')
output pgServerFqdn string = pgServer.properties.fullyQualifiedDomainName

@description('Storage account name holding attachments.')
output storageAccountName string = storageAccount.name

@description('Blob container name for attachments.')
output uploadsContainerName string = uploadsContainerName

@description('Log Analytics Workspace resource ID.')
output logAnalyticsWorkspaceId string = logAnalytics.id

@description('Name of the scheduled Container Apps Job.')
output cronJobName string = cronJob.name
