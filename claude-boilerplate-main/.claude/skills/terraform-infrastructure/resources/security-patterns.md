# Terraform Security Patterns and Best Practices

## Secrets Management

### Never Store Secrets in Code

```hcl
# BAD - Hardcoded secrets (NEVER DO THIS!)
resource "aws_db_instance" "bad_example" {
  password = "SuperSecret123!"  # ❌ Never hardcode passwords
}

variable "api_key" {
  default = "sk-1234567890abcdef"  # ❌ Never use default secrets
}

# GOOD - Use external secret management
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "production/database/master-password"
}

resource "aws_db_instance" "good_example" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# BETTER - Use AWS-managed password
resource "aws_db_instance" "better_example" {
  manage_master_user_password = true  # AWS generates and rotates
}

# Random password generation (store in secrets manager)
resource "random_password" "db_password" {
  length  = 32
  special = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "production/database/master-password"
  recovery_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# Use environment variables for sensitive inputs
variable "api_key" {
  type        = string
  sensitive   = true
  description = "API key (set via TF_VAR_api_key environment variable)"
}

# Access secrets from Vault
data "vault_generic_secret" "database" {
  path = "secret/production/database"
}

resource "aws_db_instance" "main" {
  username = data.vault_generic_secret.database.data["username"]
  password = data.vault_generic_secret.database.data["password"]
}
```

### AWS Secrets Manager Integration

```hcl
# Complete Secrets Manager setup
resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${var.environment}/application/secrets"
  description = "Application secrets for ${var.environment}"

  kms_key_id = aws_kms_key.secrets.id

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  replica {
    region = var.dr_region
  }

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    database_url     = "postgresql://${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
    database_password = random_password.db_password.result
    api_key          = var.api_key
    jwt_secret       = random_password.jwt_secret.result
  })

  version_stages = ["AWSCURRENT"]
}

# Rotation configuration
resource "aws_secretsmanager_secret_rotation" "db_password" {
  secret_id           = aws_secretsmanager_secret.db_password.id
  rotation_lambda_arn = aws_lambda_function.rotate_secret.arn

  rotation_rules {
    automatically_after_days = 30
  }
}

# Lambda function for rotation
resource "aws_lambda_function" "rotate_secret" {
  filename      = "rotation-function.zip"
  function_name = "${var.environment}-secret-rotation"
  role          = aws_iam_role.rotation_lambda.arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 30

  environment {
    variables = {
      SECRETS_MANAGER_ENDPOINT = "https://secretsmanager.${var.region}.amazonaws.com"
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
}

# Resource policy for secret access
resource "aws_secretsmanager_secret_policy" "app_secrets" {
  secret_arn = aws_secretsmanager_secret.app_secrets.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.app.arn
        }
        Action   = "secretsmanager:GetSecretValue"
        Resource = "*"
        Condition = {
          StringEquals = {
            "secretsmanager:VersionStage" = "AWSCURRENT"
          }
        }
      }
    ]
  })
}
```

### Azure Key Vault Integration

```hcl
# Azure Key Vault for secrets
resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.naming_prefix}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "premium"
  soft_delete_retention_days = 90
  purge_protection_enabled   = var.environment == "production"

  enabled_for_disk_encryption     = true
  enabled_for_deployment          = false
  enabled_for_template_deployment = true

  enable_rbac_authorization = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = var.allowed_ip_ranges

    virtual_network_subnet_ids = [
      azurerm_subnet.app.id
    ]
  }

  contact {
    email = var.security_contact_email
    name  = "Security Team"
    phone = var.security_contact_phone
  }

  tags = local.common_tags
}

# Store secrets
resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "database-connection-string"
  value        = "Server=${azurerm_mssql_server.main.fully_qualified_domain_name};Database=${azurerm_mssql_database.main.name};User ID=${var.sql_admin_username};Password=${random_password.sql_admin.result}"
  key_vault_id = azurerm_key_vault.main.id

  content_type = "connection-string"

  expiration_date = timeadd(timestamp(), "8760h") # 1 year

  tags = local.common_tags
}

# Application access to Key Vault
resource "azurerm_role_assignment" "app_keyvault_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.main.identity[0].principal_id
}

# Reference secrets in application settings
resource "azurerm_linux_web_app" "main" {
  # ... other configuration ...

  app_settings = {
    "DB_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.db_connection_string.id})"
    "API_KEY"              = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.api_key.id})"
  }

  identity {
    type = "SystemAssigned"
  }
}
```

