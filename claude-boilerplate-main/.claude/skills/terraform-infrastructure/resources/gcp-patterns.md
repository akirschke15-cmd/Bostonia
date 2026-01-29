# GCP Infrastructure Patterns with Terraform

## Project and Resource Organization

### Project Structure and Naming

```hcl
# Data sources for project information
data "google_project" "current" {}

data "google_client_config" "current" {}

# Local variables for consistent naming
locals {
  # GCP naming convention: {resource_type}-{environment}-{app_name}-{location}
  naming_prefix = "${var.environment}-${var.app_name}"

  # Location shortnames
  location_map = {
    "us-central1"    = "uc1"
    "us-east1"       = "ue1"
    "us-west1"       = "uw1"
    "europe-west1"   = "ew1"
    "asia-east1"     = "ae1"
  }

  location_short = lookup(local.location_map, var.region, "unknown")

  common_labels = {
    environment  = var.environment
    managed_by   = "terraform"
    application  = var.app_name
    team         = var.team_name
    cost_center  = var.cost_center
  }
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "storage-api.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudkms.googleapis.com",
  ])

  service            = each.key
  disable_on_destroy = false
}

# Service Account for Application
resource "google_service_account" "app" {
  account_id   = "${local.naming_prefix}-app-sa"
  display_name = "${var.app_name} Application Service Account"
  description  = "Service account for ${var.app_name} application in ${var.environment}"
}

# Service Account for Terraform
resource "google_service_account" "terraform" {
  account_id   = "${local.naming_prefix}-terraform-sa"
  display_name = "${var.app_name} Terraform Service Account"
  description  = "Service account for Terraform deployments"
}
```

## VPC Networks and Subnets

### Custom VPC with Multiple Subnets

```hcl
# VPC Network
resource "google_compute_network" "main" {
  name                            = "vpc-${local.naming_prefix}"
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false

  depends_on = [google_project_service.required_apis]
}

# Subnets
resource "google_compute_subnetwork" "web" {
  name          = "subnet-${local.naming_prefix}-web"
  ip_cidr_range = var.web_subnet_cidr
  region        = var.region
  network       = google_compute_network.main.id

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pod_cidr_range
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.service_cidr_range
  }

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_subnetwork" "app" {
  name          = "subnet-${local.naming_prefix}-app"
  ip_cidr_range = var.app_subnet_cidr
  region        = var.region
  network       = google_compute_network.main.id

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_subnetwork" "data" {
  name          = "subnet-${local.naming_prefix}-data"
  ip_cidr_range = var.data_subnet_cidr
  region        = var.region
  network       = google_compute_network.main.id

  private_ip_google_access = true
}

# Cloud Router for NAT
resource "google_compute_router" "main" {
  name    = "router-${local.naming_prefix}"
  region  = var.region
  network = google_compute_network.main.id

  bgp {
    asn = 64514
  }
}

# Cloud NAT
resource "google_compute_router_nat" "main" {
  name                               = "nat-${local.naming_prefix}"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Firewall Rules
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

  source_ranges = [
    var.web_subnet_cidr,
    var.app_subnet_cidr,
    var.data_subnet_cidr
  ]

  priority = 1000
}

resource "google_compute_firewall" "allow_health_check" {
  name    = "fw-${local.naming_prefix}-allow-health-check"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080"]
  }

  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22"
  ]

  target_tags = ["http-server", "https-server"]
  priority    = 1000
}

resource "google_compute_firewall" "allow_ssh_iap" {
  name    = "fw-${local.naming_prefix}-allow-ssh-iap"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ssh-iap"]
  priority      = 1000
}

resource "google_compute_firewall" "deny_all_ingress" {
  name    = "fw-${local.naming_prefix}-deny-all-ingress"
  network = google_compute_network.main.name

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  priority      = 65535
}
```

## Compute Engine Instances

### Managed Instance Group with Auto-scaling

