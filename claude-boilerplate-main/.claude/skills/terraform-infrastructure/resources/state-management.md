# Terraform State Management Best Practices

## Understanding Terraform State

### State File Structure

```hcl
# terraform.tfstate structure (simplified)
{
  "version": 4,
  "terraform_version": "1.6.0",
  "serial": 42,
  "lineage": "d3b07384-d9a3-4c8c-a7e2-8f9d0e1234ab",
  "outputs": {
    "vpc_id": {
      "value": "vpc-1234567890abcdef0",
      "type": "string"
    }
  },
  "resources": [
    {
      "mode": "managed",
      "type": "aws_vpc",
      "name": "main",
      "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
      "instances": [
        {
          "schema_version": 1,
          "attributes": {
            "id": "vpc-1234567890abcdef0",
            "cidr_block": "10.0.0.0/16",
            "enable_dns_hostnames": true
          }
        }
      ]
    }
  ]
}
```

### Local State (Development Only)

```hcl
# backend.tf - Local backend (not recommended for teams)
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}

# .gitignore - Never commit state files
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
```

## Remote State Backends

### AWS S3 Backend with DynamoDB Locking

```hcl
# backend.tf - Production-ready S3 backend
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "production/vpc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    dynamodb_table = "terraform-state-lock"

    # Workspace prefix for multi-environment
    workspace_key_prefix = "workspaces"
  }
}

# Create S3 bucket for state storage
resource "aws_s3_bucket" "terraform_state" {
  bucket = "company-terraform-state"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "Terraform State"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable logging
resource "aws_s3_bucket_logging" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "terraform-state-access/"
}

# Lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_state_lock" {
  name           = "terraform-state-lock"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }

  tags = {
    Name        = "Terraform State Lock"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# KMS key for encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "Terraform State Encryption"
  }
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# IAM policy for Terraform
data "aws_iam_policy_document" "terraform_backend" {
  statement {
    sid    = "AllowS3StateAccess"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning"
    ]

    resources = [aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid    = "AllowS3StateObjects"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = ["${aws_s3_bucket.terraform_state.arn}/*"]
  }

  statement {
    sid    = "AllowDynamoDBLocking"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem"
    ]

    resources = [aws_dynamodb_table.terraform_state_lock.arn]
  }

  statement {
    sid    = "AllowKMSEncryption"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKey"
    ]

    resources = [aws_kms_key.terraform_state.arn]
  }
}

resource "aws_iam_policy" "terraform_backend" {
  name        = "TerraformBackendAccess"
  description = "IAM policy for Terraform backend access"
  policy      = data.aws_iam_policy_document.terraform_backend.json
}
```

### Azure Storage Backend

```hcl
# backend.tf - Azure Storage backend
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "companytfstate"
    container_name       = "tfstate"
    key                  = "production.terraform.tfstate"

    # Use service principal or managed identity
    use_azuread_auth = true
  }
}

# Create Azure Storage for state
resource "azurerm_resource_group" "terraform_state" {
  name     = "terraform-state-rg"
  location = "East US"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account" "terraform_state" {
  name                     = "companytfstate"
  resource_group_name      = azurerm_resource_group.terraform_state.name
  location                 = azurerm_resource_group.terraform_state.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"

  enable_https_traffic_only       = true
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 90
    }

    container_delete_retention_policy {
      days = 90
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "terraform_state" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.terraform_state.name
  container_access_type = "private"
}

# Enable soft delete
resource "azurerm_storage_account_blob_inventory_policy" "terraform_state" {
  storage_account_id = azurerm_storage_account.terraform_state.id

  rules {
    name = "inventory-rule"
    storage_container_name = azurerm_storage_container.terraform_state.name
    format = "Csv"
    schedule = "Daily"
    scope = "Container"
    schema_fields = [
      "Name",
      "Last-Modified",
      "BlobType",
      "AccessTier",
      "IsCurrentVersion",
    ]
  }
}
```

### Google Cloud Storage Backend

