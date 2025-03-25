#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Please provide the backup file path"
    exit 1
fi

BACKUP_FILE=$1
TEMP_DIR="/tmp/world-social-restore"
mkdir -p "$TEMP_DIR"

echo "Extracting backup..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Restore PostgreSQL database
echo "Restoring PostgreSQL database..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER $DB_NAME < "$TEMP_DIR/db_backup_*.sql"

# Restore Redis data
echo "Restoring Redis data..."
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD FLUSHALL
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD --rdb "$TEMP_DIR/redis_backup_*.rdb"

# Restore storage data
echo "Restoring storage data..."
if [ "$NODE_ENV" = "production" ]; then
    # AWS S3 restore
    aws s3 sync "$TEMP_DIR/storage_*" "s3://$S3_BUCKET"
else
    # MinIO restore
    mc mirror "$TEMP_DIR/storage_*" "minio/$MINIO_BUCKET"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo "Restore completed successfully!" 