```hcl
# Instance Template
resource "google_compute_instance_template" "app" {
  name_prefix  = "template-${local.naming_prefix}-"
  machine_type = var.machine_type
  region       = var.region

  tags = ["http-server", "https-server", "ssh-iap"]

  disk {
    source_image = data.google_compute_image.debian.self_link
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-balanced"

    disk_encryption_key {
      kms_key_self_link = google_kms_crypto_key.compute.id
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id

    # No external IP - egress through Cloud NAT only
    # Omit access_config block to prevent external IP assignment
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = templatefile("${path.module}/startup-script.sh", {
    environment       = var.environment
    database_host     = google_sql_database_instance.main.private_ip_address
    database_name     = google_sql_database.main.name
    project_id        = data.google_project.current.project_id
  })

  service_account {
    email  = google_service_account.app.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
  }

  labels = local.common_labels

  lifecycle {
    create_before_destroy = true
  }
}

# Health Check
resource "google_compute_health_check" "app" {
  name                = "hc-${local.naming_prefix}-app"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 8080
    request_path = "/health"
  }
}

# Instance Group Manager
resource "google_compute_region_instance_group_manager" "app" {
  name               = "igm-${local.naming_prefix}-app"
  base_instance_name = "${local.naming_prefix}-app"
  region             = var.region

  version {
    instance_template = google_compute_instance_template.app.id
  }

  named_port {
    name = "http"
    port = 8080
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.app.id
    initial_delay_sec = 300
  }

  update_policy {
    type                           = "PROACTIVE"
    instance_redistribution_type   = "PROACTIVE"
    minimal_action                 = "REPLACE"
    max_surge_fixed                = 3
    max_unavailable_fixed          = 0
    replacement_method             = "SUBSTITUTE"
  }

  target_size = var.min_instances
}

# Auto-scaler
resource "google_compute_region_autoscaler" "app" {
  name   = "as-${local.naming_prefix}-app"
  region = var.region
  target = google_compute_region_instance_group_manager.app.id

  autoscaling_policy {
    min_replicas    = var.min_instances
    max_replicas    = var.max_instances
    cooldown_period = 60

    cpu_utilization {
      target = 0.7
    }

    metric {
      name   = "compute.googleapis.com/instance/network/received_bytes_count"
      target = 10000
      type   = "GAUGE"
    }

    scale_in_control {
      max_scaled_in_replicas {
        fixed = 1
      }
      time_window_sec = 300
    }
  }
}
```

## Cloud SQL (PostgreSQL)

### High-Availability PostgreSQL Instance

```hcl
# Random password generation
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Cloud SQL Instance
resource "google_sql_database_instance" "main" {
  name             = "sql-${local.naming_prefix}-${local.location_short}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = var.environment == "production"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.environment == "production" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      require_ssl     = true

      authorized_networks {
        name  = "office"
        value = var.office_ip_range
      }
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_statement"
      value = "all"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }

    user_labels = local.common_labels
  }

  deletion_protection = var.environment == "production"

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Database
resource "google_sql_database" "main" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
}

# Database User
resource "google_sql_user" "main" {
  name     = var.db_username
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Read Replica for Production
resource "google_sql_database_instance" "replica" {
  count = var.environment == "production" ? 1 : 0

  name                 = "sql-${local.naming_prefix}-${local.location_short}-replica"
  master_instance_name = google_sql_database_instance.main.name
  region               = var.replica_region
  database_version     = "POSTGRES_15"

  replica_configuration {
    failover_target = false
  }

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      require_ssl     = true
    }

    user_labels = local.common_labels
  }
}

# Private Service Connection
resource "google_compute_global_address" "private_ip_address" {
  name          = "private-ip-address-${local.naming_prefix}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}
```

## Cloud Storage Buckets

### Multi-Purpose Storage with Lifecycle Policies

```hcl
# Application Storage Bucket
resource "google_storage_bucket" "app_storage" {
  name          = "gs-${local.naming_prefix}-app-storage"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  public_access_prevention = "enforced"

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = var.allowed_origins
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = local.common_labels
}

# Static Assets Bucket (CDN-backed)
resource "google_storage_bucket" "static_assets" {
  name          = "gs-${local.naming_prefix}-static-assets"
  location      = "US"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  labels = local.common_labels
}

# Make static assets publicly readable
resource "google_storage_bucket_iam_member" "static_assets_public" {
  bucket = google_storage_bucket.static_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Backup Storage Bucket
resource "google_storage_bucket" "backups" {
  name          = "gs-${local.naming_prefix}-backups"
  location      = var.region
  storage_class = "NEARLINE"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
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

  labels = local.common_labels
}

# Log Storage Bucket
resource "google_storage_bucket" "logs" {
  name          = "gs-${local.naming_prefix}-logs"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
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

  labels = local.common_labels
}

# IAM bindings for service account
resource "google_storage_bucket_iam_member" "app_storage_admin" {
  bucket = google_storage_bucket.app_storage.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

resource "google_storage_bucket_iam_member" "backups_admin" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}
```

## Secret Manager