```hcl
# backend.tf - GCS backend
terraform {
  backend "gcs" {
    bucket  = "company-terraform-state"
    prefix  = "production/vpc"

    # Use service account or application default credentials
  }
}

# Create GCS bucket for state
resource "google_storage_bucket" "terraform_state" {
  name          = "company-terraform-state"
  location      = "US"
  storage_class = "STANDARD"

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = google_kms_crypto_key.terraform_state.id
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Enable object versioning
resource "google_storage_bucket_object" "state_versioning" {
  name   = ".terraform_state_versioning"
  bucket = google_storage_bucket.terraform_state.name
  content = jsonencode({
    enabled = true
  })
}

# KMS key for encryption
resource "google_kms_key_ring" "terraform_state" {
  name     = "terraform-state"
  location = "us"
}

resource "google_kms_crypto_key" "terraform_state" {
  name     = "terraform-state-key"
  key_ring = google_kms_key_ring.terraform_state.id

  lifecycle {
    prevent_destroy = true
  }

  version_template {
    algorithm = "GOOGLE_SYMMETRIC_ENCRYPTION"
  }

  rotation_period = "7776000s" # 90 days
}

# IAM binding for Terraform service account
resource "google_storage_bucket_iam_member" "terraform_state_admin" {
  bucket = google_storage_bucket.terraform_state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:terraform@project-id.iam.gserviceaccount.com"
}
```

### Terraform Cloud Backend

```hcl
# backend.tf - Terraform Cloud
terraform {
  cloud {
    organization = "company-name"

    workspaces {
      name = "production-infrastructure"
    }
  }
}

# Or with workspace tags
terraform {
  cloud {
    organization = "company-name"

    workspaces {
      tags = ["production", "networking"]
    }
  }
}

# Backend configuration in separate file
# config.remote.tfbackend
organization = "company-name"
workspaces {
  name = "production-infrastructure"
}

# Initialize with:
# terraform init -backend-config=config.remote.tfbackend
```

## State Locking

### Understanding State Locks

```hcl
# State lock prevents concurrent modifications
# Lock information stored in DynamoDB (AWS) or backend-specific mechanism

# Manual lock operations (rarely needed)
# Lock state manually
terraform force-unlock LOCK_ID

# Check for existing locks
terraform state list

# Lock timeout configuration
terraform {
  backend "s3" {
    # ... other configuration ...

    # Custom lock timeout (default: 0 = no timeout)
    max_retries = 3
  }
}

# Implement custom locking strategy
resource "null_resource" "state_lock_check" {
  provisioner "local-exec" {
    command = <<-EOT
      if terraform state list > /dev/null 2>&1; then
        echo "State is accessible"
      else
        echo "State is locked or inaccessible"
        exit 1
      fi
    EOT
  }
}
```

### Handling Lock Issues

```bash
# View lock information
aws dynamodb get-item \
  --table-name terraform-state-lock \
  --key '{"LockID":{"S":"company-terraform-state/production/vpc/terraform.tfstate-md5"}}'

# Force unlock (use with caution!)
terraform force-unlock <LOCK_ID>

# Prevention: Always use proper workflow
terraform plan    # Acquires lock
terraform apply   # Maintains lock
# Ctrl+C properly releases lock

# If interrupted, check for stale locks
aws dynamodb scan \
  --table-name terraform-state-lock \
  --filter-expression "attribute_exists(LockID)"
```

## Workspaces for Environments

### Basic Workspace Usage

```hcl
# Create and manage workspaces
terraform workspace new development
terraform workspace new staging
terraform workspace new production

# List workspaces
terraform workspace list

# Switch workspace
terraform workspace select production

# Show current workspace
terraform workspace show

# Delete workspace (must be empty)
terraform workspace delete development

# Use workspace in configuration
locals {
  environment = terraform.workspace

  config = {
    development = {
      instance_type = "t3.micro"
      instance_count = 1
    }
    staging = {
      instance_type = "t3.small"
      instance_count = 2
    }
    production = {
      instance_type = "t3.large"
      instance_count = 5
    }
  }

  selected_config = local.config[terraform.workspace]
}

resource "aws_instance" "app" {
  count         = local.selected_config.instance_count
  instance_type = local.selected_config.instance_type

  tags = {
    Name        = "${terraform.workspace}-app-${count.index + 1}"
    Environment = terraform.workspace
  }
}

# Workspace-specific variables
variable "instance_type" {
  type = map(string)
  default = {
    development = "t3.micro"
    staging     = "t3.small"
    production  = "t3.large"
  }
}

resource "aws_instance" "web" {
  instance_type = var.instance_type[terraform.workspace]

  tags = {
    Environment = terraform.workspace
  }
}
```

