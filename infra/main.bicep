// =============================================================================
// H_Tracker — Azure Infrastructure
// Region : eastus2
// Prefix : impactpoint-hours
// =============================================================================
// Deploy:
//   az deployment group create \
//     --resource-group impactpoint-hours-rg \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam
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
param dbAdminLogin string = 'hours_admin'

@description('PostgreSQL administrator password. Must meet Azure complexity requirements.')
@secure()
param dbAdminPassword string

@description('Name of the logical PostgreSQL database.')
param dbName string = 'hours_tracker'

@description('JWT secret key used by the FastAPI backend.')
@secure()
param jwtSecretKey string

@description('COP to USD exchange rate.')
param copToUsdRate string = '4200'

@description('EUR to USD exchange rate.')
param eurToUsdRate string = '1.08'

// ---------------------------------------------------------------------------
// Variables — naming
// ---------------------------------------------------------------------------

var prefix = 'impactpoint-hours'
var acrName = 'impactpointhoursacr'         // ACR: alphanumeric only, 5-50 chars
var logAnalyticsName = '${prefix}-logs'
var pgServerName = '${prefix}-db'
var containerAppsEnvName = '${prefix}-env'
var backendAppName = '${prefix}-backend'
var frontendAppName = '${prefix}-frontend'
// Storage account: 3-24 chars, lowercase alphanumeric, globally unique.
var storageAccountName = 'ipthours${uniqueString(resourceGroup().id)}'
var uploadsContainerName = 'invoice-attachments'

var tags = {
  project: 'H_Tracker'
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
    name: 'Standard_B1ms'
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
      // Public access — firewall rules defined below.
      // For production hardening, replace with VNet injection.
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

// Allow connections from Azure services (0.0.0.0 → 0.0.0.0 is the Azure magic range)
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
// 3b. Storage Account + Blob container (invoice fee attachments)
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
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey};EndpointSuffix=${environment().suffixes.storage}'

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
      // Secrets: DB URL, JWT key, and ACR credentials
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
        // CORS is handled by FastAPI's CORSMiddleware (CORS_ORIGINS env var,
        // set to the frontend FQDN by the deploy pipeline). Defining it here too
        // would emit duplicate Access-Control-Allow-Origin headers.
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
            {
              name: 'AUTH_MODE'
              value: 'jwt'
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
            {
              name: 'COP_TO_USD_RATE'
              value: copToUsdRate
            }
            {
              name: 'EUR_TO_USD_RATE'
              value: eurToUsdRate
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
  // Frontend image is built with VITE_* args baked in at build time.
  // VITE_API_URL must point to the backend ingress FQDN — the pipeline
  // passes this as a build-arg when the backend URL is known post-deploy.
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
            // Runtime env var — Nginx can expose this via window.__env__ injection
            // or the pipeline rebuilds the image with the correct VITE_API_URL arg.
            {
              name: 'BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
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
// Outputs
// ---------------------------------------------------------------------------

@description('Public URL of the frontend Container App.')
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'

@description('Public URL of the backend Container App.')
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'

@description('Backend FQDN (without scheme) — use as VITE_API_URL build arg.')
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn

@description('Frontend FQDN (without scheme).')
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn

@description('Azure Container Registry login server.')
output acrLoginServer string = acr.properties.loginServer

@description('PostgreSQL Flexible Server FQDN.')
output pgServerFqdn string = pgServer.properties.fullyQualifiedDomainName

@description('Storage account name holding invoice attachments.')
output storageAccountName string = storageAccount.name

@description('Blob container name for invoice attachments.')
output uploadsContainerName string = uploadsContainerName

@description('Log Analytics Workspace resource ID.')
output logAnalyticsWorkspaceId string = logAnalytics.id
