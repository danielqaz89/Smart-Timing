#!/bin/bash

# Test server startup
echo "Testing server startup..."

# Set minimal required env vars for testing
export DATABASE_URL="postgresql://neondb_owner:npg_0Mj7UBhycuDQ@ep-wispy-fog-a40g3y8u-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
export PORT=4000
export JWT_SECRET="test-secret"

# Start server in background
node server.js &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start (PID: $SERVER_PID)..."
sleep 5

# Test health endpoint
echo "Testing health endpoint..."
curl -s http://localhost:4000/api/health | jq . || echo "Health check failed"

echo ""
echo "Testing basic endpoint..."
curl -s http://localhost:4000/api/test | jq . || echo "Basic test failed"

# Kill server
echo ""
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null || true
sleep 2

echo "✅ Test complete"