### GCP Secret Manager Integration

```hcl
# GCP Secret Manager
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.environment}-database-password"

  replication {
    user_managed {
      replicas {
        location = var.region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secrets.id
        }
      }
      replicas {
        location = var.dr_region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secrets_dr.id
        }
      }
    }
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "db_password" {
  secret = google_secret_manager_secret.db_password.id

  secret_data = random_password.db_password.result
}

# IAM binding for secret access
resource "google_secret_manager_secret_iam_member" "app_access" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

# Cloud Run with secrets
resource "google_cloud_run_v2_service" "main" {
  name     = "app-${var.environment}"
  location = var.region

  template {
    containers {
      image = var.container_image

      env {
        name = "DATABASE_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
    }

    service_account = google_service_account.app.email
  }
}
```

## IAM Roles and Policies

### AWS IAM Best Practices

```hcl
# Principle of least privilege
data "aws_iam_policy_document" "app_policy" {
  # Allow reading specific secrets
  statement {
    sid    = "AllowSecretAccess"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]

    resources = [
      aws_secretsmanager_secret.app_secrets.arn
    ]

    condition {
      test     = "StringEquals"
      variable = "secretsmanager:VersionStage"
      values   = ["AWSCURRENT"]
    }
  }

  # Allow S3 access to specific bucket and prefix
  statement {
    sid    = "AllowS3Access"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = [
      "${aws_s3_bucket.app_data.arn}/uploads/${var.environment}/*"
    ]
  }

  statement {
    sid    = "AllowS3List"
    effect = "Allow"

    actions = [
      "s3:ListBucket"
    ]

    resources = [aws_s3_bucket.app_data.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["uploads/${var.environment}/*"]
    }
  }

  # Deny actions on production resources from non-production roles
  statement {
    sid    = "DenyProductionAccess"
    effect = "Deny"

    actions = [
      "rds:DeleteDBInstance",
      "rds:ModifyDBInstance",
      "s3:DeleteBucket"
    ]

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = ["us-east-1"]
    }

    condition {
      test     = "StringNotLike"
      variable = "aws:PrincipalArn"
      values   = ["arn:aws:iam::*:role/ProductionAdmin"]
    }
  }

  # Require MFA for sensitive operations
  statement {
    sid    = "RequireMFAForSensitiveOps"
    effect = "Deny"

    actions = [
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy"
    ]

    resources = ["*"]

    condition {
      test     = "BoolIfExists"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["false"]
    }
  }
}

# IAM role with session tags
resource "aws_iam_role" "app" {
  name = "${var.environment}-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = var.external_id
          }
          IpAddress = {
            "aws:SourceIp" = var.allowed_ip_ranges
          }
        }
      }
    ]
  })

  max_session_duration = 3600 # 1 hour

  permissions_boundary = aws_iam_policy.permission_boundary.arn

  tags = local.common_tags
}

resource "aws_iam_role_policy" "app" {
  name   = "${var.environment}-app-policy"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app_policy.json
}

# Permission boundary to prevent privilege escalation
data "aws_iam_policy_document" "permission_boundary" {
  statement {
    effect = "Allow"
    actions = [
      "s3:*",
      "dynamodb:*",
      "sqs:*",
      "sns:*"
    ]
    resources = ["*"]
  }

  statement {
    effect = "Deny"
    actions = [
      "iam:*",
      "organizations:*",
      "account:*"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "permission_boundary" {
  name   = "${var.environment}-permission-boundary"
  policy = data.aws_iam_policy_document.permission_boundary.json
}

# Service Control Policy for organization
resource "aws_organizations_policy" "security_guardrails" {
  name        = "SecurityGuardrails"
  description = "Mandatory security controls"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyDisablingEncryption"
        Effect = "Deny"
        Action = [
          "s3:PutEncryptionConfiguration",
          "rds:ModifyDBInstance"
        ]
        Resource = "*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid    = "DenyLeavingOrganization"
        Effect = "Deny"
        Action = [
          "organizations:LeaveOrganization"
        ]
        Resource = "*"
      },
      {
        Sid    = "RequireTagsOnResources"
        Effect = "Deny"
        Action = [
          "ec2:RunInstances",
          "rds:CreateDBInstance"
        ]
        Resource = "*"
        Condition = {
          "Null" = {
            "aws:RequestTag/Environment" = "true"
          }
        }
      }
    ]
  })
}
```

