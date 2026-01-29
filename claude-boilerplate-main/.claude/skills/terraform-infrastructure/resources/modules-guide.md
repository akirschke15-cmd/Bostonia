# Terraform Modules Guide

## Module Structure and Organization

### Standard Module Structure

```
modules/
├── vpc/
│   ├── main.tf          # Main resource definitions
│   ├── variables.tf     # Input variable declarations
│   ├── outputs.tf       # Output value definitions
│   ├── versions.tf      # Provider version constraints
│   ├── README.md        # Module documentation
│   └── examples/        # Usage examples
│       └── basic/
│           ├── main.tf
│           └── variables.tf
└── compute/
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    ├── versions.tf
    ├── locals.tf        # Local value definitions
    ├── data.tf          # Data source definitions
    └── README.md
```

### Basic Module Example

```hcl
# modules/vpc/main.tf
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support

  tags = merge(
    var.tags,
    {
      Name = var.vpc_name
    }
  )
}

resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.tags,
    {
      Name = "${var.vpc_name}-public-${count.index + 1}"
      Type = "Public"
    }
  )
}

resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    var.tags,
    {
      Name = "${var.vpc_name}-private-${count.index + 1}"
      Type = "Private"
    }
  )
}

resource "aws_internet_gateway" "main" {
  count = var.create_internet_gateway ? 1 : 0

  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.vpc_name}-igw"
    }
  )
}

# modules/vpc/variables.tf
variable "vpc_name" {
  description = "Name of the VPC"
  type        = string
  validation {
    condition     = length(var.vpc_name) > 0 && length(var.vpc_name) <= 255
    error_message = "VPC name must be between 1 and 255 characters."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets"
  type        = list(string)
  default     = []
  validation {
    condition = alltrue([
      for cidr in var.public_subnet_cidrs : can(cidrhost(cidr, 0))
    ])
    error_message = "All elements must be valid CIDR blocks."
  }
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets"
  type        = list(string)
  default     = []
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability."
  }
}

variable "enable_dns_hostnames" {
  description = "Enable DNS hostnames in the VPC"
  type        = bool
  default     = true
}

variable "enable_dns_support" {
  description = "Enable DNS support in the VPC"
  type        = bool
  default     = true
}

variable "create_internet_gateway" {
  description = "Whether to create an internet gateway"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# modules/vpc/outputs.tf
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  description = "ID of the internet gateway"
  value       = var.create_internet_gateway ? aws_internet_gateway.main[0].id : null
}

# modules/vpc/versions.tf
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

## Input Variables with Validation

### Advanced Variable Validation Examples

```hcl
# String validation
variable "environment" {
  description = "Environment name"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"

  validation {
    condition     = can(regex("^t3\\.(micro|small|medium|large|xlarge|2xlarge)$", var.instance_type))
    error_message = "Instance type must be a valid t3 instance type."
  }
}

# Number validation
variable "port" {
  description = "Port number for the application"
  type        = number

  validation {
    condition     = var.port > 0 && var.port < 65536
    error_message = "Port must be between 1 and 65535."
  }
}

variable "min_capacity" {
  description = "Minimum number of instances"
  type        = number
  default     = 1

  validation {
    condition     = var.min_capacity >= 1 && var.min_capacity <= 100
    error_message = "Min capacity must be between 1 and 100."
  }
}

variable "max_capacity" {
  description = "Maximum number of instances"
  type        = number
  default     = 10

  validation {
    condition     = var.max_capacity >= var.min_capacity
    error_message = "Max capacity must be greater than or equal to min capacity."
  }
}

# List validation
variable "allowed_cidr_blocks" {
  description = "List of allowed CIDR blocks"
  type        = list(string)

  validation {
    condition = alltrue([
      for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))
    ])
    error_message = "All elements must be valid CIDR blocks."
  }

  validation {
    condition     = length(var.allowed_cidr_blocks) > 0
    error_message = "At least one CIDR block must be specified."
  }
}

# Map validation
variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for k, v in var.tags : length(k) <= 128 && length(v) <= 256
    ])
    error_message = "Tag keys must be <= 128 characters and values <= 256 characters."
  }
}