### Advanced Workspace Patterns

```hcl
# Workspace-aware backend configuration
terraform {
  backend "s3" {
    bucket               = "company-terraform-state"
    key                  = "infrastructure.tfstate"
    region               = "us-east-1"
    workspace_key_prefix = "environments"
    # State stored at: environments/${workspace}/infrastructure.tfstate
  }
}

# Prevent certain workspaces
resource "null_resource" "workspace_validation" {
  count = contains(["development", "staging", "production"], terraform.workspace) ? 0 : 1

  provisioner "local-exec" {
    command = "echo 'Invalid workspace: ${terraform.workspace}. Must be development, staging, or production.' && exit 1"
  }
}

# Production safety checks
locals {
  is_production = terraform.workspace == "production"
}

resource "aws_db_instance" "main" {
  # ... configuration ...

  deletion_protection = local.is_production
  backup_retention_period = local.is_production ? 30 : 7
  multi_az = local.is_production

  lifecycle {
    prevent_destroy = local.is_production
  }
}

# Workspace-specific provider configuration
provider "aws" {
  region = lookup(
    {
      development = "us-east-1"
      staging     = "us-east-1"
      production  = "us-west-2"
    },
    terraform.workspace,
    "us-east-1"
  )

  default_tags {
    tags = {
      Environment = terraform.workspace
      ManagedBy   = "Terraform"
      Workspace   = terraform.workspace
    }
  }
}
```

## State Manipulation

### Import Existing Resources

```bash
# Import single resource
terraform import aws_instance.example i-1234567890abcdef0

# Import with complex identifiers
terraform import aws_route_table_association.example subnet-123456/rtb-789012

# Import module resource
terraform import module.vpc.aws_vpc.main vpc-1234567890abcdef0

# Bulk import script
#!/bin/bash
# import-resources.sh

resources=(
  "aws_vpc.main:vpc-1234567890abcdef0"
  "aws_subnet.public[0]:subnet-aaa111"
  "aws_subnet.public[1]:subnet-bbb222"
  "aws_subnet.private[0]:subnet-ccc333"
)

for resource in "${resources[@]}"; do
  IFS=':' read -r tf_address aws_id <<< "$resource"
  echo "Importing $tf_address..."
  terraform import "$tf_address" "$aws_id"
done

# Generate configuration from imported state
terraform show -json | jq '.values.root_module.resources[] |
  select(.address == "aws_vpc.main") |
  .values' > imported_vpc.json

# Using terraformer for bulk import
terraformer import aws --resources=vpc,subnet,sg --regions=us-east-1 --profile=production
```

### Move Resources in State

```bash
# Move resource within same state
terraform state mv aws_instance.example aws_instance.web_server

# Move resource to module
terraform state mv aws_instance.example module.web.aws_instance.main

# Move resource from module
terraform state mv module.web.aws_instance.main aws_instance.main

# Move count-indexed resources
terraform state mv 'aws_instance.web[0]' 'aws_instance.web_server[0]'

# Move entire module
terraform state mv module.old_name module.new_name

# Move resource to different state file
terraform state mv -state-out=../other-project/terraform.tfstate \
  aws_instance.example aws_instance.shared_resource

# Refactoring with moved blocks (Terraform 1.1+)
moved {
  from = aws_instance.example
  to   = aws_instance.web_server
}

moved {
  from = aws_instance.web
  to   = module.web.aws_instance.main
}

# Complex refactoring
moved {
  from = aws_instance.app[0]
  to   = module.app_cluster.aws_instance.app[0]
}

moved {
  from = aws_instance.app[1]
  to   = module.app_cluster.aws_instance.app[1]
}
```

### Remove Resources from State

```bash
# Remove single resource
terraform state rm aws_instance.example

# Remove all instances of a resource
terraform state rm 'aws_instance.web[*]'

# Remove module
terraform state rm module.deprecated

# Remove with pattern matching
terraform state list | grep 'old_prefix' | xargs -n1 terraform state rm

# Script to clean up old resources
#!/bin/bash
# cleanup-state.sh

# Resources to remove
OLD_RESOURCES=(
  "aws_instance.deprecated"
  "aws_security_group.old_sg"
  "module.legacy_network"
)

for resource in "${OLD_RESOURCES[@]}"; do
  echo "Removing $resource from state..."
  terraform state rm "$resource"
done

# Pull and push state (for manual editing - use with caution!)
terraform state pull > terraform.tfstate.backup
# Edit state file
terraform state push terraform.tfstate.backup
```

