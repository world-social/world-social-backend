#!/bin/bash

# Stop any running containers
docker-compose down

# Start all required services
docker-compose up -d redis minio postgres

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
until docker-compose exec redis redis-cli ping > /dev/null 2>&1; do
  echo "Waiting for Redis..."
  sleep 1
done

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
until curl -s http://localhost:9000/minio/health/live > /dev/null; do
  echo "Waiting for MinIO..."
  sleep 1
done

# Kill any process using port 3000
echo "Checking for processes using port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Run the application in development mode
REDIS_URL=redis://localhost:6379 \
MINIO_ENDPOINT=localhost \
MINIO_PORT=9000 \
MINIO_ACCESS_KEY=minioadmin \
MINIO_SECRET_KEY=minioadmin \
MINIO_BUCKET=socialworldworldcoin \
pnpm dev 