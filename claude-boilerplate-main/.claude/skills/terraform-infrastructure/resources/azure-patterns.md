# Azure Infrastructure Patterns with Terraform

## Azure Naming Conventions and Resource Groups

### Standard Naming Convention

```hcl
locals {
  # Azure naming convention: {resource_type}-{environment}-{location}-{app_name}-{instance}
  naming_prefix = "${var.environment}-${var.location_short}-${var.app_name}"

  common_tags = {
    Environment  = var.environment
    ManagedBy    = "Terraform"
    Application  = var.app_name
    CostCenter   = var.cost_center
    Owner        = var.owner_email
  }

  location_map = {
    "eastus"      = "eus"
    "eastus2"     = "eus2"
    "westus"      = "wus"
    "westus2"     = "wus2"
    "centralus"   = "cus"
    "northeurope" = "neu"
    "westeurope"  = "weu"
  }

  location_short = lookup(local.location_map, var.location, "unk")
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "rg-${local.naming_prefix}"
  location = var.location

  tags = local.common_tags
}

# Additional resource groups for organization
resource "azurerm_resource_group" "network" {
  name     = "rg-${local.naming_prefix}-network"
  location = var.location

  tags = merge(local.common_tags, {
    Purpose = "Networking Resources"
  })
}

resource "azurerm_resource_group" "data" {
  name     = "rg-${local.naming_prefix}-data"
  location = var.location

  tags = merge(local.common_tags, {
    Purpose = "Data Resources"
  })
}

resource "azurerm_resource_group" "security" {
  name     = "rg-${local.naming_prefix}-security"
  location = var.location

  tags = merge(local.common_tags, {
    Purpose = "Security Resources"
  })
}
```

## Virtual Network and Subnets

### Hub-Spoke Network Architecture

```hcl
# Virtual Network
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${local.naming_prefix}"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name
  address_space       = [var.vnet_cidr]

  tags = local.common_tags
}

# Network Security Groups
resource "azurerm_network_security_group" "web" {
  name                = "nsg-${local.naming_prefix}-web"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTP"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

resource "azurerm_network_security_group" "app" {
  name                = "nsg-${local.naming_prefix}-app"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  security_rule {
    name                       = "AllowWebSubnet"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8080"
    source_address_prefix      = var.web_subnet_cidr
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

resource "azurerm_network_security_group" "data" {
  name                = "nsg-${local.naming_prefix}-data"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  security_rule {
    name                       = "AllowAppSubnet"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["1433", "5432"]
    source_address_prefix      = var.app_subnet_cidr
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

# Subnets
resource "azurerm_subnet" "web" {
  name                 = "snet-${local.naming_prefix}-web"
  resource_group_name  = azurerm_resource_group.network.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.web_subnet_cidr]

  service_endpoints = [
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.Sql"
  ]
}

resource "azurerm_subnet_network_security_group_association" "web" {
  subnet_id                 = azurerm_subnet.web.id
  network_security_group_id = azurerm_network_security_group.web.id
}

resource "azurerm_subnet" "app" {
  name                 = "snet-${local.naming_prefix}-app"
  resource_group_name  = azurerm_resource_group.network.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.app_subnet_cidr]

  service_endpoints = [
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.Sql"
  ]

  delegation {
    name = "app-service-delegation"

    service_delegation {
      name = "Microsoft.Web/serverFarms"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action"
      ]
    }
  }
}

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_subnet" "data" {
  name                 = "snet-${local.naming_prefix}-data"
  resource_group_name  = azurerm_resource_group.network.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.data_subnet_cidr]

  service_endpoints = ["Microsoft.Sql"]
}

resource "azurerm_subnet_network_security_group_association" "data" {
  subnet_id                 = azurerm_subnet.data.id
  network_security_group_id = azurerm_network_security_group.data.id
}
```

## Azure App Service (Web Apps)

### App Service Plan and Web App with Deployment Slots