### Replace Resources

```bash
# Taint resource for replacement (deprecated, use replace)
terraform taint aws_instance.example

# Replace resource (Terraform 0.15.2+)
terraform apply -replace="aws_instance.example"

# Replace multiple resources
terraform apply \
  -replace="aws_instance.web[0]" \
  -replace="aws_instance.web[1]"

# Replace resources in module
terraform apply -replace="module.app.aws_instance.main"

# Plan replacement
terraform plan -replace="aws_instance.example"
```

## Sensitive Data in State

### Protecting Sensitive Information

```hcl
# Mark outputs as sensitive
output "database_password" {
  value     = random_password.db_password.result
  sensitive = true
}

output "api_key" {
  value     = var.api_key
  sensitive = true
}

# Sensitive variables
variable "db_password" {
  type      = string
  sensitive = true
}

# Encrypt state at rest
terraform {
  backend "s3" {
    bucket     = "terraform-state"
    key        = "prod/terraform.tfstate"
    region     = "us-east-1"
    encrypt    = true
    kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }
}

# Use secrets management
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "production/database/password"
}

resource "aws_db_instance" "main" {
  # ... other configuration ...
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# Avoid storing credentials directly
# BAD - password in state
resource "aws_db_instance" "bad" {
  password = "hardcoded-password" # Never do this!
}

# GOOD - password from secret manager
resource "aws_db_instance" "good" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# BETTER - manage password rotation outside Terraform
resource "aws_db_instance" "better" {
  manage_master_user_password = true # AWS managed
}

# State encryption validation
data "external" "state_encryption_check" {
  program = ["bash", "-c", <<-EOT
    if aws s3api get-bucket-encryption --bucket terraform-state > /dev/null 2>&1; then
      echo '{"encrypted": "true"}'
    else
      echo '{"encrypted": "false"}'
      exit 1
    fi
  EOT
  ]
}

# Restrict state file access
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyInsecureConnections"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
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

### Scanning for Sensitive Data

```bash
# Check state for potential secrets
terraform state pull | jq -r '
  .resources[] |
  select(.type == "aws_db_instance") |
  "Database password found in: \(.module).\(.type).\(.name)"
'

# Scan state file for patterns
grep -iE "(password|secret|key|token)" terraform.tfstate

# Use automated scanning tools
# Install tfsec
brew install tfsec

# Scan for issues
tfsec .

# Use checkov for state analysis
pip install checkov
checkov --framework terraform --directory .

# Custom scanning script
#!/bin/bash
# scan-state.sh

SENSITIVE_PATTERNS=(
  "password"
  "secret"
  "api_key"
  "token"
  "private_key"
)

terraform state pull > state.json

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if grep -qi "$pattern" state.json; then
    echo "WARNING: Found potential sensitive data matching '$pattern'"
    grep -i "$pattern" state.json | head -n 3
  fi
done

rm state.json
```

## Disaster Recovery

### State Backup Strategies

```hcl
# Automated state backup script
#!/bin/bash
# backup-state.sh

BACKUP_BUCKET="terraform-state-backups"
STATE_BUCKET="terraform-state"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Pull current state
terraform state pull > "terraform.tfstate.$TIMESTAMP"

# Upload to backup bucket
aws s3 cp "terraform.tfstate.$TIMESTAMP" \
  "s3://$BACKUP_BUCKET/$TIMESTAMP/terraform.tfstate" \
  --server-side-encryption aws:kms

# Keep local backup
mkdir -p backups
mv "terraform.tfstate.$TIMESTAMP" backups/

# Cleanup old backups (keep last 30 days)
find backups/ -name "terraform.tfstate.*" -mtime +30 -delete

# Verify backup
aws s3 ls "s3://$BACKUP_BUCKET/$TIMESTAMP/terraform.tfstate" || {
  echo "Backup verification failed!"
  exit 1
}

