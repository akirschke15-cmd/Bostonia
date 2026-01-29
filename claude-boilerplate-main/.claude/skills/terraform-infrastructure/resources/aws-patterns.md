# AWS Infrastructure Patterns with Terraform

## Common AWS Architectures

### Three-Tier Web Application

Complete infrastructure for a scalable web application with load balancer, application servers, and RDS database.

```hcl
# VPC and Networking
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.environment}-vpc"
  cidr = var.vpc_cidr

  azs              = data.aws_availability_zones.available.names
  private_subnets  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i)]
  public_subnets   = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i + 10)]
  database_subnets = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i + 20)]

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = local.common_tags
}

# Application Load Balancer
resource "aws_lb" "app" {
  name               = "${var.environment}-app-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = var.environment == "production"
  enable_http2              = true
  enable_cross_zone_load_balancing = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.app.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Redirect HTTP to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
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

resource "aws_lb_target_group" "app" {
  name     = "${var.environment}-app-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = local.common_tags
}

# EC2 Launch Template
resource "aws_launch_template" "app" {
  name_prefix   = "${var.environment}-app-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type

  vpc_security_group_ids = [aws_security_group.app.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    environment        = var.environment
    database_endpoint  = aws_db_instance.main.endpoint
    redis_endpoint     = aws_elasticache_cluster.main.cache_nodes[0].address
  }))

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${var.environment}-app-server"
    })
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "app" {
  name_prefix         = "${var.environment}-app-"
  desired_capacity    = var.desired_capacity
  max_size            = var.max_capacity
  min_size            = var.min_capacity
  target_group_arns   = [aws_lb_target_group.app.arn]
  vpc_zone_identifier = module.vpc.private_subnets
  health_check_type   = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupMaxSize",
    "GroupMinSize",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances"
  ]

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 90
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-app-asg"
    propagate_at_launch = false
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}

# Auto Scaling Policies
resource "aws_autoscaling_policy" "target_tracking" {
  name                   = "${var.environment}-app-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# RDS Database
resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = module.vpc.database_subnets

  tags = local.common_tags
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.environment}-postgres15"
  family = "postgres15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  tags = local.common_tags
}

resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class

  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  multi_az               = var.environment == "production"
  publicly_accessible    = false
  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  tags = local.common_tags
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-cache-subnet-group"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.environment}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.environment}-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  snapshot_retention_limit = var.environment == "production" ? 7 : 0
  snapshot_window          = "03:00-05:00"

  tags = local.common_tags
}

# Security Groups
resource "aws_security_group" "alb" {
  name_prefix = "${var.environment}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP from internet"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS from internet"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "app" {
  name_prefix = "${var.environment}-app-"
  description = "Security group for application servers"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Allow traffic from ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.environment}-rds-"
  description = "Security group for RDS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "Allow PostgreSQL from app servers"
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.environment}-redis-"
  description = "Security group for Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "Allow Redis from app servers"
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}
```

### S3 + CloudFront Static Website

```hcl
# S3 Bucket for Static Assets
resource "aws_s3_bucket" "website" {
  bucket = "${var.domain_name}-website"

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "website" {
  bucket = aws_s3_bucket.website.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "website" {
  comment = "OAI for ${var.domain_name}"
}

# S3 Bucket Policy for CloudFront
data "aws_iam_policy_document" "website_bucket_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.website.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.website.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id
  policy = data.aws_iam_policy_document.website_bucket_policy.json
}

# ACM Certificate
resource "aws_acm_certificate" "website" {
  provider          = aws.us_east_1  # CloudFront requires certs in us-east-1
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = ["www.${var.domain_name}"]

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.domain_name} website"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name, "www.${var.domain_name}"]

  origin {
    domain_name = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.website.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.website.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.website.id}"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern     = "/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.website.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
  }

  # Custom error response for SPA routing
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.website.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.common_tags
}

# Route53 Records
resource "aws_route53_record" "website" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website.domain_name
    zone_id                = aws_cloudfront_distribution.website.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "website_www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website.domain_name
    zone_id                = aws_cloudfront_distribution.website.hosted_zone_id
    evaluate_target_health = false
  }
}
```

### Lambda + API Gateway Serverless API

```hcl
# Lambda Function
resource "aws_lambda_function" "api" {
  filename      = "lambda.zip"
  function_name = "${var.environment}-api"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 512

  source_code_hash = filebase64sha256("lambda.zip")

  # NOTE: For production, use AWS Secrets Manager instead of plaintext credentials
  # This example shows direct env vars for development/testing purposes only
  environment {
    variables = {
      ENVIRONMENT    = var.environment
      # Development: Direct connection strings (not recommended for production)
      DATABASE_URL   = "postgresql://${aws_db_instance.main.endpoint}"
      REDIS_URL      = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379"

      # Production alternative: Store secret ARNs and retrieve at runtime
      # DB_SECRET_ARN    = aws_secretsmanager_secret.db_credentials.arn
      # REDIS_SECRET_ARN = aws_secretsmanager_secret.redis_config.arn
      # Lambda code would fetch secrets using AWS SDK: boto3.client('secretsmanager').get_secret_value(SecretId=os.environ['DB_SECRET_ARN'])
    }
  }

  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.lambda.id]
  }

  tracing_config {
    mode = "Active"
  }

  tags = local.common_tags
}

# Lambda IAM Role
resource "aws_iam_role" "lambda" {
  name = "${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda.name
}

# Example: Grant Lambda access to Secrets Manager for production environments
# Uncomment and configure for production deployments
# resource "aws_iam_role_policy" "lambda_secrets" {
#   name = "${var.environment}-lambda-secrets"
#   role = aws_iam_role.lambda.id
#
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Effect = "Allow"
#       Action = [
#         "secretsmanager:GetSecretValue",
#         "secretsmanager:DescribeSecret"
#       ]
#       Resource = [
#         "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.environment}/database/*",
#         "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.environment}/redis/*"
#       ]
#     }]
#   })
# }

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda.name
}

# API Gateway v2 (HTTP API)
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.environment}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 300
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"

  connection_type      = "INTERNET"
  integration_method   = "POST"
  integration_uri      = aws_lambda_function.api.invoke_arn
  passthrough_behavior = "WHEN_NO_MATCH"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
```

These patterns cover the most common AWS architectures and can be adapted for various use cases.