```hcl
# App Service Plan
resource "azurerm_service_plan" "main" {
  name                = "asp-${local.naming_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = var.app_service_sku

  tags = local.common_tags
}

# Linux Web App
resource "azurerm_linux_web_app" "main" {
  name                = "app-${local.naming_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.main.id

  https_only = true

  site_config {
    always_on = var.environment == "production"

    application_stack {
      node_version = "18-lts"
    }

    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"

    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 5

    cors {
      allowed_origins = var.allowed_origins
      support_credentials = true
    }
  }

  app_settings = {
    "WEBSITE_RUN_FROM_PACKAGE"       = "1"
    "APPINSIGHTS_INSTRUMENTATIONKEY" = azurerm_application_insights.main.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.main.connection_string

    # Database connection (retrieve from Key Vault at runtime)
    "DATABASE_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.db_connection_string.id})"

    # Application settings
    "ENVIRONMENT" = var.environment
    "NODE_ENV"    = var.environment == "production" ? "production" : "development"
  }

  identity {
    type = "SystemAssigned"
  }

  logs {
    application_logs {
      file_system_level = "Information"

      azure_blob_storage {
        level             = "Information"
        retention_in_days = 30
        sas_url           = azurerm_storage_container.logs.sas_url
      }
    }

    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }
  }

  tags = local.common_tags
}

# Virtual Network Integration
resource "azurerm_app_service_virtual_network_swift_connection" "main" {
  app_service_id = azurerm_linux_web_app.main.id
  subnet_id      = azurerm_subnet.app.id
}

# Staging Deployment Slot
resource "azurerm_linux_web_app_slot" "staging" {
  name           = "staging"
  app_service_id = azurerm_linux_web_app.main.id

  site_config {
    always_on = false

    application_stack {
      node_version = "18-lts"
    }

    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"
  }

  app_settings = {
    "WEBSITE_RUN_FROM_PACKAGE" = "1"
    "APPINSIGHTS_INSTRUMENTATIONKEY" = azurerm_application_insights.main.instrumentation_key
    "ENVIRONMENT" = "staging"
    "NODE_ENV"    = "development"

    "DATABASE_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.db_connection_string_staging.id})"
  }

  identity {
    type = "SystemAssigned"
  }

  tags = merge(local.common_tags, {
    Slot = "Staging"
  })
}

# Custom Domain and SSL
resource "azurerm_app_service_custom_hostname_binding" "main" {
  hostname            = var.custom_domain
  app_service_name    = azurerm_linux_web_app.main.name
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_app_service_managed_certificate" "main" {
  custom_hostname_binding_id = azurerm_app_service_custom_hostname_binding.main.id
}

resource "azurerm_app_service_certificate_binding" "main" {
  hostname_binding_id = azurerm_app_service_custom_hostname_binding.main.id
  certificate_id      = azurerm_app_service_managed_certificate.main.id
  ssl_state           = "SniEnabled"
}
```

## Azure SQL Database

### SQL Server and Database with Advanced Security

