terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# AWS provider for S3 storage
provider "aws" {
  region = var.aws_region
}

# DigitalOcean provider for compute and database
provider "digitalocean" {
  token = var.do_token
}

# S3 bucket for video storage
resource "aws_s3_bucket" "video_storage" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DigitalOcean Kubernetes cluster
resource "digitalocean_kubernetes_cluster" "world_social" {
  name    = "world-social-cluster"
  region  = var.do_region
  version = "1.28.2-do.0"

  node_pool {
    name       = "worker-pool"
    size       = "s-2vcpu-4gb"
    node_count = 2
    
    taint {
      key    = "workload"
      value  = "media"
      effect = "NoSchedule"
    }
  }
}

# DigitalOcean Managed PostgreSQL
resource "digitalocean_database_cluster" "postgres" {
  name       = "world-social-db"
  engine     = "pg"
  version    = "15"
  size       = "db-s-1vcpu-1gb"
  region     = var.do_region
  node_count = 1
}

# DigitalOcean Managed Redis
resource "digitalocean_database_cluster" "redis" {
  name       = "world-social-redis"
  engine     = "redis"
  version    = "7"
  size       = "db-s-1vcpu-1gb"
  region     = var.do_region
  node_count = 1
} 