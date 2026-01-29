# Terraform Infrastructure as Code Skill

## Overview
This skill provides comprehensive guidance for Terraform infrastructure provisioning, covering best practices for multi-cloud deployments, state management, security, and automation workflows.

## When This Skill Activates
- Working with `.tf` or `.tfvars` files
- Infrastructure provisioning tasks
- Cloud resource management (AWS, Azure, GCP)
- Infrastructure as Code (IaC) projects
- DevOps automation

## Quick Reference

### Project Structure
```text
terraform-project/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   ├── staging/
│   └── production/
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   ├── compute/
│   └── database/
├── .terraform.lock.hcl
└── README.md
```

### Basic Terraform Configuration

#### Provider Configuration
```hcl
# versions.tf
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = var.project_name
    }
  }
}
```

#### Variables and Outputs
```hcl
# variables.tf
variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "instance_count" {
  description = "Number of instances to create"
  type        = number
  default     = 2

  validation {
    condition     = var.instance_count > 0 && var.instance_count <= 10
    error_message = "Instance count must be between 1 and 10."
  }
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

# outputs.tf
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}
```

### AWS Infrastructure Examples

#### VPC with Public and Private Subnets
```hcl
# main.tf
locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.environment}-vpc"
  }
}

resource "aws_subnet" "public" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = local.azs[count.index]

  map_public_ip_on_launch = true

  tags = {
    Name = "${var.environment}-public-${local.azs[count.index]}"
    Type = "public"
  }
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(local.azs))
  availability_zone = local.azs[count.index]

  tags = {
    Name = "${var.environment}-private-${local.azs[count.index]}"
    Type = "private"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.environment}-igw"
  }
}

resource "aws_eip" "nat" {
  count  = length(local.azs)
  domain = "vpc"

  tags = {
    Name = "${var.environment}-nat-eip-${count.index + 1}"
  }
}

resource "aws_nat_gateway" "main" {
  count         = length(local.azs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.environment}-nat-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.environment}-public-rt"
  }
}

resource "aws_route_table" "private" {
  count  = length(local.azs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = {
    Name = "${var.environment}-private-rt-${count.index + 1}"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
```

#### EC2 with Auto Scaling
```hcl
# Security Group
resource "aws_security_group" "web" {
  name_prefix = "${var.environment}-web-"
  description = "Security group for web servers"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP from anywhere"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS from anywhere"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Launch Template
resource "aws_launch_template" "web" {
  name_prefix   = "${var.environment}-web-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type

  vpc_security_group_ids = [aws_security_group.web.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.web.name
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    environment = var.environment
  }))

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "${var.environment}-web-server"
    }
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "web" {
  name_prefix         = "${var.environment}-web-"
  desired_capacity    = var.desired_capacity
  max_size            = var.max_size
  min_size            = var.min_size
  target_group_arns   = [aws_lb_target_group.web.arn]
  vpc_zone_identifier = aws_subnet.private[*].id
  health_check_type   = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-web-asg"
    propagate_at_launch = false
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Policies
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "${var.environment}-web-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.web.name
}

resource "aws_autoscaling_policy" "scale_down" {
  name                   = "${var.environment}-web-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.web.name
}
```

#### RDS Database
```hcl
resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.environment}-rds-"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
    description     = "Allow PostgreSQL from web servers"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password # Use AWS Secrets Manager in production

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  deletion_protection = var.environment == "production"
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name = "${var.environment}-postgres"
  }
}
```

### Module Development

#### Reusable VPC Module
```hcl
# modules/vpc/variables.tf
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT gateways for private subnets"
  type        = bool
  default     = true
}

# modules/vpc/outputs.tf
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

# Usage in root module
module "vpc" {
  source = "./modules/vpc"

  environment        = var.environment
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true
}

output "vpc_id" {
  value = module.vpc.vpc_id
}
```

### State Management Best Practices

#### Remote Backend Configuration (S3 + DynamoDB)
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "production/vpc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT:key/KEY-ID"
    dynamodb_table = "terraform-state-locks"

    # Workspace support
    workspace_key_prefix = "workspaces"
  }
}