### Azure RBAC

```hcl
# Custom role definition
resource "azurerm_role_definition" "app_custom_role" {
  name        = "Application Custom Role"
  scope       = azurerm_resource_group.main.id
  description = "Custom role for application access"

  permissions {
    actions = [
      "Microsoft.Storage/storageAccounts/blobServices/containers/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/write",
      "Microsoft.Sql/servers/databases/read",
      "Microsoft.KeyVault/vaults/secrets/read"
    ]

    not_actions = [
      "Microsoft.Storage/storageAccounts/delete",
      "Microsoft.Sql/servers/databases/delete"
    ]

    data_actions = [
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write"
    ]

    not_data_actions = [
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/delete"
    ]
  }

  assignable_scopes = [
    azurerm_resource_group.main.id
  ]
}

# Assign custom role to managed identity
resource "azurerm_role_assignment" "app_custom" {
  scope              = azurerm_resource_group.main.id
  role_definition_id = azurerm_role_definition.app_custom_role.role_definition_resource_id
  principal_id       = azurerm_linux_web_app.main.identity[0].principal_id
}

# Conditional access with Azure AD
resource "azurerm_role_assignment" "conditional" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_web_app.main.identity[0].principal_id

  condition         = "@Resource[Microsoft.Storage/storageAccounts/blobServices/containers:name] StringEquals 'uploads'"
  condition_version = "2.0"
}
```

### GCP IAM

```hcl
# Custom IAM role
resource "google_project_iam_custom_role" "app_role" {
  role_id     = "appCustomRole"
  title       = "Application Custom Role"
  description = "Custom role for application access"

  permissions = [
    "storage.objects.get",
    "storage.objects.create",
    "storage.objects.delete",
    "cloudsql.instances.connect",
    "secretmanager.versions.access"
  ]

  stage = "GA"
}

# Service account with least privilege
resource "google_service_account" "app" {
  account_id   = "${var.environment}-app-sa"
  display_name = "Application Service Account"
  description  = "Service account for ${var.environment} application"
}

# Workload Identity Federation (no keys!)
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions"
  disabled                  = false
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Grant service account access to workload identity
resource "google_service_account_iam_member" "github_workload_identity" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Conditional IAM binding
resource "google_project_iam_member" "conditional" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.app.email}"

  condition {
    title       = "Expires in 1 year"
    description = "Access expires on 2025-12-31"
    expression  = "request.time < timestamp('2025-12-31T00:00:00Z')"
  }
}
```

## Network Security

### AWS Security Groups and NACLs