# Object validation
variable "database_config" {
  description = "Database configuration"
  type = object({
    engine         = string
    engine_version = string
    instance_class = string
    allocated_storage = number
    backup_retention_period = number
  })

  validation {
    condition     = contains(["postgres", "mysql", "mariadb"], var.database_config.engine)
    error_message = "Database engine must be postgres, mysql, or mariadb."
  }

  validation {
    condition     = var.database_config.allocated_storage >= 20
    error_message = "Allocated storage must be at least 20 GB."
  }

  validation {
    condition     = var.database_config.backup_retention_period >= 0 && var.database_config.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

# Complex validation with custom error messages
variable "scaling_policy" {
  description = "Auto-scaling policy configuration"
  type = object({
    target_value     = number
    scale_in_cooldown  = number
    scale_out_cooldown = number
  })

  validation {
    condition     = var.scaling_policy.target_value > 0 && var.scaling_policy.target_value <= 100
    error_message = "Target value must be between 0 and 100."
  }

  validation {
    condition     = var.scaling_policy.scale_in_cooldown >= 60
    error_message = "Scale-in cooldown must be at least 60 seconds."
  }

  validation {
    condition     = var.scaling_policy.scale_out_cooldown >= 60
    error_message = "Scale-out cooldown must be at least 60 seconds."
  }
}

# Nullable variables (Terraform 1.1+)
variable "backup_window" {
  description = "Backup window for database (null to disable backups)"
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.backup_window == null || can(regex("^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$", var.backup_window))
    error_message = "Backup window must be in format HH:MM-HH:MM or null."
  }
}

# Sensitive variables
variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.database_password) >= 16
    error_message = "Password must be at least 16 characters long."
  }

  validation {
    condition     = can(regex("[A-Z]", var.database_password)) && can(regex("[a-z]", var.database_password)) && can(regex("[0-9]", var.database_password))
    error_message = "Password must contain uppercase, lowercase, and numeric characters."
  }
}
```

## Output Values

### Comprehensive Output Examples

```hcl
# modules/app-cluster/outputs.tf

# Simple outputs
output "cluster_id" {
  description = "ID of the application cluster"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "Name of the application cluster"
  value       = aws_ecs_cluster.main.name
}

# Sensitive outputs
output "database_password" {
  description = "Generated database password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "api_key" {
  description = "API key for external integrations"
  value       = random_uuid.api_key.result
  sensitive   = true
}

# List outputs
output "subnet_ids" {
  description = "List of subnet IDs"
  value       = aws_subnet.private[*].id
}

output "security_group_ids" {
  description = "List of security group IDs"
  value = [
    aws_security_group.app.id,
    aws_security_group.database.id,
  ]
}

# Map outputs
output "endpoint_urls" {
  description = "Map of service endpoints"
  value = {
    api      = "https://${aws_lb.app.dns_name}/api"
    admin    = "https://${aws_lb.app.dns_name}/admin"
    health   = "https://${aws_lb.app.dns_name}/health"
  }
}

output "connection_strings" {
  description = "Database connection strings by environment"
  value = {
    primary = "postgresql://${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
    replica = var.create_replica ? "postgresql://${aws_db_instance.replica[0].endpoint}/${aws_db_instance.replica[0].db_name}" : null
  }
  sensitive = true
}

# Object outputs
output "load_balancer" {
  description = "Load balancer details"
  value = {
    id              = aws_lb.app.id
    arn             = aws_lb.app.arn
    dns_name        = aws_lb.app.dns_name
    zone_id         = aws_lb.app.zone_id
    security_groups = aws_lb.app.security_groups
  }
}

output "database_instance" {
  description = "Database instance details"
  value = {
    id                = aws_db_instance.main.id
    arn               = aws_db_instance.main.arn
    endpoint          = aws_db_instance.main.endpoint
    port              = aws_db_instance.main.port
    engine            = aws_db_instance.main.engine
    engine_version    = aws_db_instance.main.engine_version
    instance_class    = aws_db_instance.main.instance_class
    allocated_storage = aws_db_instance.main.allocated_storage
  }
  sensitive = true
}

# Conditional outputs
output "nat_gateway_ips" {
  description = "NAT Gateway elastic IPs (if created)"
  value       = var.enable_nat_gateway ? aws_eip.nat[*].public_ip : []
}

output "cdn_distribution_id" {
  description = "CloudFront distribution ID (if CDN is enabled)"
  value       = var.enable_cdn ? aws_cloudfront_distribution.main[0].id : null
}