### Secrets with IAM Access Control

```hcl
# Database password secret
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password-${local.naming_prefix}"

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# API Key secret
resource "google_secret_manager_secret" "api_key" {
  secret_id = "api-key-${local.naming_prefix}"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
      replicas {
        location = var.replica_region
      }
    }
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "api_key" {
  secret      = google_secret_manager_secret.api_key.id
  secret_data = var.external_api_key
}

# Database connection string
resource "google_secret_manager_secret" "db_connection_string" {
  secret_id = "db-connection-string-${local.naming_prefix}"

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "db_connection_string" {
  secret = google_secret_manager_secret.db_connection_string.id
  secret_data = "postgresql://${google_sql_user.main.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.main.name}"
}

# IAM bindings for secrets
resource "google_secret_manager_secret_iam_member" "app_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "app_api_key" {
  secret_id = google_secret_manager_secret.api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "app_db_connection" {
  secret_id = google_secret_manager_secret.db_connection_string.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}
```

## Cloud Functions

### HTTP Cloud Function with Secrets

```hcl
# Source code bucket
resource "google_storage_bucket" "function_source" {
  name          = "gs-${local.naming_prefix}-function-source"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  labels = local.common_labels
}

# Upload function source
resource "google_storage_bucket_object" "function_source" {
  name   = "function-${var.function_version}.zip"
  bucket = google_storage_bucket.function_source.name
  source = "${path.module}/function-source.zip"
}

# Cloud Function (2nd gen)
resource "google_cloudfunctions2_function" "api" {
  name     = "cf-${local.naming_prefix}-api"
  location = var.region

  build_config {
    runtime     = "python311"
    entry_point = "main"

    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.function_source.name
      }
    }
  }

  service_config {
    max_instance_count    = var.environment == "production" ? 100 : 10
    min_instance_count    = var.environment == "production" ? 1 : 0
    available_memory      = "512M"
    timeout_seconds       = 60
    service_account_email = google_service_account.app.email

    environment_variables = {
      ENVIRONMENT = var.environment
      PROJECT_ID  = data.google_project.current.project_id
    }

    secret_environment_variables {
      key        = "DATABASE_URL"
      project_id = data.google_project.current.project_id
      secret     = google_secret_manager_secret.db_connection_string.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "API_KEY"
      project_id = data.google_project.current.project_id
      secret     = google_secret_manager_secret.api_key.secret_id
      version    = "latest"
    }

    vpc_connector = google_vpc_access_connector.main.id
    vpc_connector_egress_settings = "PRIVATE_RANGES_ONLY"

    ingress_settings = "ALLOW_INTERNAL_AND_GCLB"
  }

  labels = local.common_labels
}

# VPC Connector for Cloud Function
resource "google_vpc_access_connector" "main" {
  name          = "vpc-connector-${local.naming_prefix}"
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = var.vpc_connector_cidr

  min_instances = 2
  max_instances = 10
}

# PRODUCTION: Use authenticated invocation with specific service accounts
# This example shows public access for development only - DO NOT USE IN PRODUCTION
# For production, use one of the patterns below:

# Option 1: Service account for service-to-service calls (RECOMMENDED)
# resource "google_cloudfunctions2_function_iam_member" "invoker" {
#   project        = google_cloudfunctions2_function.api.project
#   location       = google_cloudfunctions2_function.api.location
#   cloud_function = google_cloudfunctions2_function.api.name
#   role           = "roles/cloudfunctions.invoker"
#   member         = "serviceAccount:${google_service_account.caller.email}"
# }

# Option 2: Workload Identity for GKE pods
# member = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/${var.k8s_sa_name}]"

# Option 3: For truly public APIs, use API Gateway or Cloud Endpoints with:
# - Authentication (API keys, OAuth2)
# - Rate limiting
# - Request validation

# Development only - remove for production
resource "google_cloudfunctions2_function_iam_member" "invoker" {
  count = var.environment == "development" ? 1 : 0

  project        = google_cloudfunctions2_function.api.project
  location       = google_cloudfunctions2_function.api.location
  cloud_function = google_cloudfunctions2_function.api.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}
```

## Load Balancing

### Global HTTP(S) Load Balancer