```hcl
# Random password generation
resource "random_password" "sql_admin" {
  length  = 32
  special = true
}

# SQL Server
resource "azurerm_mssql_server" "main" {
  name                         = "sql-${local.naming_prefix}"
  resource_group_name          = azurerm_resource_group.data.name
  location                     = azurerm_resource_group.data.location
  version                      = "12.0"
  administrator_login          = var.sql_admin_username
  administrator_login_password = random_password.sql_admin.result

  minimum_tls_version = "1.2"

  azuread_administrator {
    login_username = var.sql_azuread_admin_login
    object_id      = var.sql_azuread_admin_object_id
    tenant_id      = data.azurerm_client_config.current.tenant_id
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# SQL Database
resource "azurerm_mssql_database" "main" {
  name                        = "sqldb-${local.naming_prefix}"
  server_id                   = azurerm_mssql_server.main.id
  collation                   = "SQL_Latin1_General_CP1_CI_AS"
  sku_name                    = var.sql_sku_name
  max_size_gb                 = var.sql_max_size_gb
  zone_redundant              = var.environment == "production"
  auto_pause_delay_in_minutes = var.environment != "production" ? 60 : -1

  short_term_retention_policy {
    retention_days = var.environment == "production" ? 35 : 7
  }

  long_term_retention_policy {
    weekly_retention  = var.environment == "production" ? "P4W" : null
    monthly_retention = var.environment == "production" ? "P12M" : null
    yearly_retention  = var.environment == "production" ? "P5Y" : null
    week_of_year      = var.environment == "production" ? 1 : null
  }

  threat_detection_policy {
    state                      = "Enabled"
    email_account_admins       = "Enabled"
    email_addresses            = [var.security_email]
    retention_days             = 90
    storage_endpoint           = azurerm_storage_account.security.primary_blob_endpoint
    storage_account_access_key = azurerm_storage_account.security.primary_access_key
  }

  tags = local.common_tags
}

# Transparent Data Encryption
resource "azurerm_mssql_database_transparent_data_encryption" "main" {
  database_id = azurerm_mssql_database.main.id
}

# Firewall Rules
resource "azurerm_mssql_firewall_rule" "allow_azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Virtual Network Rule
resource "azurerm_mssql_virtual_network_rule" "app_subnet" {
  name      = "allow-app-subnet"
  server_id = azurerm_mssql_server.main.id
  subnet_id = azurerm_subnet.app.id
}

# Auditing
resource "azurerm_mssql_server_extended_auditing_policy" "main" {
  server_id                               = azurerm_mssql_server.main.id
  storage_endpoint                        = azurerm_storage_account.security.primary_blob_endpoint
  storage_account_access_key              = azurerm_storage_account.security.primary_access_key
  storage_account_access_key_is_secondary = false
  retention_in_days                       = 90

  log_monitoring_enabled = true
}

# Advanced Data Security
resource "azurerm_mssql_server_security_alert_policy" "main" {
  resource_group_name = azurerm_resource_group.data.name
  server_name         = azurerm_mssql_server.main.name
  state               = "Enabled"

  email_account_admins = true
  email_addresses      = [var.security_email]

  retention_days = 90
}

resource "azurerm_mssql_server_vulnerability_assessment" "main" {
  server_security_alert_policy_id = azurerm_mssql_server_security_alert_policy.main.id
  storage_container_path          = "${azurerm_storage_account.security.primary_blob_endpoint}${azurerm_storage_container.vulnerability_assessment.name}/"
  storage_account_access_key      = azurerm_storage_account.security.primary_access_key

  recurring_scans {
    enabled                   = true
    email_subscription_admins = true
    emails                    = [var.security_email]
  }
}
```

## Azure Storage Account

### Multi-purpose Storage with Containers and File Shares

```hcl
# Storage Account
resource "azurerm_storage_account" "main" {
  name                     = "st${replace(local.naming_prefix, "-", "")}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "production" ? "GRS" : "LRS"
  account_kind             = "StorageV2"

  enable_https_traffic_only = true
  min_tls_version          = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true
    change_feed_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }

    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "POST", "PUT"]
      allowed_origins    = var.allowed_origins
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  network_rules {
    default_action             = "Deny"
    bypass                     = ["AzureServices"]
    virtual_network_subnet_ids = [azurerm_subnet.app.id]
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# Blob Containers
resource "azurerm_storage_container" "uploads" {
  name                  = "uploads"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "logs" {
  name                  = "logs"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Blob Lifecycle Management
resource "azurerm_storage_management_policy" "main" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "move-old-logs-to-cool"
    enabled = true

    filters {
      prefix_match = ["logs/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than = 30
        tier_to_archive_after_days_since_modification_greater_than = 90
        delete_after_days_since_modification_greater_than = 365
      }
    }
  }

  rule {
    name    = "delete-old-backups"
    enabled = true

    filters {
      prefix_match = ["backups/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 90
      }

      snapshot {
        delete_after_days_since_creation_greater_than = 30
      }
    }
  }
}

# File Share
resource "azurerm_storage_share" "app_data" {
  name                 = "app-data"
  storage_account_name = azurerm_storage_account.main.name
  quota                = 100
  enabled_protocol     = "SMB"

  acl {
    id = "AppServiceAccess"

    access_policy {
      permissions = "rwdl"
      start       = formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", timestamp())
      expiry      = formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", timeadd(timestamp(), "8760h"))
    }
  }
}

# Private Endpoint for Storage
resource "azurerm_private_endpoint" "storage_blob" {
  name                = "pe-${local.naming_prefix}-blob"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name
  subnet_id           = azurerm_subnet.data.id

  private_service_connection {
    name                           = "psc-storage-blob"
    private_connection_resource_id = azurerm_storage_account.main.id
    is_manual_connection           = false
    subresource_names              = ["blob"]
  }

  tags = local.common_tags
}
```

