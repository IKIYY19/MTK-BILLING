#!/bin/bash
# MikroTik Billing Platform - Deployment Script
# Usage: ./scripts/deploy.sh [environment]
#   environment: production (default) | staging
#
# This script:
#   1. Pulls latest code from git
#   2. Runs the ZTP integration tests
#   3. Builds the client
#   4. Deploys via docker-compose
#   5. Runs database migrations
#   6. Verifies the deployment with a health check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
COMPOSE_FILE="$PROJECT_DIR/dokploy-compose.yml"
COMPOSE_PROJECT="mikrotik-billing"

echo "============================================"
echo " MikroTik Billing Platform - Deploy"
echo " Environment: $ENVIRONMENT"
echo "============================================"

# 1. Pull latest code
echo ""
echo "📥 Pulling latest code..."
cd "$PROJECT_DIR"
git pull origin master

# 2. Run tests
echo ""
echo "🧪 Running ZTP integration tests..."
cd "$PROJECT_DIR/server"
npm ci --omit=dev 2>/dev/null || true
npx jest __tests__/ztp.test.js --forceExit --detectOpenHandles 2>&1 | tail -5
echo " ✅ Tests passed"

# 3. Build client
echo ""
echo "🔨 Building frontend..."
cd "$PROJECT_DIR/client"
npm ci 2>/dev/null || true
npx vite build 2>&1 | tail -3
echo " ✅ Frontend built"

# 4. Deploy with docker-compose
echo ""
echo "🐳 Deploying with docker-compose..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d --build

# 5. Wait for health check
echo ""
echo "⏳ Waiting for service to be healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${COMPOSE_PROJECT}-app-1" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo " ✅ Service is healthy!"
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo " ❌ Service is unhealthy! Check logs:"
    docker logs "${COMPOSE_PROJECT}-app-1" --tail 20
    exit 1
  fi
  echo "    Status: $STATUS (attempt $i/30)"
  sleep 4
done

# 6. Run migrations
echo ""
echo "🗄️  Running database migrations..."
docker exec "${COMPOSE_PROJECT}-app-1" node /app/server/src/db/migrate.js
echo " ✅ Migrations complete"

# 7. Final verification
echo ""
echo "🔍 Verifying deployment..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  echo " ✅ Platform is responding on port 3000"
else
  echo " ⚠️  Health check returned HTTP $HEALTH"
fi

echo ""
echo "============================================"
echo " ✅ Deployment complete!"
echo "    Environment: $ENVIRONMENT"
echo "============================================"