```hcl
# Defense in depth with Security Groups and NACLs

# Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.environment}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "To application servers"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Application Security Group
resource "aws_security_group" "app" {
  name_prefix = "${var.environment}-app-"
  description = "Security group for application servers"
  vpc_id      = aws_vpc.main.id

  # No public ingress rules

  tags = merge(local.common_tags, {
    Name = "${var.environment}-app-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Allow traffic from ALB to app servers
resource "aws_security_group_rule" "app_from_alb" {
  type                     = "ingress"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.alb.id
  description              = "Allow traffic from ALB"
}

# Allow app servers to reach database
resource "aws_security_group_rule" "app_to_db" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.database.id
  description              = "Allow traffic to database"
}

# Database Security Group
resource "aws_security_group" "database" {
  name_prefix = "${var.environment}-db-"
  description = "Security group for RDS database"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "db_from_app" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.app.id
  description              = "Allow PostgreSQL from app servers"
}

# Network ACLs for additional layer
resource "aws_network_acl" "public" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.public[*].id

  # Allow HTTPS inbound
  ingress {
    protocol   = "tcp"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 443
    to_port    = 443
  }

  # Allow HTTP inbound
  ingress {
    protocol   = "tcp"
    rule_no    = 110
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 80
    to_port    = 80
  }

  # Allow return traffic
  ingress {
    protocol   = "tcp"
    rule_no    = 120
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }

  # Allow all outbound
  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  # Deny all other inbound
  ingress {
    protocol   = "-1"
    rule_no    = 32766
    action     = "deny"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-public-nacl"
  })
}

# Private subnet NACL
resource "aws_network_acl" "private" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.private[*].id

  # Allow from VPC
  ingress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = aws_vpc.main.cidr_block
    from_port  = 0
    to_port    = 0
  }

  # Allow return traffic
  ingress {
    protocol   = "tcp"
    rule_no    = 110
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }

  # Allow all outbound
  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-nacl"
  })
}

# VPC Flow Logs for security monitoring
resource "aws_flow_log" "main" {
  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_logs.arn
  log_destination = aws_cloudwatch_log_group.flow_logs.arn

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/flow-logs/${var.environment}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn

  tags = local.common_tags
}
```

### Azure Network Security

```hcl
# Azure Network Security Groups
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

  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

# Application Security Groups for fine-grained control
resource "azurerm_application_security_group" "web_servers" {
  name                = "asg-${local.naming_prefix}-web"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  tags = local.common_tags
}

resource "azurerm_application_security_group" "app_servers" {
  name                = "asg-${local.naming_prefix}-app"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  tags = local.common_tags
}

# NSG rule using ASGs
resource "azurerm_network_security_rule" "web_to_app" {
  name                                       = "AllowWebToApp"
  priority                                   = 100
  direction                                  = "Inbound"
  access                                     = "Allow"
  protocol                                   = "Tcp"
  source_port_range                          = "*"
  destination_port_range                     = "8080"
  source_application_security_group_ids      = [azurerm_application_security_group.web_servers.id]
  destination_application_security_group_ids = [azurerm_application_security_group.app_servers.id]
  resource_group_name                        = azurerm_resource_group.network.name
  network_security_group_name                = azurerm_network_security_group.app.name
}

# Azure Firewall for advanced security
resource "azurerm_firewall" "main" {
  name                = "fw-${local.naming_prefix}"
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name
  sku_name            = "AZFW_VNet"
  sku_tier            = "Premium" # Includes IDS/IPS, TLS inspection

  threat_intel_mode = "Alert"

  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.firewall.id
    public_ip_address_id = azurerm_public_ip.firewall.id
  }

  tags = local.common_tags
}

# Firewall Policy
resource "azurerm_firewall_policy" "main" {
  name                = "fwpol-${local.naming_prefix}"
  resource_group_name = azurerm_resource_group.network.name
  location            = azurerm_resource_group.network.location

  sku = "Premium"

  threat_intelligence_mode = "Alert"

  intrusion_detection {
    mode = "Alert"

    signature_overrides {
      id    = "2000105"
      state = "Alert"
    }
  }

  dns {
    proxy_enabled = true
  }

  tags = local.common_tags
}
```

### GCP Firewall Rules