# Create backend resources
resource "aws_s3_bucket" "terraform_state" {
  bucket = "company-terraform-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

### Security Best Practices

#### Secrets Management
```hcl
# Use AWS Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "production/database/password"
}

locals {
  db_credentials = jsondecode(data.aws_secretsmanager_secret_version.db_password.secret_string)
}

resource "aws_db_instance" "main" {
  # ...
  username = local.db_credentials.username
  password = local.db_credentials.password
}

# Or use sensitive variables (mark as sensitive in terraform.tfvars)
variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}
```

#### Least Privilege IAM
```hcl
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "web" {
  name               = "${var.environment}-web-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

data "aws_iam_policy_document" "web_permissions" {
  statement {
    sid = "S3Access"
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.assets.arn,
      "${aws_s3_bucket.assets.arn}/*"
    ]
  }

  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:*:*:log-group:/aws/ec2/${var.environment}*"]
  }
}

resource "aws_iam_role_policy" "web" {
  name   = "${var.environment}-web-policy"
  role   = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web_permissions.json
}
```

## Terraform Workflow

```bash
# Initialize (download providers, setup backend)
terraform init

# Format code
terraform fmt -recursive

# Validate syntax
terraform validate

# Plan changes (see what will change)
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Show current state
terraform show

# List resources
terraform state list

# Import existing resource
terraform import aws_instance.example i-1234567890abcdef0

# Destroy all resources
terraform destroy
```

## CI/CD Integration

```yaml
# GitLab CI example
.terraform_template:
  image: hashicorp/terraform:1.6
  before_script:
    - terraform init

stages:
  - validate
  - plan
  - apply

validate:
  extends: .terraform_template
  stage: validate
  script:
    - terraform fmt -check -recursive
    - terraform validate
    - tflint

plan:
  extends: .terraform_template
  stage: plan
  script:
    - terraform plan -out=tfplan
  artifacts:
    paths:
      - tfplan
    expire_in: 1 week

apply:
  extends: .terraform_template
  stage: apply
  script:
    - terraform apply -auto-approve tfplan
  when: manual
  only:
    - main
```

## Additional Resources

For detailed guidance on specific topics:

### Cloud Provider Patterns
- `resources/aws-patterns.md` (767 lines) - AWS infrastructure patterns: 3-tier apps, serverless, static sites, Lambda, RDS, ElastiCache, CloudFront
- `resources/azure-patterns.md` (1,134 lines) - Azure infrastructure: App Service, SQL Database, Key Vault, Container Instances, monitoring
- `resources/gcp-patterns.md` (1,280 lines) - GCP infrastructure: Compute Engine, Cloud SQL, Cloud Storage, Cloud Functions, Cloud Run, load balancing

### Terraform Best Practices
- `resources/modules-guide.md` (1,365 lines) - Creating reusable modules, validation, versioning, testing with Terratest, publishing to registry
- `resources/state-management.md` (1,482 lines) - Remote backends, state locking, workspaces, disaster recovery, team collaboration, CI/CD
- `resources/security-patterns.md` (1,604 lines) - Secrets management, IAM, network security, encryption, VPN, audit logging, CIS benchmarks, security scanning

**Total: 7,632+ lines of Terraform guidance across 6 comprehensive resource files**

## Best Practices Summary

1. **Remote State**: Always use remote state with locking
2. **Modules**: Create reusable modules for common patterns
3. **Variables**: Use validation and descriptions
4. **Outputs**: Expose necessary information
5. **Versioning**: Pin provider versions
6. **Security**: Never commit secrets, use secret managers
7. **Naming**: Use consistent naming conventions
8. **Tags**: Tag all resources for cost allocation
9. **State Files**: Never edit state manually
10. **Documentation**: Document modules with README

## Common Pitfalls to Avoid

- ❌ Not using remote state
- ❌ Hardcoding values instead of using variables
- ❌ Not pinning provider versions
- ❌ Committing `.tfstate` files or secrets
- ❌ Not using workspaces or separate state files for environments
- ❌ Overly complex single files (use modules)
- ❌ Not using data sources for existing resources
- ❌ Ignoring security group rules
- ❌ Not enabling encryption
- ❌ Skipping `terraform plan` before `apply`