```hcl
# Global IP Address
resource "google_compute_global_address" "default" {
  name = "ip-${local.naming_prefix}-lb"
}

# SSL Certificate
resource "google_compute_managed_ssl_certificate" "default" {
  name = "cert-${local.naming_prefix}"

  managed {
    domains = [var.domain_name, "www.${var.domain_name}"]
  }
}

# Backend Service
resource "google_compute_backend_service" "default" {
  name                  = "backend-${local.naming_prefix}"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  enable_cdn            = true
  health_checks         = [google_compute_health_check.app.id]
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group           = google_compute_region_instance_group_manager.app.instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    client_ttl        = 3600
    max_ttl           = 86400
    negative_caching  = true
    serve_while_stale = 86400

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = false
    }
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }

  iap {
    oauth2_client_id     = var.iap_client_id
    oauth2_client_secret = var.iap_client_secret
  }
}

# URL Map
resource "google_compute_url_map" "default" {
  name            = "url-map-${local.naming_prefix}"
  default_service = google_compute_backend_service.default.id

  host_rule {
    hosts        = [var.domain_name, "www.${var.domain_name}"]
    path_matcher = "main"
  }

  path_matcher {
    name            = "main"
    default_service = google_compute_backend_service.default.id

    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.default.id
    }

    path_rule {
      paths   = ["/static/*"]
      service = google_compute_backend_bucket.static_assets.id
    }
  }
}

# Backend Bucket for Static Assets
resource "google_compute_backend_bucket" "static_assets" {
  name        = "backend-bucket-${local.naming_prefix}"
  bucket_name = google_storage_bucket.static_assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 86400
    client_ttl        = 86400
    max_ttl           = 604800
    negative_caching  = true
  }
}

# HTTPS Proxy
resource "google_compute_target_https_proxy" "default" {
  name             = "https-proxy-${local.naming_prefix}"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = [google_compute_managed_ssl_certificate.default.id]
}

# HTTP to HTTPS Redirect
resource "google_compute_url_map" "https_redirect" {
  name = "url-map-${local.naming_prefix}-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "https_redirect" {
  name    = "http-proxy-${local.naming_prefix}-redirect"
  url_map = google_compute_url_map.https_redirect.id
}

# Forwarding Rules
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "fwd-rule-${local.naming_prefix}-https"
  target                = google_compute_target_https_proxy.default.id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.default.address
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "fwd-rule-${local.naming_prefix}-http"
  target                = google_compute_target_http_proxy.https_redirect.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.default.address
}
```

## Cloud Run Containers

### Serverless Container with Cloud SQL

```hcl
# Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  name     = "run-${local.naming_prefix}"
  location = var.region

  template {
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = var.environment == "production" ? 100 : 10
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${data.google_project.current.project_id}/containers/${var.app_name}:${var.image_tag}"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
        cpu_idle = true
        startup_cpu_boost = true
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_connection_string.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    service_account = google_service_account.app.email

    max_instance_request_concurrency = 80

    timeout = "300s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.common_labels
}

# IAM policy for Cloud Run
# PRODUCTION: Use authenticated invocation with specific identities
# This example shows public access for development only - DO NOT USE IN PRODUCTION

# Option 1: Service account for service-to-service calls (RECOMMENDED)
# resource "google_cloud_run_v2_service_iam_member" "invoker" {
#   name     = google_cloud_run_v2_service.main.name
#   location = google_cloud_run_v2_service.main.location
#   role     = "roles/run.invoker"
#   member   = "serviceAccount:${google_service_account.caller.email}"
# }

# Option 2: Identity-Aware Proxy (IAP) for web apps with user authentication
# Configure IAP in Console or via terraform, then grant access:
# member = "user:user@example.com" or "group:team@example.com"

# Option 3: API Gateway with authentication for public APIs
# Use google_api_gateway_api with authentication config

# Option 4: Cloud Armor for additional security (rate limiting, WAF)
# Attach Cloud Armor policy to load balancer in front of Cloud Run

# Development only - remove for production
# For production services requiring public access:
# 1. Use Cloud Load Balancer + Cloud Armor for protection
# 2. Implement authentication in application code (API keys, OAuth2)
# 3. Use rate limiting middleware
# 4. Monitor with Cloud Monitoring and set up alerts
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count = var.environment == "development" ? 1 : 0

  name     = google_cloud_run_v2_service.main.name
  location = google_cloud_run_v2_service.main.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud SQL Connection
resource "google_project_iam_member" "cloud_sql_client" {
  project = data.google_project.current.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app.email}"
}
```

## Complete Application Example

### Full Stack Application Infrastructure