```hcl
# GCP Firewall Rules
resource "google_compute_firewall" "deny_all_ingress" {
  name    = "fw-${local.naming_prefix}-deny-all-ingress"
  network = google_compute_network.main.name

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  priority      = 65535

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_firewall" "allow_https" {
  name    = "fw-${local.naming_prefix}-allow-https"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["https-server"]
  priority      = 1000

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_firewall" "allow_internal" {
  name    = "fw-${local.naming_prefix}-allow-internal"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [var.vpc_cidr]
  priority      = 1000
}

# Cloud Armor Security Policy
resource "google_compute_security_policy" "main" {
  name = "policy-${local.naming_prefix}"

  # Rate limiting
  rule {
    action   = "rate_based_ban"
    priority = "1000"

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"

      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }

      ban_duration_sec = 600
    }
  }

  # Block SQL injection
  rule {
    action   = "deny(403)"
    priority = "2000"

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
  }

  # Block XSS
  rule {
    action   = "deny(403)"
    priority = "3000"

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
  }

  # Geo-blocking
  rule {
    action   = "deny(403)"
    priority = "4000"

    match {
      expr {
        expression = "origin.region_code == 'CN' || origin.region_code == 'RU'"
      }
    }

    description = "Block traffic from certain countries"
  }

  # Default allow
  rule {
    action   = "allow"
    priority = "2147483647"

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
```

## Encryption

### Encryption at Rest

```hcl
# AWS KMS key for encryption
resource "aws_kms_key" "main" {
  description             = "${var.environment} main encryption key"
  deletion_window_in_days = var.environment == "production" ? 30 : 7
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.environment}-main"
  target_key_id = aws_kms_key.main.key_id
}

# KMS key policy
resource "aws_kms_key_policy" "main" {
  key_id = aws_kms_key.main.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow services to use the key"
        Effect = "Allow"
        Principal = {
          Service = [
            "s3.amazonaws.com",
            "rds.amazonaws.com",
            "logs.amazonaws.com"
          ]
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# Encrypted S3 bucket
resource "aws_s3_bucket" "encrypted" {
  bucket = "${var.environment}-encrypted-data"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "encrypted" {
  bucket = aws_s3_bucket.encrypted.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

# Encrypted RDS instance
resource "aws_db_instance" "encrypted" {
  # ... other configuration ...

  storage_encrypted = true
  kms_key_id        = aws_kms_key.main.arn

  # Encrypted backups
  backup_retention_period = 30

  # Encrypted performance insights
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.main.arn

  tags = local.common_tags
}

# Encrypted EBS volumes
resource "aws_ebs_volume" "encrypted" {
  availability_zone = var.availability_zones[0]
  size              = 100
  type              = "gp3"
  encrypted         = true
  kms_key_id        = aws_kms_key.main.arn

  tags = merge(local.common_tags, {
    Name = "${var.environment}-encrypted-volume"
  })
}

# Enforce encryption
resource "aws_s3_bucket_policy" "enforce_encryption" {
  bucket = aws_s3_bucket.encrypted.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.encrypted.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}
```

### Encryption in Transit

```hcl
# TLS for ALB
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06" # TLS 1.3 and 1.2

  certificate_arn = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

# Force HTTPS
resource "aws_lb_listener" "redirect_http_to_https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# RDS with SSL/TLS
resource "aws_db_instance" "main" {
  # ... other configuration ...

  # Require SSL
  parameter_group_name = aws_db_parameter_group.force_ssl.name
}

resource "aws_db_parameter_group" "force_ssl" {
  name   = "${var.environment}-force-ssl"
  family = "postgres15"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "ssl_min_protocol_version"
    value = "TLSv1.2"
  }
}

# CloudFront with custom SSL
resource "aws_cloudfront_distribution" "main" {
  # ... other configuration ...

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.main.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
```

## VPN and Private Endpoints

### AWS VPN and PrivateLink