## Azure Key Vault

### Key Vault with Secrets and Access Policies

```hcl
data "azurerm_client_config" "current" {}

# Key Vault
resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.naming_prefix}"
  location                   = azurerm_resource_group.security.location
  resource_group_name        = azurerm_resource_group.security.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "premium"
  soft_delete_retention_days = 90
  purge_protection_enabled   = var.environment == "production"

  enabled_for_deployment          = false
  enabled_for_disk_encryption     = true
  enabled_for_template_deployment = true
  enable_rbac_authorization       = false

  network_acls {
    default_action             = "Deny"
    bypass                     = "AzureServices"
    virtual_network_subnet_ids = [azurerm_subnet.app.id]
  }

  tags = local.common_tags
}

# Access Policy for Terraform Service Principal
resource "azurerm_key_vault_access_policy" "terraform" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  secret_permissions = [
    "Get", "List", "Set", "Delete", "Recover", "Backup", "Restore", "Purge"
  ]

  key_permissions = [
    "Get", "List", "Create", "Delete", "Recover", "Backup", "Restore", "Purge"
  ]

  certificate_permissions = [
    "Get", "List", "Create", "Delete", "Recover", "Backup", "Restore", "Purge"
  ]
}

# Access Policy for App Service Managed Identity
resource "azurerm_key_vault_access_policy" "app_service" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_linux_web_app.main.identity[0].principal_id

  secret_permissions = ["Get", "List"]
}

# Secrets
resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "database-connection-string"
  value        = "Server=tcp:${azurerm_mssql_server.main.fully_qualified_domain_name},1433;Initial Catalog=${azurerm_mssql_database.main.name};User ID=${var.sql_admin_username};Password=${random_password.sql_admin.result};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  tags = local.common_tags
}

resource "azurerm_key_vault_secret" "storage_connection_string" {
  name         = "storage-connection-string"
  value        = azurerm_storage_account.main.primary_connection_string
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  tags = local.common_tags
}

resource "azurerm_key_vault_secret" "api_key" {
  name         = "external-api-key"
  value        = var.external_api_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_access_policy.terraform]

  tags = local.common_tags
}

# Diagnostic Settings for Key Vault
resource "azurerm_monitor_diagnostic_setting" "key_vault" {
  name                       = "key-vault-diagnostics"
  target_resource_id         = azurerm_key_vault.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "AuditEvent"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}
```

## Application Insights and Monitoring

### Application Insights with Log Analytics

```hcl
# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.naming_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "production" ? 90 : 30

  tags = local.common_tags
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = "appi-${local.naming_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  retention_in_days = var.environment == "production" ? 90 : 30

  tags = local.common_tags
}

# Action Group for Alerts
resource "azurerm_monitor_action_group" "main" {
  name                = "ag-${local.naming_prefix}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = substr(var.app_name, 0, 12)

  email_receiver {
    name          = "Admin"
    email_address = var.admin_email
  }

  webhook_receiver {
    name        = "Slack"
    service_uri = var.slack_webhook_url
  }

  tags = local.common_tags
}

# Metric Alerts
resource "azurerm_monitor_metric_alert" "high_cpu" {
  name                = "alert-${local.naming_prefix}-high-cpu"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_service_plan.main.id]
  description         = "Alert when CPU usage is above 80%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Web/serverfarms"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = local.common_tags
}

resource "azurerm_monitor_metric_alert" "high_response_time" {
  name                = "alert-${local.naming_prefix}-high-response-time"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_linux_web_app.main.id]
  description         = "Alert when response time is above 5 seconds"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "HttpResponseTime"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = local.common_tags
}
```

