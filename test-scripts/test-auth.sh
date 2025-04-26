#!/bin/bash

echo "Testing Login Endpoint..."
curl -X POST http://localhost:3000/api/auth/login \
-H "Content-Type: application/json" \
-d '{"worldId": "test-world-id"}'

echo -e "\n\nTesting Registration Endpoint..."
curl -X POST http://localhost:3000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "username": "newuser",
  "worldId": "new-world-id",
  "email": "newuser@example.com",
  "password": "password123"
}' 