```hcl
# Site-to-Site VPN
resource "aws_vpn_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-vpn-gateway"
  })
}

resource "aws_customer_gateway" "main" {
  bgp_asn    = 65000
  ip_address = var.on_premises_gateway_ip
  type       = "ipsec.1"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-customer-gateway"
  })
}

resource "aws_vpn_connection" "main" {
  vpn_gateway_id      = aws_vpn_gateway.main.id
  customer_gateway_id = aws_customer_gateway.main.id
  type                = "ipsec.1"
  static_routes_only  = false

  tunnel1_inside_cidr   = "169.254.10.0/30"
  tunnel2_inside_cidr   = "169.254.11.0/30"
  tunnel1_preshared_key = var.tunnel1_preshared_key
  tunnel2_preshared_key = var.tunnel2_preshared_key

  tags = merge(local.common_tags, {
    Name = "${var.environment}-vpn-connection"
  })
}

# VPC Endpoints for AWS services
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"

  route_table_ids = aws_route_table.private[*].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = "*"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.app_data.arn}/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = local.common_tags
}

# PrivateLink for third-party services
resource "aws_vpc_endpoint_service" "main" {
  acceptance_required        = true
  network_load_balancer_arns = [aws_lb.internal.arn]

  allowed_principals = [
    "arn:aws:iam::${var.partner_account_id}:root"
  ]

  tags = local.common_tags
}
```

## Audit Logging

### Comprehensive Logging Strategy

```hcl
# CloudTrail for API logging
resource "aws_cloudtrail" "main" {
  name                          = "${var.environment}-audit-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::${aws_s3_bucket.sensitive_data.id}/*"]
    }
  }

  insight_selector {
    insight_type = "ApiCallRateInsight"
  }

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cloudwatch.arn

  tags = local.common_tags
}

# GuardDuty for threat detection
resource "aws_guardduty_detector" "main" {
  enable = true

  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = local.common_tags
}

# Security Hub for centralized findings
resource "aws_securityhub_account" "main" {}

resource "aws_securityhub_standards_subscription" "cis" {
  standards_arn = "arn:aws:securityhub:${var.region}::standards/cis-aws-foundations-benchmark/v/1.4.0"

  depends_on = [aws_securityhub_account.main]
}

# Config for configuration compliance
resource "aws_config_configuration_recorder" "main" {
  name     = "${var.environment}-config-recorder"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported = true

    exclusion_by_resource_types {
      resource_types = [
        "AWS::EC2::Instance",
        "AWS::EC2::SecurityGroup"
      ]
    }
  }
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_logs.arn
  log_destination = aws_cloudwatch_log_group.flow_logs.arn

  max_aggregation_interval = 60

  tags = local.common_tags
}
```

## Best Practices

### Security Checklist

1. **Secrets Management**
   - Never hardcode credentials
   - Use secret managers (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager)
   - Rotate secrets regularly
   - Use short-lived credentials when possible
   - Implement secret scanning in CI/CD

2. **IAM and Access Control**
   - Implement least-privilege principle
   - Use role-based access control (RBAC)
   - Enable MFA for privileged operations
   - Regular access reviews and audits
   - Use service accounts/managed identities
   - Implement permission boundaries

3. **Network Security**
   - Default deny all traffic
   - Implement defense in depth (SGs, NACLs, Firewalls)
   - Use private subnets for backend resources
   - VPN or private connectivity for sensitive access
   - Enable VPC Flow Logs
   - Implement WAF and DDoS protection

4. **Encryption**
   - Encrypt data at rest (use KMS/CMK)
   - Encrypt data in transit (TLS 1.2+)
   - Enable encryption by default
   - Implement key rotation
   - Use separate keys per environment
   - Secure key management practices

5. **Monitoring and Logging**
   - Enable comprehensive audit logging
   - Centralize logs securely
   - Implement security monitoring and alerting
   - Regular security assessments
   - Automated compliance checking
   - Incident response procedures

6. **Compliance**
   - Implement CIS benchmarks
   - Regular vulnerability scanning
   - Automated compliance checks
   - Documentation and evidence collection
   - Regular security training
   - Third-party security audits

7. **Resource Protection**
   - Enable deletion protection
   - Implement resource tagging
   - Use resource locks where available
   - Backup and disaster recovery plans
   - Immutable infrastructure patterns
   - Version control for all infrastructure code

8. **Code Security**
   - Scan Terraform code with tfsec, checkov
   - Implement code review processes
   - Use pre-commit hooks
   - Automated security testing in CI/CD
   - Keep providers and modules updated
   - Follow Terraform security best practices