## Azure Container Instances

### Container Group with Multiple Containers

```hcl
# Container Registry
resource "azurerm_container_registry" "main" {
  name                = "acr${replace(local.naming_prefix, "-", "")}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Premium"
  admin_enabled       = false

  georeplications {
    location = var.dr_location
    tags     = local.common_tags
  }

  network_rule_set {
    default_action = "Deny"

    virtual_network {
      action    = "Allow"
      subnet_id = azurerm_subnet.app.id
    }
  }

  tags = local.common_tags
}

# Container Instance Group
resource "azurerm_container_group" "main" {
  name                = "ci-${local.naming_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  restart_policy      = "Always"

  ip_address_type = "Private"
  subnet_ids      = [azurerm_subnet.app.id]

  image_registry_credential {
    server   = azurerm_container_registry.main.login_server
    username = azurerm_container_registry.main.admin_username
    password = azurerm_container_registry.main.admin_password
  }

  container {
    name   = "app"
    image  = "${azurerm_container_registry.main.login_server}/myapp:latest"
    cpu    = "1.0"
    memory = "1.5"

    ports {
      port     = 80
      protocol = "TCP"
    }

    environment_variables = {
      "ENVIRONMENT" = var.environment
    }

    secure_environment_variables = {
      "DATABASE_URL" = azurerm_key_vault_secret.db_connection_string.value
    }

    volume {
      name                 = "logs"
      mount_path           = "/app/logs"
      storage_account_name = azurerm_storage_account.main.name
      storage_account_key  = azurerm_storage_account.main.primary_access_key
      share_name           = azurerm_storage_share.app_data.name
    }
  }

  diagnostics {
    log_analytics {
      workspace_id  = azurerm_log_analytics_workspace.main.workspace_id
      workspace_key = azurerm_log_analytics_workspace.main.primary_shared_key
    }
  }

  tags = local.common_tags
}
```

## Azure Load Balancer

### Public Load Balancer with Backend Pool

```hcl
# Public IP for Load Balancer
resource "azurerm_public_ip" "lb" {
  name                = "pip-${local.naming_prefix}-lb"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name
  allocation_method   = "Static"
  sku                 = "Standard"

  tags = local.common_tags
}

# Load Balancer
resource "azurerm_lb" "main" {
  name                = "lb-${local.naming_prefix}"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name
  sku                 = "Standard"

  frontend_ip_configuration {
    name                 = "PublicIPAddress"
    public_ip_address_id = azurerm_public_ip.lb.id
  }

  tags = local.common_tags
}

# Backend Address Pool
resource "azurerm_lb_backend_address_pool" "main" {
  loadbalancer_id = azurerm_lb.main.id
  name            = "BackendPool"
}

# Health Probe
resource "azurerm_lb_probe" "http" {
  loadbalancer_id = azurerm_lb.main.id
  name            = "http-probe"
  protocol        = "Http"
  request_path    = "/health"
  port            = 80
  interval_in_seconds = 15
  number_of_probes    = 2
}

# Load Balancing Rule
resource "azurerm_lb_rule" "http" {
  loadbalancer_id                = azurerm_lb.main.id
  name                           = "HTTP"
  protocol                       = "Tcp"
  frontend_port                  = 80
  backend_port                   = 80
  frontend_ip_configuration_name = "PublicIPAddress"
  backend_address_pool_ids       = [azurerm_lb_backend_address_pool.main.id]
  probe_id                       = azurerm_lb_probe.http.id
  enable_floating_ip             = false
  idle_timeout_in_minutes        = 4
}

resource "azurerm_lb_rule" "https" {
  loadbalancer_id                = azurerm_lb.main.id
  name                           = "HTTPS"
  protocol                       = "Tcp"
  frontend_port                  = 443
  backend_port                   = 443
  frontend_ip_configuration_name = "PublicIPAddress"
  backend_address_pool_ids       = [azurerm_lb_backend_address_pool.main.id]
  probe_id                       = azurerm_lb_probe.http.id
  enable_floating_ip             = false
  idle_timeout_in_minutes        = 4
}

# NAT Rule for SSH
resource "azurerm_lb_nat_rule" "ssh" {
  count                          = var.vm_count
  resource_group_name            = azurerm_resource_group.network.name
  loadbalancer_id                = azurerm_lb.main.id
  name                           = "SSH-VM${count.index}"
  protocol                       = "Tcp"
  frontend_port                  = 2200 + count.index
  backend_port                   = 22
  frontend_ip_configuration_name = "PublicIPAddress"
}
```

