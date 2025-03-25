#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting deployment process...${NC}"

# 1. Initialize Terraform
echo "Initializing Terraform..."
cd terraform
terraform init

# 2. Apply Terraform configuration
echo "Applying Terraform configuration..."
terraform apply -auto-approve

# 3. Get infrastructure outputs
BUCKET_NAME=$(terraform output -raw s3_bucket_name)
DB_HOST=$(terraform output -raw postgres_host)
REDIS_HOST=$(terraform output -raw redis_host)
K8S_CLUSTER=$(terraform output -raw k8s_cluster_id)

# 4. Configure kubectl
echo "Configuring kubectl..."
doctl kubernetes cluster kubeconfig save $K8S_CLUSTER

# 5. Deploy Kubernetes resources
echo "Deploying Kubernetes resources..."
cd ../k8s
kubectl apply -f video-processor.yaml

# 6. Update backend configuration
echo "Updating backend configuration..."
cat > ../.env.production << EOF
DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@${DB_HOST}:5432/worldsocial
REDIS_URL=redis://${REDIS_HOST}:6379
S3_BUCKET=${BUCKET_NAME}
EOF

# 7. Build and push backend Docker image
echo "Building and pushing backend Docker image..."
docker build -t world-social-backend .
docker tag world-social-backend registry.digitalocean.com/world-social/backend:latest
docker push registry.digitalocean.com/world-social/backend:latest

# 8. Deploy backend to Kubernetes
kubectl apply -f backend-deployment.yaml

# 9. Get backend service URL
BACKEND_URL=$(kubectl get service backend -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# 10. Update frontend configuration and deploy to Vercel
echo "Deploying frontend to Vercel..."
cd ../../world-social
cat > .env.production << EOF
NEXT_PUBLIC_API_URL=https://${BACKEND_URL}
NEXT_PUBLIC_ENVIRONMENT=production
EOF

vercel --prod

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo "Backend URL: https://${BACKEND_URL}"
echo "Frontend URL: $(vercel ls --prod | grep world-social | awk '{print $2}')" 