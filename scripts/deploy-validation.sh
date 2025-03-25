#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting World Social Validation Environment Deployment...${NC}"

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required but not installed. Installing..."; curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install; }
command -v railway >/dev/null 2>&1 || { echo "Railway CLI is required but not installed. Installing..."; npm install -g @railway/cli; }
command -v vercel >/dev/null 2>&1 || { echo "Vercel CLI is required but not installed. Installing..."; npm install -g vercel; }

# Load environment variables
if [ -f .env.validation ]; then
    export $(cat .env.validation | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env.validation file not found${NC}"
    exit 1
fi

echo "Deploying to validation environment..."

# 1. Configure AWS
echo "Configuring AWS..."
aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
aws configure set default.region $AWS_REGION

# 2. Create S3 bucket with minimal settings
echo "Setting up S3 bucket..."
if ! aws s3 ls "s3://$S3_BUCKET_VALIDATION" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "Bucket already exists"
else
    aws s3 mb "s3://$S3_BUCKET_VALIDATION" --region $AWS_REGION
fi

# Create CORS configuration
cat > validation-cors.json << EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

# Apply CORS configuration
aws s3api put-bucket-cors --bucket $S3_BUCKET_VALIDATION --cors-configuration file://validation-cors.json

# 3. Set up Railway
echo "Setting up Railway..."
railway login
railway init

# 4. Create and configure PostgreSQL
echo "Setting up PostgreSQL..."
railway add postgresql
POSTGRES_URL=$(railway connect postgresql)
export DATABASE_URL=$POSTGRES_URL

# 5. Create and configure Redis
echo "Setting up Redis..."
railway add redis
REDIS_URL=$(railway connect redis)
export REDIS_URL=$REDIS_URL

# 6. Apply database migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# 7. Deploy backend to Railway
echo "Deploying backend..."
railway up
BACKEND_URL=$(railway domain)

# 8. Configure video optimization
echo "Setting up video optimization..."
cat > video-lifecycle-policy.json << EOF
{
    "Rules": [
        {
            "ID": "Delete old videos",
            "Status": "Enabled",
            "ExpirationInDays": 7
        }
    ]
}
EOF

aws s3api put-bucket-lifecycle-configuration --bucket $S3_BUCKET_VALIDATION --lifecycle-configuration file://video-lifecycle-policy.json

# 9. Update frontend configuration
echo "Configuring frontend..."
cd ../world-social
cat > .env.validation << EOF
NEXT_PUBLIC_API_URL=$BACKEND_URL
NEXT_PUBLIC_ENVIRONMENT=validation
NEXT_PUBLIC_MAX_VIDEO_SIZE=5242880
EOF

# 10. Deploy frontend to Vercel
echo "Deploying frontend..."
vercel --env .env.validation

# 11. Set up monitoring
echo "Setting up monitoring..."
# Enable CloudWatch basic monitoring (free tier)
aws cloudwatch put-metric-alarm \
    --alarm-name "ValidationStorageLimit" \
    --alarm-description "Alarm when storage exceeds 4GB" \
    --metric-name "BucketSizeBytes" \
    --namespace "AWS/S3" \
    --statistic "Average" \
    --period 86400 \
    --threshold 4294967296 \
    --comparison-operator "GreaterThanThreshold" \
    --evaluation-periods 1 \
    --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:ValidationAlerts"

# 12. Create cleanup script
cat > cleanup-validation.sh << EOF
#!/bin/bash
# Cleanup old data
aws s3 ls s3://$S3_BUCKET_VALIDATION --recursive | sort -k2 | cut -d' ' -f4 | while read -r key; do
    if [[ \$key =~ .*\.(mp4|mov|avi) ]]; then
        aws s3api head-object --bucket $S3_BUCKET_VALIDATION --key "\$key" --query 'LastModified' | awk -F'T' '{if (\$1 < "'"\$(date -d '7 days ago' +%Y-%m-%d)"'") print \$0}' && aws s3 rm "s3://$S3_BUCKET_VALIDATION/\$key"
    fi
done
EOF

chmod +x cleanup-validation.sh

# 13. Set up cron job for cleanup
(crontab -l 2>/dev/null; echo "0 0 * * * $(pwd)/cleanup-validation.sh") | crontab -

echo -e "${GREEN}Validation environment deployment completed!${NC}"
echo "Backend URL: $BACKEND_URL"
echo "Frontend URL: $(vercel ls --prod | grep world-social | awk '{print $2}')"
echo -e "\nImportant Notes:"
echo "1. Free tier limits: AWS S3 (5GB), Railway (500 hours)"
echo "2. Video size limit: 5MB"
echo "3. Video retention: 7 days"
echo "4. Monitor usage at: Railway dashboard and AWS Console" 