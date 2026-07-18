#!/usr/bin/env bash
# =============================================================================
# H_Tracker — One-time Azure bootstrap script
# =============================================================================
# Run this ONCE from a machine with:
#   - Azure CLI (az) installed and logged in as an Owner/User Access Admin
#   - Sufficient permissions to create App Registrations in Entra ID
#
# What this script does:
#   1. Creates the Resource Group
#   2. Creates the Azure Container Registry (so the Service Principal can be
#      scoped to it for AcrPush)
#   3. Creates an App Registration + Service Principal for GitHub Actions OIDC
#   4. Adds a Federated Credential (no client secrets — pure OIDC)
#   5. Assigns roles: Contributor on RG, AcrPush on ACR
#   6. Prints the values to add as GitHub repository secrets
#
# Usage:
#   chmod +x infra/setup.sh
#   ./infra/setup.sh
#
# Customise the variables in the CONFIG section below if needed.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# CONFIG — edit these if you need different values
# ---------------------------------------------------------------------------

RESOURCE_GROUP="impactpoint-hours-rg"
LOCATION="eastus2"
ACR_NAME="impactpointhoursacr"
APP_NAME="impactpoint-hours-github-actions"     # Entra ID App Registration name
GITHUB_ORG="JuanLeguizamonCol"                  # GitHub user or org (must match the repo owner exactly)
GITHUB_REPO="h_tracker"                          # GitHub repository name (must match exactly, case-sensitive for OIDC)
GITHUB_BRANCH="master"                          # Branch that triggers deployments

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()    { echo "[INFO]  $*"; }
success() { echo "[OK]    $*"; }
warn()    { echo "[WARN]  $*"; }
hr()      { echo "------------------------------------------------------------------------"; }

# ---------------------------------------------------------------------------
# 0. Validate login
# ---------------------------------------------------------------------------

info "Checking Azure CLI login..."
CURRENT_USER=$(az account show --query user.name -o tsv 2>/dev/null || true)
if [[ -z "$CURRENT_USER" ]]; then
  echo "[ERROR] Not logged in to Azure CLI. Run: az login"
  exit 1
fi
success "Logged in as: $CURRENT_USER"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
info "Subscription : $SUBSCRIPTION_ID"
info "Tenant       : $TENANT_ID"
hr

# ---------------------------------------------------------------------------
# 1. Resource Group
# ---------------------------------------------------------------------------

info "Creating Resource Group: $RESOURCE_GROUP in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
success "Resource Group ready."
hr

# ---------------------------------------------------------------------------
# 2. Azure Container Registry
# ---------------------------------------------------------------------------

info "Creating Azure Container Registry: $ACR_NAME..."
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku Basic \
  --admin-enabled true \
  --location "$LOCATION" \
  --output none
success "ACR ready."

ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
info "ACR resource ID: $ACR_ID"
hr

# ---------------------------------------------------------------------------
# 3. App Registration + Service Principal
# ---------------------------------------------------------------------------

info "Creating App Registration: $APP_NAME..."

# Check if it already exists
EXISTING_APP_ID=$(az ad app list \
  --display-name "$APP_NAME" \
  --query "[0].appId" -o tsv 2>/dev/null || true)

if [[ -n "$EXISTING_APP_ID" && "$EXISTING_APP_ID" != "None" ]]; then
  warn "App Registration already exists with client ID: $EXISTING_APP_ID"
  CLIENT_ID="$EXISTING_APP_ID"
else
  CLIENT_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --query appId -o tsv)
  success "App Registration created. Client ID: $CLIENT_ID"
fi

# Ensure a Service Principal exists for the App Registration
SP_EXISTS=$(az ad sp show --id "$CLIENT_ID" --query appId -o tsv 2>/dev/null || true)
if [[ -z "$SP_EXISTS" || "$SP_EXISTS" == "None" ]]; then
  info "Creating Service Principal..."
  az ad sp create --id "$CLIENT_ID" --output none
  success "Service Principal created."
else
  info "Service Principal already exists."
fi

SP_OBJECT_ID=$(az ad sp show --id "$CLIENT_ID" --query id -o tsv)
hr

# ---------------------------------------------------------------------------
# 4. Federated Credential (GitHub OIDC — no client secrets)
# ---------------------------------------------------------------------------