# Computed outputs
output "full_endpoint_url" {
  description = "Full endpoint URL with protocol and port"
  value       = "https://${aws_lb.app.dns_name}:${var.listener_port}"
}

output "resource_count" {
  description = "Total number of resources created"
  value = (
    length(aws_subnet.private) +
    length(aws_subnet.public) +
    1 # VPC
  )
}

# Depends_on for outputs (ensures creation order)
output "cluster_endpoint" {
  description = "ECS cluster endpoint"
  value       = aws_ecs_cluster.main.id
  depends_on  = [
    aws_iam_role.ecs_task_execution,
    aws_ecs_cluster.main,
  ]
}

# Output preconditions (Terraform 1.2+)
output "verified_endpoint" {
  description = "Verified application endpoint"
  value       = aws_lb.app.dns_name

  precondition {
    condition     = aws_lb.app.load_balancer_type == "application"
    error_message = "Load balancer must be of type application."
  }
}
```

## Local Values and Computed Attributes

### Advanced Local Value Patterns

```hcl
# modules/web-app/locals.tf

locals {
  # Simple computed values
  environment_prefix = "${var.environment}-${var.region}"
  full_name         = "${var.environment}-${var.app_name}"

  # Conditional logic
  use_nat_gateway = var.environment == "production" ? true : false
  instance_count  = var.environment == "production" ? 3 : 1
  backup_enabled  = var.environment != "development"

  # String manipulation
  name_upper = upper(var.app_name)
  name_lower = lower(var.app_name)
  name_slug  = replace(lower(var.app_name), " ", "-")

  # Map transformations
  tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      CreatedAt   = timestamp()
    }
  )

  # List transformations
  availability_zones = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  subnet_cidrs = [
    for i in range(var.subnet_count) :
    cidrsubnet(var.vpc_cidr, 8, i)
  ]

  # Complex object construction
  database_config = {
    engine              = var.db_engine
    engine_version      = var.db_engine_version
    instance_class      = var.environment == "production" ? "db.r5.large" : "db.t3.micro"
    allocated_storage   = var.environment == "production" ? 100 : 20
    multi_az           = var.environment == "production"
    backup_retention   = var.environment == "production" ? 30 : 7
    deletion_protection = var.environment == "production"
  }

  # Dynamic port mapping
  port_mappings = {
    http  = 80
    https = 443
    app   = var.app_port
    admin = var.admin_port
  }

  # Security group rules from variables
  ingress_rules = [
    for rule in var.ingress_rules : {
      from_port   = rule.port
      to_port     = rule.port
      protocol    = "tcp"
      cidr_blocks = rule.cidr_blocks
      description = rule.description
    }
  ]

  # Flattening nested structures
  all_subnet_ids = flatten([
    aws_subnet.public[*].id,
    aws_subnet.private[*].id,
    aws_subnet.database[*].id,
  ])

  # Creating lookup maps
  subnet_map = {
    for idx, subnet in aws_subnet.private :
    subnet.availability_zone => subnet.id
  }

  # Conditional resource creation flags
  create_bastion     = var.enable_bastion && var.environment != "development"
  create_monitoring  = var.enable_monitoring || var.environment == "production"
  create_alarms     = var.environment == "production"

  # Resource naming with incrementing
  instance_names = [
    for i in range(var.instance_count) :
    "${local.full_name}-instance-${format("%03d", i + 1)}"
  ]

  # Environment-specific configurations
  config = {
    production = {
      instance_type = "m5.large"
      min_size      = 3
      max_size      = 10
      enable_cdn    = true
    }
    staging = {
      instance_type = "t3.medium"
      min_size      = 2
      max_size      = 5
      enable_cdn    = true
    }
    development = {
      instance_type = "t3.micro"
      min_size      = 1
      max_size      = 2
      enable_cdn    = false
    }
  }

  selected_config = local.config[var.environment]

  # Calculating CIDR blocks
  public_subnet_cidrs = [
    for i in range(var.public_subnet_count) :
    cidrsubnet(var.vpc_cidr, 4, i)
  ]

  private_subnet_cidrs = [
    for i in range(var.private_subnet_count) :
    cidrsubnet(var.vpc_cidr, 4, i + var.public_subnet_count)
  ]

  # Creating resource dependencies map
  resource_dependencies = {
    vpc_id              = aws_vpc.main.id
    subnet_ids          = aws_subnet.private[*].id
    security_group_ids  = [aws_security_group.app.id]
    iam_role_arn       = aws_iam_role.app.arn
  }

  # User data template
  user_data = base64encode(templatefile("${path.module}/templates/user-data.sh", {
    environment       = var.environment
    app_name         = var.app_name
    database_endpoint = aws_db_instance.main.endpoint
    region           = var.region
  }))

  # JSON policy documents
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}
```

## Module Versioning

### Version Constraints and Management

```hcl
# Using modules with version constraints

