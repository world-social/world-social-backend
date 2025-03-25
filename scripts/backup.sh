#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Set backup directory
BACKUP_DIR="/backups/world-social"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL database
echo "Backing up PostgreSQL database..."
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER $DB_NAME > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Backup Redis data
echo "Backing up Redis data..."
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD --rdb "$BACKUP_DIR/redis_backup_$TIMESTAMP.rdb"

# Backup S3/MinIO data
echo "Backing up storage data..."
if [ "$NODE_ENV" = "production" ]; then
    # AWS S3 backup
    aws s3 sync s3://$S3_BUCKET "$BACKUP_DIR/storage_$TIMESTAMP"
else
    # MinIO backup
    mc mirror minio/$MINIO_BUCKET "$BACKUP_DIR/storage_$TIMESTAMP"
fi

# Compress backups
echo "Compressing backups..."
tar -czf "$BACKUP_DIR/full_backup_$TIMESTAMP.tar.gz" \
    "$BACKUP_DIR/db_backup_$TIMESTAMP.sql" \
    "$BACKUP_DIR/redis_backup_$TIMESTAMP.rdb" \
    "$BACKUP_DIR/storage_$TIMESTAMP"

# Upload to backup storage
if [ "$NODE_ENV" = "production" ]; then
    echo "Uploading backup to S3..."
    aws s3 cp "$BACKUP_DIR/full_backup_$TIMESTAMP.tar.gz" "s3://$BACKUP_BUCKET/"
fi

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup completed successfully!" 