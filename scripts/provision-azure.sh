#!/usr/bin/env bash
# Provisions Kratos into the team's pSpark resource group with the Azure CLI.
# Usage: RG=<resource-group> PREFIX=kratos ./scripts/provision-azure.sh
# Idempotent: re-running updates existing resources. Secrets go to Key Vault only and are never echoed.
set -euo pipefail
: "${RG:?Set RG to the resource group}"
PREFIX="${PREFIX:-kratos}"
LOC="$(az group show -n "$RG" --query location -o tsv)"
SUFFIX="$(printf '%s' "$RG" | md5sum | cut -c1-5)"
KV="${PREFIX}-kv-${SUFFIX}"
SQL="${PREFIX}-sql-${SUFFIX}"
DB="kratos"
PLAN="${PREFIX}-plan"
API="${PREFIX}-api-${SUFFIX}"
FUNC="${PREFIX}-jobs-${SUFFIX}"
ST="${PREFIX}st${SUFFIX}"
SWA="${PREFIX}-web-${SUFFIX}"

echo "==> Key Vault $KV"
az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true -o none

echo "==> Azure SQL $SQL/$DB (Entra-only authentication, you as admin)"
ME_ID="$(az ad signed-in-user show --query id -o tsv)"
ME_UPN="$(az ad signed-in-user show --query userPrincipalName -o tsv)"
az sql server create -g "$RG" -n "$SQL" -l "$LOC" --enable-ad-only-auth --external-admin-principal-type User \
  --external-admin-name "$ME_UPN" --external-admin-sid "$ME_ID" -o none
az sql db create -g "$RG" -s "$SQL" -n "$DB" --service-objective Basic -o none
az sql server firewall-rule create -g "$RG" -s "$SQL" -n AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none

echo "==> Storage $ST (Functions runtime)"
az storage account create -g "$RG" -n "$ST" -l "$LOC" --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false -o none

echo "==> App Service $API"
az appservice plan create -g "$RG" -n "$PLAN" -l "$LOC" --sku B1 --is-linux -o none
az webapp create -g "$RG" -p "$PLAN" -n "$API" --runtime "DOTNETCORE:10.0" --assign-identity "[system]" -o none
az webapp update -g "$RG" -n "$API" --https-only true -o none

echo "==> Functions $FUNC"
az functionapp create -g "$RG" -n "$FUNC" -s "$ST" --consumption-plan-location "$LOC" --runtime dotnet-isolated \
  --functions-version 4 --os-type Linux --assign-identity "[system]" -o none

echo "==> Static Web App $SWA"
az staticwebapp create -g "$RG" -n "$SWA" -l "$LOC" --sku Free -o none
WEB_URL="https://$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)"

echo "==> Grant managed identities read access to Key Vault secrets"
KV_ID="$(az keyvault show -n "$KV" --query id -o tsv)"
for APP in "$API" "$FUNC"; do
  PID="$(az resource show -g "$RG" -n "$APP" --resource-type Microsoft.Web/sites --query identity.principalId -o tsv)"
  az role assignment create --assignee-object-id "$PID" --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets User" --scope "$KV_ID" -o none
done

echo "==> Secrets"
az keyvault secret set --vault-name "$KV" -n "Jwt--SigningKey" --value "$(openssl rand -base64 48)" -o none
prompt_secret() {
  local label="$1" name="$2" value
  read -rsp "$label (blank to skip): " value; echo
  if [ -n "$value" ]; then az keyvault secret set --vault-name "$KV" -n "$name" --value "$value" -o none; fi
}
prompt_secret "Anthropic API key" "Ai--Keys--Anthropic"
prompt_secret "Gemini API key" "Ai--Keys--Gemini"
prompt_secret "Groq API key" "Ai--Keys--Groq"
prompt_secret "Demo seed password (blank = no demo data)" "Seed--DemoPassword"

CS="Server=tcp:${SQL}.database.windows.net,1433;Database=${DB};Authentication=Active Directory Default;Encrypt=True;"
for APP in "$API" "$FUNC"; do
  az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
    "KeyVault__Uri=https://${KV}.vault.azure.net/" "Database__Provider=SqlServer" "ConnectionStrings__Kratos=${CS}" \
    "ASPNETCORE_ENVIRONMENT=Production" "Cors__AllowedOrigins__0=${WEB_URL}" "Scheduler__Enabled=false"
done

echo
echo "Provisioned. Next steps:"
echo " 1. In the Azure SQL query editor (signed in as the Entra admin), give the app identities database access:"
echo "      CREATE USER [$API] FROM EXTERNAL PROVIDER; ALTER ROLE db_datareader ADD MEMBER [$API]; ALTER ROLE db_datawriter ADD MEMBER [$API]; ALTER ROLE db_ddladmin ADD MEMBER [$API];"
echo "      CREATE USER [$FUNC] FROM EXTERNAL PROVIDER; ALTER ROLE db_datareader ADD MEMBER [$FUNC]; ALTER ROLE db_datawriter ADD MEMBER [$FUNC];"
echo " 2. Set GitHub repository variables for .github/workflows/deploy.yml:"
echo "      AZURE_WEBAPP_NAME=$API  AZURE_FUNCTIONAPP_NAME=$FUNC  API_BASE_URL=https://${API}.azurewebsites.net"
echo " 3. Web app URL: $WEB_URL"