# Exact version
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"

  # ... configuration
}

# Pessimistic constraint (recommended)
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"  # Allows 6.x, but not 7.0

  # ... configuration
}

# Version range
module "s3" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = ">= 3.0, < 4.0"

  # ... configuration
}

# Local module with Git versioning
module "custom_app" {
  source = "git::https://github.com/company/terraform-modules.git//modules/app?ref=v1.2.3"

  # ... configuration
}

# Private registry
module "enterprise_module" {
  source  = "app.terraform.io/company/module/aws"
  version = "~> 2.0"

  # ... configuration
}

# modules/app/versions.tf - Module version constraints
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Experimental features
  experiments = []
}

# Version compatibility checking
locals {
  # Check if using supported Terraform version
  is_supported_version = can(regex("^1\\.[6-9]", var.terraform_version))
}

resource "null_resource" "version_check" {
  count = local.is_supported_version ? 0 : 1

  provisioner "local-exec" {
    command = "echo 'ERROR: Terraform version must be >= 1.6.0' && exit 1"
  }
}
```

## Module Composition

### Composing Modules Together

```hcl
# Root module composition example

# Network module
module "network" {
  source = "./modules/network"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones

  tags = local.common_tags
}

# Security module
module "security" {
  source = "./modules/security"

  environment = var.environment
  vpc_id      = module.network.vpc_id

  allowed_cidr_blocks = var.allowed_cidr_blocks

  tags = local.common_tags
}

# Database module - depends on network
module "database" {
  source = "./modules/database"

  environment = var.environment
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.database_subnet_ids

  security_group_ids = [module.security.database_sg_id]

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class

  backup_retention_period = var.environment == "production" ? 30 : 7
  multi_az               = var.environment == "production"

  tags = local.common_tags

  depends_on = [module.network]
}

# Application module - depends on network, security, and database
module "application" {
  source = "./modules/application"

  environment = var.environment
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids

  security_group_ids = [module.security.app_sg_id]

  database_endpoint = module.database.endpoint
  database_name     = module.database.database_name

  instance_type = var.instance_type
  min_size      = var.min_capacity
  max_size      = var.max_capacity

  tags = local.common_tags

  depends_on = [
    module.network,
    module.database,
  ]
}

# Load balancer module
module "load_balancer" {
  source = "./modules/load-balancer"

  environment = var.environment
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.public_subnet_ids

  security_group_ids = [module.security.alb_sg_id]
  target_group_arn   = module.application.target_group_arn

  certificate_arn = var.certificate_arn
  domain_name     = var.domain_name

  tags = local.common_tags

  depends_on = [module.application]
}

# Monitoring module - observes all other modules
module "monitoring" {
  source = "./modules/monitoring"

  environment = var.environment

  # Resources to monitor
  vpc_id                 = module.network.vpc_id
  load_balancer_arn      = module.load_balancer.lb_arn
  target_group_arn       = module.application.target_group_arn
  database_instance_id   = module.database.instance_id
  autoscaling_group_name = module.application.asg_name

  # Alerting configuration
  alarm_email = var.alarm_email
  slack_webhook = var.slack_webhook

  tags = local.common_tags
}

# Outputs from composed modules
output "application_url" {
  value = "https://${module.load_balancer.dns_name}"
}

output "database_endpoint" {
  value     = module.database.endpoint
  sensitive = true
}

output "monitoring_dashboard_url" {
  value = module.monitoring.dashboard_url
}
```

### Module for_each Pattern

```hcl
# Creating multiple instances of a module

# Multiple environments in one config
module "environment" {
  source = "./modules/environment"