echo "State backed up successfully: $TIMESTAMP"

# Automated backup with S3 versioning (already configured above)
# Retrieve specific version
aws s3api get-object \
  --bucket terraform-state \
  --key production/terraform.tfstate \
  --version-id <VERSION_ID> \
  terraform.tfstate.restored
```

### State Recovery Procedures

```bash
# Restore from S3 version
aws s3api list-object-versions \
  --bucket terraform-state \
  --prefix production/terraform.tfstate

# Download specific version
aws s3api get-object \
  --bucket terraform-state \
  --key production/terraform.tfstate \
  --version-id <VERSION_ID> \
  terraform.tfstate.restored

# Verify restored state
terraform state pull > current.tfstate
diff terraform.tfstate.restored current.tfstate

# Push restored state (CAREFUL!)
terraform state push terraform.tfstate.restored

# Recovery script
#!/bin/bash
# recover-state.sh

BUCKET="terraform-state"
KEY="production/terraform.tfstate"
RECOVERY_DIR="recovery-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$RECOVERY_DIR"
cd "$RECOVERY_DIR"

# List available versions
echo "Available versions:"
aws s3api list-object-versions \
  --bucket "$BUCKET" \
  --prefix "$KEY" \
  --query 'Versions[*].[VersionId,LastModified]' \
  --output table

read -p "Enter version ID to restore: " VERSION_ID

# Download version
aws s3api get-object \
  --bucket "$BUCKET" \
  --key "$KEY" \
  --version-id "$VERSION_ID" \
  "terraform.tfstate.v$VERSION_ID"

echo "State version downloaded to: $RECOVERY_DIR/terraform.tfstate.v$VERSION_ID"
echo "Review the file before pushing with: terraform state push"
```

### State Validation

```bash
# Validate state consistency
terraform plan -detailed-exitcode

# Exit codes:
# 0 = No changes
# 1 = Error
# 2 = Changes present

# Validate state file integrity
terraform state list > /dev/null || {
  echo "State file is corrupted!"
  exit 1
}

# Compare state with actual infrastructure
terraform refresh
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan | jq '.resource_changes'

# Automated validation script
#!/bin/bash
# validate-state.sh

echo "Validating Terraform state..."

# Check state accessibility
if ! terraform state list > /dev/null 2>&1; then
  echo "ERROR: Cannot access state file"
  exit 1
fi

# Check for drift
terraform plan -detailed-exitcode -out=drift.tfplan > /dev/null 2>&1
EXITCODE=$?

if [ $EXITCODE -eq 0 ]; then
  echo "✓ No drift detected"
elif [ $EXITCODE -eq 2 ]; then
  echo "⚠ Drift detected - review changes:"
  terraform show drift.tfplan
  exit 1
else
  echo "✗ Error during validation"
  exit 1
fi

