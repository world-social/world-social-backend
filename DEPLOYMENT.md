# World Social Backend Deployment Guide

This guide provides step-by-step instructions for deploying the World Social backend to production.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Account Setup](#account-setup)
- [Initial Setup](#initial-setup)
- [Infrastructure Deployment](#infrastructure-deployment)
- [Application Deployment](#application-deployment)
- [Backup and Recovery](#backup-and-recovery)
- [Monitoring](#monitoring)
- [MVP and Validation Environment](#mvp-and-validation-environment)

## Prerequisites

The deployment process requires several tools and accounts. Our `setup.sh` script will install these automatically, but here's what it includes:

- Terraform (Infrastructure as Code)
- Docker and Docker Compose
- kubectl (Kubernetes CLI)
- doctl (DigitalOcean CLI)
- AWS CLI
- Git

## Account Setup

### 1. AWS Account
1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the signup process
4. After signup:
   - Go to IAM dashboard
   - Create a new user with programmatic access
   - Attach policies for S3 and backup permissions
   - Save the Access Key ID and Secret Access Key

### 2. DigitalOcean Account
1. Go to https://www.digitalocean.com/
2. Click "Sign Up"
3. Follow the signup process
4. Generate API token:
   - Go to API section in settings
   - Click "Generate New Token"
   - Give it a name (e.g., "world-social-deployment")
   - Save the token securely

## Initial Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd world-social-backend
```

2. Make scripts executable:
```bash
chmod +x scripts/*.sh
```

3. Run the automated setup script:
```bash
./scripts/setup.sh
```

This script will:
- Install all required tools based on your OS
- Prompt for AWS and DigitalOcean credentials
- Configure local environment
- Set up necessary CLI tools

## Infrastructure Deployment

### 1. Initialize Terraform
```bash
cd terraform
terraform init
```

### 2. Review Infrastructure Plan
```bash
terraform plan
```

This will show you:
- S3 bucket for video storage
- Kubernetes cluster configuration
- Database instances
- Redis cache setup

### 3. Deploy Infrastructure
```bash
terraform apply
```

When prompted, type 'yes' to confirm.

## Application Deployment

### 1. Configure Environment Variables

Create `.env.production`:
```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/worldsocial
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=worldsocial

# Redis
REDIS_URL=redis://host:6379

# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
S3_BUCKET=your_bucket_name

# JWT
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRATION=24h

# API
PORT=3000
NODE_ENV=production
```

### 2. Deploy Application

Run the deployment script:
```bash
./scripts/deploy.sh
```

This will:
- Build the Docker image
- Push to container registry
- Deploy to Kubernetes
- Configure services and ingress

## Backup and Recovery

### Setting Up Automated Backups

1. Configure backup schedule:
```bash
# Add to crontab for daily backups at midnight
(crontab -l 2>/dev/null; echo "0 0 * * * /path/to/world-social-backend/scripts/backup.sh") | crontab -
```

2. Verify backup configuration:
```bash
# Check backup directory
ls -la /backups/world-social

# Check crontab entry
crontab -l
```

### Performing Recovery

To restore from a backup:
```bash
./scripts/restore.sh /path/to/backup/full_backup_YYYYMMDD_HHMMSS.tar.gz
```

## Storage Migration (MinIO to S3)

The application uses a storage adapter (`src/configs/storage.js`) that automatically handles both MinIO (development) and S3 (production) environments. The switch is controlled by the `NODE_ENV` environment variable:

- `NODE_ENV=development`: Uses MinIO
- `NODE_ENV=production`: Uses AWS S3

No manual migration is needed as the storage adapter handles the different environments automatically.

## Monitoring and Maintenance

### 1. View Logs
```bash
# View application logs
kubectl logs -f deployment/world-social-backend

# View combined logs
tail -f combined.log

# View error logs
tail -f error.log
```

### 2. Check Services
```bash
# Check Kubernetes services
kubectl get services

# Check pods
kubectl get pods

# Check deployments
kubectl get deployments
```

### 3. Database Management
```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Monitor Redis
redis-cli -h $REDIS_HOST monitor
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
```bash
# Check database status
kubectl exec -it $(kubectl get pod -l app=postgres -o jsonpath="{.items[0].metadata.name}") -- pg_isready
```

2. **Redis Connection Issues**
```bash
# Check Redis status
redis-cli -h $REDIS_HOST ping
```

3. **Storage Issues**
```bash
# Check S3 bucket access
aws s3 ls s3://$S3_BUCKET
```

### Getting Help

If you encounter issues:
1. Check the logs (`combined.log` and `error.log`)
2. Verify environment variables
3. Ensure all services are running
4. Check Kubernetes events: `kubectl get events --sort-by='.metadata.creationTimestamp'`

## Security Notes

1. Never commit `.env` files
2. Rotate credentials regularly
3. Use secure values for secrets
4. Keep all systems updated
5. Monitor for suspicious activity

## Cost Management

### Estimated Monthly Infrastructure Costs

#### DigitalOcean Resources

1. **Kubernetes Cluster**
   - Basic cluster (2 nodes, s-2vcpu-4gb): $48/month
   - Load Balancer: $10/month
   - Total: $58/month

2. **Managed PostgreSQL**
   - db-s-1vcpu-1gb (Basic): $15/month
   - Backup storage (estimated 10GB): $1/month
   - Total: $16/month

3. **Managed Redis**
   - db-s-1vcpu-1gb (Basic): $15/month
   - Total: $15/month

**DigitalOcean Subtotal: ~$89/month**

#### AWS Resources

1. **S3 Storage**
   - Storage (first 50GB): $0.023/GB = $1.15/month
   - PUT/COPY/POST requests (10,000/day): $0.005/1,000 requests = $1.50/month
   - GET requests (100,000/day): $0.0004/1,000 requests = $1.20/month
   - Data transfer out (100GB): $0.09/GB = $9/month
   - Total: ~$13/month

2. **Backup Storage**
   - Storage (50GB): $1.15/month
   - Lifecycle transitions: $0.50/month
   - Total: ~$2/month

**AWS Subtotal: ~$15/month**

### Total Estimated Cost: ~$104/month

### Cost Optimization Tips

1. **DigitalOcean Optimizations**
   - Use reserved nodes for 20-30% savings on Kubernetes
   - Scale down during off-peak hours
   - Monitor and adjust database instance sizes based on usage
   - Estimated savings: $15-25/month

2. **AWS Optimizations**
   - Implement lifecycle policies for old videos
   - Use S3 Intelligent-Tiering for infrequently accessed content
   - Enable compression for stored videos
   - Estimated savings: $3-5/month

3. **General Tips**
   - Monitor resource utilization regularly
   - Set up billing alerts
   - Remove unused resources
   - Consider reserved instances for long-term usage

### Cost Scaling Factors

1. **Storage Growth**
   - Additional S3 storage: $0.023/GB
   - Additional backup storage: $0.023/GB
   - Consider implementing video deletion policies

2. **Traffic Increase**
   - Additional data transfer: $0.09/GB
   - Additional load balancer capacity: $10/month per balancer
   - Consider implementing CDN for heavy video traffic

3. **Database Growth**
   - Next tier PostgreSQL (2vCPU, 4GB): +$30/month
   - Next tier Redis (2vCPU, 4GB): +$30/month
   - Consider implementing data archival strategies

### Break-even Analysis

Based on these costs, the platform would need:
- 100 active users watching 10 videos/day
- Average video size of 5MB
- 30% user engagement rate
- $1/user/month revenue

To break even at ~$104/month infrastructure cost.

## Additional Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [DigitalOcean Kubernetes Guide](https://www.digitalocean.com/docs/kubernetes)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3)

## MVP and Validation Environment

### MVP Infrastructure Costs (Free Tier & Minimal Paid Services)

#### Free Tier Resources

1. **AWS Free Tier**
   - S3: 5GB storage
   - 20,000 GET requests
   - 2,000 PUT requests
   - Free for 12 months

2. **Railway.app Free Tier**
   - PostgreSQL: 1GB storage
   - Redis: 30MB cache
   - Deployment: 500 hours/month
   - $5 credit monthly

3. **Vercel Hobby Plan (Frontend)**
   - Free hosting
   - Automatic deployments
   - Basic analytics

#### Minimal Paid Services (When Free Tier Exceeds)

1. **Railway.app Starter**
   - $5/month for basic compute
   - PostgreSQL: $5/month
   - Redis: $5/month
   - Total: $15/month

2. **AWS S3 Minimal Usage**
   - Storage (10GB): $0.23/month
   - Basic requests: $0.50/month
   - Data transfer: $1/month
   - Total: ~$2/month

**Total MVP Monthly Cost: ~$17/month**

### Validation Environment Setup

Create a new file `scripts/deploy-validation.sh`:
```bash
#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env.validation ]; then
    export $(cat .env.validation | grep -v '^#' | xargs)
fi

echo "Deploying to validation environment..."

# 1. Set up Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize Railway project
railway init

# 4. Create PostgreSQL instance
railway add postgresql

# 5. Create Redis instance
railway add redis

# 6. Deploy backend
railway up

# 7. Get deployment URL
BACKEND_URL=$(railway domain)

# 8. Configure AWS S3 with minimal settings
aws s3 mb s3://$S3_BUCKET_VALIDATION --region $AWS_REGION
aws s3api put-bucket-cors --bucket $S3_BUCKET_VALIDATION --cors-configuration file://validation-cors.json

# 9. Update frontend environment
cd ../world-social
cat > .env.validation << EOF
NEXT_PUBLIC_API_URL=$BACKEND_URL
NEXT_PUBLIC_ENVIRONMENT=validation
EOF

# 10. Deploy frontend to Vercel
vercel --env .env.validation
```

Create `.env.validation`:
```bash
# Database (Railway.app)
DATABASE_URL=postgresql://$RAILWAY_POSTGRESQL_URL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$RAILWAY_POSTGRESQL_PASSWORD
POSTGRES_DB=worldsocial

# Redis (Railway.app)
REDIS_URL=$RAILWAY_REDIS_URL

# AWS S3 (Free Tier)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_VALIDATION=world-social-validation

# JWT
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRATION=24h

# API
PORT=3000
NODE_ENV=validation
```

### Resource Optimization for Validation

1. **Storage Optimization**
   - Implement video compression
   - Set 5MB maximum video size
   - Auto-delete videos after 7 days
   - Implement lazy loading

2. **Database Optimization**
   - Use connection pooling
   - Implement query caching
   - Regular cleanup of old data
   - Index optimization

3. **Caching Strategy**
   - Aggressive Redis caching
   - Browser caching for static content
   - CDN caching when possible

### Validation Environment Monitoring

1. **Free Monitoring Tools**
   - Railway.app built-in metrics
   - AWS CloudWatch free tier
   - Vercel analytics
   - Custom logging

2. **Performance Metrics**
   - Response times
   - Error rates
   - Resource usage
   - User engagement

### Scaling from Validation to Production

1. **Traffic Thresholds**
   - 1000 DAU: Stay on validation setup
   - 1000-5000 DAU: Hybrid setup
   - 5000+ DAU: Full production setup

2. **Cost Triggers**
   - S3 storage > 5GB
   - Database size > 1GB
   - Redis cache > 30MB
   - CPU usage > 70%

3. **Migration Path**
   ```mermaid
   graph TD
   A[Validation] --> B[Hybrid]
   B --> C[Production]
   ``` 