  for_each = {
    dev = {
      instance_type = "t3.micro"
      min_size      = 1
      max_size      = 2
    }
    staging = {
      instance_type = "t3.small"
      min_size      = 2
      max_size      = 4
    }
    production = {
      instance_type = "t3.medium"
      min_size      = 3
      max_size      = 10
    }
  }

  environment   = each.key
  instance_type = each.value.instance_type
  min_size      = each.value.min_size
  max_size      = each.value.max_size

  vpc_cidr = "10.${index(keys(each.value), each.key)}.0.0/16"
}

# Multiple applications
module "application" {
  source = "./modules/application"

  for_each = toset(var.applications)

  name        = each.key
  environment = var.environment

  # Configuration specific to each app
  port = lookup(var.app_ports, each.key, 8080)
  replicas = lookup(var.app_replicas, each.key, 2)
}

# Output from for_each modules
output "environment_endpoints" {
  value = {
    for k, env in module.environment : k => env.endpoint_url
  }
}
```

## Testing Modules

### Module Testing Strategies

```hcl
# modules/vpc/examples/basic/main.tf - Basic example for testing

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# Test the VPC module with minimal configuration
module "vpc_basic" {
  source = "../../"

  vpc_name              = "test-vpc"
  vpc_cidr              = "10.0.0.0/16"
  availability_zones    = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs  = ["10.0.11.0/24", "10.0.12.0/24"]

  tags = {
    Environment = "test"
    Purpose     = "module-testing"
  }
}

# Outputs for verification
output "vpc_id" {
  value = module.vpc_basic.vpc_id
}

output "public_subnets" {
  value = module.vpc_basic.public_subnet_ids
}

# modules/vpc/examples/complete/main.tf - Complete example with all features

module "vpc_complete" {
  source = "../../"

  vpc_name              = "complete-test-vpc"
  vpc_cidr              = "10.1.0.0/16"
  availability_zones    = ["us-east-1a", "us-east-1b", "us-east-1c"]

  public_subnet_cidrs   = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  private_subnet_cidrs  = ["10.1.11.0/24", "10.1.12.0/24", "10.1.13.0/24"]
  database_subnet_cidrs = ["10.1.21.0/24", "10.1.22.0/24", "10.1.23.0/24"]

  enable_dns_hostnames     = true
  enable_dns_support       = true
  create_internet_gateway  = true
  enable_nat_gateway       = true
  single_nat_gateway       = false

  enable_flow_logs         = true
  flow_logs_retention_days = 30

  tags = {
    Environment = "test"
    Purpose     = "complete-module-testing"
    ManagedBy   = "Terraform"
  }
}

# tests/vpc_test.go - Terratest example
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestVPCModule(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../examples/basic",
        Vars: map[string]interface{}{
            "vpc_name": "terratest-vpc",
        },
    }

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    vpcID := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcID)

    publicSubnets := terraform.OutputList(t, terraformOptions, "public_subnets")
    assert.Equal(t, 2, len(publicSubnets))
}
```

## Publishing to Registry

### Preparing Module for Publishing

```hcl
# Directory structure for published module
terraform-aws-vpc-module/
├── .github/
│   └── workflows/
│       └── terraform.yml      # CI/CD pipeline
├── examples/
│   ├── basic/
│   │   ├── main.tf
│   │   └── README.md
│   └── complete/
│       ├── main.tf
│       └── README.md
├── test/
│   └── vpc_test.go
├── main.tf
├── variables.tf
├── outputs.tf
├── versions.tf
├── README.md                   # Comprehensive documentation
├── LICENSE                     # MIT, Apache, etc.
├── CHANGELOG.md               # Version history
└── .gitignore

# README.md template for published module
# AWS VPC Terraform Module

This module creates a VPC with public and private subnets across multiple availability zones.

## Usage

```hcl
module "vpc" {
  source  = "username/vpc/aws"
  version = "~> 1.0"

  vpc_name           = "my-vpc"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]

  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
}
```

## Examples

- [Basic](examples/basic) - Minimal configuration
- [Complete](examples/complete) - All features enabled

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.6.0 |
| aws | ~> 5.0 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| vpc_name | Name of the VPC | `string` | n/a | yes |
| vpc_cidr | CIDR block for VPC | `string` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| vpc_id | ID of the VPC |
| public_subnet_ids | List of public subnet IDs |

## License

MIT Licensed. See LICENSE for full details.