rm -f drift.tfplan
```

## Migration Strategies

### Migrating Between Backends

```bash
# Migration from local to S3
# Step 1: Configure new backend
cat > backend.tf <<EOF
terraform {
  backend "s3" {
    bucket = "terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}
EOF

# Step 2: Initialize migration
terraform init -migrate-state

# Step 3: Verify migration
terraform state list

# Migrating between S3 buckets
# old-backend.tf
terraform {
  backend "s3" {
    bucket = "old-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"
  }
}

# Pull current state
terraform state pull > terraform.tfstate.backup

# Update to new backend
# new-backend.tf
terraform {
  backend "s3" {
    bucket = "new-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"
  }
}

# Migrate
terraform init -migrate-state -force-copy

# Verify
terraform state list

# Migrating to Terraform Cloud
terraform {
  cloud {
    organization = "company-name"
    workspaces {
      name = "production"
    }
  }
}

# Login and migrate
terraform login
terraform init -migrate-state
```

### Splitting State Files

```bash
# Split monolithic state into separate projects

# Original structure:
# terraform.tfstate (contains VPC, compute, database)

# Target structure:
# network/terraform.tfstate (VPC, subnets)
# compute/terraform.tfstate (EC2, ASG)
# database/terraform.tfstate (RDS)

# Step 1: Backup everything
terraform state pull > original.tfstate.backup

# Step 2: Create new directories
mkdir -p network compute database

# Step 3: Copy and modify configurations
cp *.tf network/
cp *.tf compute/
cp *.tf database/

# Step 4: Remove unwanted resources from each config
# Edit network/*.tf to only include network resources
# Edit compute/*.tf to only include compute resources
# Edit database/*.tf to only include database resources

# Step 5: Import resources to new states
cd network
terraform init
terraform import aws_vpc.main vpc-123456
# ... import other network resources

cd ../compute
terraform init
# Import compute resources...

cd ../database
terraform init
# Import database resources...

# Step 6: Verify and remove from original
cd ..
terraform state rm aws_vpc.main
# ... remove migrated resources

# Automated splitting script
#!/bin/bash
# split-state.sh

ORIGINAL_STATE="terraform.tfstate"
RESOURCES_FILE="resources.txt"

# List all resources
terraform state list > "$RESOURCES_FILE"

# Group by resource type prefix
cat "$RESOURCES_FILE" | grep "^aws_vpc\|^aws_subnet" > network_resources.txt
cat "$RESOURCES_FILE" | grep "^aws_instance\|^aws_autoscaling" > compute_resources.txt
cat "$RESOURCES_FILE" | grep "^aws_db_instance\|^aws_rds" > database_resources.txt

# Move resources
while read resource; do
  terraform state mv -state-out=network/terraform.tfstate "$resource"
done < network_resources.txt
```

## Team Collaboration

### State Access Control

```hcl
# IAM policies for different team roles

# Developers - read-only state access
data "aws_iam_policy_document" "developer_state_access" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem"
    ]
    resources = [
      aws_dynamodb_table.terraform_state_lock.arn
    ]
  }
}

# DevOps - full state access
data "aws_iam_policy_document" "devops_state_access" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem"
    ]
    resources = [
      aws_dynamodb_table.terraform_state_lock.arn
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey"
    ]
    resources = [
      aws_kms_key.terraform_state.arn
    ]
  }
}

# CI/CD pipeline - automated access
data "aws_iam_policy_document" "cicd_state_access" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/production/*",
      "${aws_s3_bucket.terraform_state.arn}/staging/*"
    ]
  }

  statement {
    effect = "Deny"
    actions = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.terraform_state.arn}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem"
    ]
    resources = [
      aws_dynamodb_table.terraform_state_lock.arn
    ]
  }
}
```

### Workflow Best Practices

```bash
# .github/workflows/terraform.yml
name: Terraform

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  TF_VERSION: 1.6.0
  AWS_REGION: us-east-1

jobs:
  terraform:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Terraform Format
        run: terraform fmt -check -recursive

      - name: Terraform Init
        run: terraform init

      - name: Terraform Validate
        run: terraform validate

      - name: Terraform Plan
        id: plan
        run: |
          terraform plan -no-color -out=tfplan
          terraform show -no-color tfplan > plan.txt

      - name: Comment PR with Plan
        uses: actions/github-script@v6
        if: github.event_name == 'pull_request'
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('plan.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `#### Terraform Plan\n\`\`\`\n${plan}\n\`\`\``
            });

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve tfplan
```

## Best Practices

### State Management Principles

1. **Always use remote state for teams**
2. **Enable state locking to prevent conflicts**
3. **Encrypt state at rest and in transit**
4. **Enable versioning for disaster recovery**
5. **Implement least-privilege access control**
6. **Regular state backups beyond versioning**
7. **Never commit state files to version control**
8. **Use workspaces for environment separation**
9. **Document state structure and organization**
10. **Regular state validation and drift detection**

### Security Best Practices

- Encrypt state files with KMS/CMK
- Restrict state file access with IAM
- Enable audit logging for state access
- Rotate encryption keys regularly
- Use service accounts for automation
- Implement MFA for production state access
- Regular security audits of state configuration
- Monitor for unauthorized state access

### Operational Best Practices

- Automated state backups before major changes
- Use terraform plan before every apply
- Document state migration procedures
- Regular state file maintenance
- Monitor state file size and optimize
- Implement state access patterns and conventions
- Use consistent naming and organization
- Regular training on state management

### Disaster Recovery Planning

- Multiple backup retention strategies
- Documented recovery procedures
- Regular recovery drills
- Cross-region state replication
- Automated backup verification
- Clear roles and responsibilities
- Communication plan for incidents
- Post-incident review process