```hcl
# terraform.tfvars
environment   = "production"
region        = "us-central1"
replica_region = "us-east1"
app_name      = "myapp"
team_name     = "engineering"
cost_center   = "product"

# Network configuration
web_subnet_cidr     = "10.0.1.0/24"
app_subnet_cidr     = "10.0.2.0/24"
data_subnet_cidr    = "10.0.3.0/24"
pod_cidr_range      = "10.1.0.0/16"
service_cidr_range  = "10.2.0.0/16"
vpc_connector_cidr  = "10.8.0.0/28"

# Compute configuration
machine_type    = "e2-medium"
min_instances   = 2
max_instances   = 10

# Database configuration
db_tier       = "db-custom-2-7680"
db_disk_size  = 100
database_name = "myapp_db"
db_username   = "myapp_user"

# Domain configuration
domain_name = "example.com"
allowed_origins = ["https://example.com", "https://www.example.com"]

# Main configuration module
module "gcp_infrastructure" {
  source = "./modules/gcp-infrastructure"

  # Pass all variables
  environment        = var.environment
  region            = var.region
  app_name          = var.app_name

  # Network
  web_subnet_cidr    = var.web_subnet_cidr
  app_subnet_cidr    = var.app_subnet_cidr
  data_subnet_cidr   = var.data_subnet_cidr

  # Compute
  machine_type      = var.machine_type
  min_instances     = var.min_instances
  max_instances     = var.max_instances

  # Database
  db_tier          = var.db_tier
  db_disk_size     = var.db_disk_size
  database_name    = var.database_name
  db_username      = var.db_username

  # Domain
  domain_name      = var.domain_name
  allowed_origins  = var.allowed_origins
}

# Outputs
output "load_balancer_ip" {
  value       = module.gcp_infrastructure.load_balancer_ip
  description = "External IP address of the load balancer"
}

output "cloud_run_url" {
  value       = module.gcp_infrastructure.cloud_run_url
  description = "URL of the Cloud Run service"
}

output "database_connection_name" {
  value       = module.gcp_infrastructure.database_connection_name
  description = "Cloud SQL instance connection name"
  sensitive   = true
}

output "storage_bucket_urls" {
  value = {
    app_storage    = module.gcp_infrastructure.app_storage_bucket_url
    static_assets  = module.gcp_infrastructure.static_assets_bucket_url
    backups        = module.gcp_infrastructure.backups_bucket_url
  }
  description = "URLs of storage buckets"
}
```

## Best Practices

### Project Organization
- Use consistent naming conventions across all resources
- Implement clear project hierarchy for multi-environment setups
- Use labels extensively for cost tracking and resource management
- Enable all required APIs at the beginning of deployment
- Use separate service accounts for different workloads

### Security
- Enable VPC Service Controls for sensitive data
- Use Secret Manager for all sensitive data, never hardcode secrets
- Implement least-privilege IAM with custom roles when needed
- Enable Binary Authorization for container security
- Use Cloud Armor for DDoS protection and WAF rules
- Enable Security Command Center for threat detection
- Implement Organization Policies for governance

### Networking
- Use private IP addresses for all internal services
- Implement Cloud NAT for outbound internet access
- Use Private Service Connect for Google APIs
- Enable VPC Flow Logs for network monitoring
- Implement proper firewall rules with priority ordering
- Use Cloud CDN for static content delivery

### High Availability
- Deploy across multiple zones in production
- Use regional resources when available
- Implement health checks and auto-healing
- Configure proper backup and disaster recovery
- Use Cloud SQL high availability mode for production
- Implement multi-region storage for critical data

### Monitoring and Logging
- Centralize logs in Cloud Logging
- Use Cloud Monitoring for metrics and alerting
- Enable Cloud Trace for distributed tracing
- Implement SLOs and SLIs with Cloud Monitoring
- Set up uptime checks for critical services
- Use Cloud Profiler for performance optimization
- Export logs to BigQuery for analysis

### Cost Optimization
- Use preemptible VMs for non-critical workloads
- Implement autoscaling based on actual demand
- Use committed use discounts for stable workloads
- Set up budget alerts and quotas
- Use appropriate storage classes based on access patterns
- Enable Cloud Run min instances = 0 for development
- Review and optimize with Cloud Cost Management tools

### Compliance and Governance
- Use Organization Policies for compliance enforcement
- Implement VPC Service Controls for data exfiltration prevention
- Enable Cloud Asset Inventory for resource tracking
- Use Access Transparency for audit logs
- Implement proper data residency controls
- Regular security audits with Security Command Center
- Use Cloud Data Loss Prevention for sensitive data scanning