# versions.tf - Semantic versioning
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# CHANGELOG.md
## [1.2.0] - 2024-01-15

### Added
- Support for VPC flow logs
- IPv6 CIDR block support

### Changed
- Updated default subnet sizing

### Fixed
- Issue with NAT gateway creation

## [1.1.0] - 2023-12-01

### Added
- Database subnet group support
- Transit gateway attachment option

## [1.0.0] - 2023-11-01

### Added
- Initial release
- VPC with public/private subnets
- Internet gateway and NAT gateway support
```

## Module Documentation

### Comprehensive README Template

```markdown
# Application Infrastructure Module

Production-ready module for deploying a complete application infrastructure.

## Features

- Multi-AZ deployment for high availability
- Auto-scaling application tier
- Managed database with automated backups
- Load balancer with SSL/TLS termination
- CloudWatch monitoring and alerting
- Security groups with least-privilege access

## Architecture

```
Internet
    |
[Load Balancer]
    |
[Application Tier] --- [Database Tier]
    |                       |
[Auto Scaling Group]   [RDS Instance]
```

## Prerequisites

- AWS account with appropriate permissions
- Terraform >= 1.6.0
- Domain name and ACM certificate (for HTTPS)

## Quick Start

```hcl
module "app" {
  source = "github.com/company/terraform-app-module"

  environment = "production"
  app_name    = "myapp"

  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]

  instance_type = "t3.medium"
  min_capacity  = 2
  max_capacity  = 10

  database_engine         = "postgres"
  database_instance_class = "db.r5.large"
}
```

## Advanced Usage

### Custom Security Groups

```hcl
module "app" {
  source = "github.com/company/terraform-app-module"

  # ... basic configuration ...

  additional_security_group_ids = [
    aws_security_group.custom.id
  ]

  custom_ingress_rules = [
    {
      from_port   = 8080
      to_port     = 8080
      protocol    = "tcp"
      cidr_blocks = ["10.0.0.0/8"]
      description = "Internal API access"
    }
  ]
}
```

### Multi-Environment Deployment

```hcl
locals {
  environments = {
    dev = {
      instance_type = "t3.micro"
      min_capacity  = 1
    }
    prod = {
      instance_type = "t3.large"
      min_capacity  = 3
    }
  }
}

module "app" {
  source   = "github.com/company/terraform-app-module"
  for_each = local.environments

  environment   = each.key
  instance_type = each.value.instance_type
  min_capacity  = each.value.min_capacity

  # ... other configuration ...
}
```

## Inputs Reference

See [INPUTS.md](INPUTS.md) for complete input documentation.

## Outputs Reference

See [OUTPUTS.md](OUTPUTS.md) for complete output documentation.

## Testing

Run the test suite:

```bash
cd test
go test -v -timeout 30m
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Versioning

We use [SemVer](https://semver.org/) for versioning. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
```

## Best Practices

### Module Design Principles

1. **Single Responsibility**: Each module should have one clear purpose
2. **Reusability**: Design modules to be used across different projects
3. **Composition**: Build complex infrastructure from simple modules
4. **Immutability**: Avoid in-place modifications, prefer replacement
5. **Documentation**: Comprehensive README with examples

### Variable Best Practices

- Use descriptive names that indicate purpose
- Always include description for each variable
- Set reasonable defaults where appropriate
- Use validation to catch configuration errors early
- Mark sensitive variables appropriately
- Group related variables logically

### Output Best Practices

- Export all useful information for module consumers
- Use descriptive output names
- Mark sensitive outputs appropriately
- Include descriptions for all outputs
- Output both IDs and ARNs when available

### Testing Best Practices

- Provide multiple examples (basic, complete, custom)
- Write automated tests with Terratest or similar
- Test in isolation and with dependencies
- Validate all configuration combinations
- Include CI/CD pipeline for automated testing

### Version Management

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Maintain comprehensive CHANGELOG
- Test backward compatibility
- Document breaking changes clearly
- Pin module versions in consuming code

### Security Best Practices

- Never hardcode secrets or credentials
- Use dynamic references for sensitive data
- Implement least-privilege access
- Enable encryption by default
- Document security implications
- Regular security audits

### Performance Considerations

- Minimize resource count where possible
- Use data sources efficiently
- Avoid unnecessary dependencies
- Optimize for parallel execution
- Consider state file size impact