FEDERATED_CREDENTIAL_NAME="github-actions-${GITHUB_REPO}-${GITHUB_BRANCH}"

info "Adding Federated Credential for GitHub OIDC..."
info "Subject: repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}"

# Check if credential already exists
EXISTING_CRED=$(az ad app federated-credential list \
  --id "$CLIENT_ID" \
  --query "[?name=='${FEDERATED_CREDENTIAL_NAME}'].name" -o tsv 2>/dev/null || true)

if [[ -n "$EXISTING_CRED" ]]; then
  warn "Federated credential '$FEDERATED_CREDENTIAL_NAME' already exists. Skipping."
else
  az ad app federated-credential create \
    --id "$CLIENT_ID" \
    --parameters "{
      \"name\": \"${FEDERATED_CREDENTIAL_NAME}\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}\",
      \"description\": \"GitHub Actions OIDC for H_Tracker deployments on branch ${GITHUB_BRANCH}\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }"
  success "Federated credential created."
fi

# Also add a credential for workflow_dispatch (any ref)
FEDERATED_CREDENTIAL_NAME_WD="github-actions-${GITHUB_REPO}-workflow-dispatch"
EXISTING_CRED_WD=$(az ad app federated-credential list \
  --id "$CLIENT_ID" \
  --query "[?name=='${FEDERATED_CREDENTIAL_NAME_WD}'].name" -o tsv 2>/dev/null || true)

if [[ -z "$EXISTING_CRED_WD" ]]; then
  az ad app federated-credential create \
    --id "$CLIENT_ID" \
    --parameters "{
      \"name\": \"${FEDERATED_CREDENTIAL_NAME_WD}\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:workflow_dispatch\",
      \"description\": \"GitHub Actions OIDC for manual workflow_dispatch triggers\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }"
  success "Federated credential for workflow_dispatch created."
fi
hr

# ---------------------------------------------------------------------------
# 5. Role assignments
# ---------------------------------------------------------------------------

RG_ID=$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)

info "Assigning Contributor role on Resource Group..."
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "$RG_ID" \
  --output none 2>/dev/null || warn "Contributor role already assigned on RG."
success "Contributor on $RESOURCE_GROUP assigned."

info "Assigning AcrPush role on ACR..."
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPush" \
  --scope "$ACR_ID" \
  --output none 2>/dev/null || warn "AcrPush role already assigned on ACR."
success "AcrPush on $ACR_NAME assigned."
hr

# ---------------------------------------------------------------------------
# 6. Print GitHub Secrets
# ---------------------------------------------------------------------------

echo ""
echo "=========================================================================="
echo "  GITHUB REPOSITORY SECRETS"
echo "  Go to: https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/settings/secrets/actions"
echo "  Add the following as Repository Secrets (Settings → Secrets and variables → Actions):"
echo "=========================================================================="
echo ""
echo "  Secret name            | Value"
echo "  -----------------------|-----------------------------------------------"
echo "  AZURE_CLIENT_ID        | ${CLIENT_ID}"
echo "  AZURE_TENANT_ID        | ${TENANT_ID}"
echo "  AZURE_SUBSCRIPTION_ID  | ${SUBSCRIPTION_ID}"
echo "  DB_PASSWORD            | <choose a strong password — min 8 chars, upper+lower+digit+symbol>"
echo "  JWT_SECRET_KEY         | <generate with: openssl rand -base64 48>"
echo ""
echo "=========================================================================="
echo "  NEXT STEPS"
echo "=========================================================================="
echo ""
echo "  1. Add the secrets above to your GitHub repository."
echo ""
echo "  2. First deploy — run manually from GitHub Actions tab (workflow_dispatch)"
echo "     or push a commit to main."
echo ""
echo "  3. After first deploy, retrieve the deployed URLs:"
echo "     az deployment group show \\"
echo "       --resource-group ${RESOURCE_GROUP} \\"
echo "       --name deploy-<sha> \\"
echo "       --query '{frontend:properties.outputs.frontendUrl.value,backend:properties.outputs.backendUrl.value}' -o json"
echo ""
echo "  4. Push again if needed — from the second deploy onward, VITE_API_URL"
echo "     is resolved automatically from the backend Container App FQDN."
echo ""
echo "  5. (Optional) Add a custom domain to the Container Apps."
echo "=========================================================================="