## Complete Three-Tier Application Example

```hcl
# Variables
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "app_name" {
  type = string
}

# Main configuration combining all components
module "three_tier_app" {
  source = "./modules/three-tier-app"

  environment = var.environment
  location    = var.location
  app_name    = var.app_name

  # Network configuration
  vnet_cidr        = "10.0.0.0/16"
  web_subnet_cidr  = "10.0.1.0/24"
  app_subnet_cidr  = "10.0.2.0/24"
  data_subnet_cidr = "10.0.3.0/24"

  # App Service configuration
  app_service_sku = var.environment == "production" ? "P2v3" : "B2"

  # SQL configuration
  sql_sku_name    = var.environment == "production" ? "S3" : "Basic"
  sql_max_size_gb = var.environment == "production" ? 250 : 2

  # Monitoring
  admin_email        = "admin@example.com"
  security_email     = "security@example.com"
  slack_webhook_url  = var.slack_webhook_url

  common_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Application = var.app_name
  }
}

# Outputs
output "web_app_url" {
  value = "https://${module.three_tier_app.web_app_default_hostname}"
}

output "sql_server_fqdn" {
  value     = module.three_tier_app.sql_server_fqdn
  sensitive = true
}

output "key_vault_uri" {
  value = module.three_tier_app.key_vault_uri
}
```

## Best Practices

### Resource Organization
- Use consistent naming conventions across all resources
- Group related resources in dedicated resource groups
- Apply comprehensive tagging strategy for cost tracking and management
- Use Azure Policy to enforce organizational standards

### Security
- Enable Azure AD authentication wherever possible
- Store all secrets in Key Vault, never in code or app settings directly
- Use managed identities for service-to-service authentication
- Enable network isolation with VNet integration and private endpoints
- Implement least-privilege access with RBAC
- Enable Azure Security Center recommendations

### Networking
- Always use private endpoints for PaaS services when possible
- Implement Network Security Groups with deny-by-default rules
- Use service endpoints for secure communication
- Enable DDoS Protection Standard for production workloads
- Implement hub-spoke topology for complex environments

### High Availability
- Use availability zones for critical workloads
- Enable geo-replication for storage and databases in production
- Implement health checks and auto-healing
- Use deployment slots for zero-downtime deployments
- Configure auto-scaling based on metrics

### Monitoring and Logging
- Centralize logs in Log Analytics workspace
- Enable diagnostic settings on all resources
- Configure meaningful alerts with appropriate thresholds
- Use Application Insights for application performance monitoring
- Implement distributed tracing for microservices

### Cost Optimization
- Use auto-pause for development databases
- Implement lifecycle management for storage
- Right-size resources based on actual usage
- Use Azure Hybrid Benefit for Windows workloads
- Enable auto-shutdown for development VMs
- Review and act on Azure Advisor recommendations

### Compliance and Governance
- Use Azure Policy for compliance enforcement
- Enable Azure Blueprints for repeatable deployments
- Implement resource locks on production resources
- Regular security assessments and vulnerability scans
- Maintain audit logs for compliance requirements
