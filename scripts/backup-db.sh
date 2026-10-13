#!/bin/bash
# MikroTik Billing Platform - Database Backup Script
# Usage: ./scripts/backup-db.sh [output-dir]
# Default output directory: ./backups/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

# Load .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
  source "$PROJECT_DIR/.env"
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mikrotik_config_builder}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/mikrotik_billing_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "============================================"
echo " MikroTik Billing - Database Backup"
echo "============================================"
echo " Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo " Backup:   $BACKUP_FILE"
echo "--------------------------------------------"

# Perform backup
if [ -n "$DB_PASSWORD" ]; then
  export PGPASSWORD="$DB_PASSWORD"
fi

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --verbose \
  --no-owner \
  | gzip > "$BACKUP_FILE"

unset PGPASSWORD

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "--------------------------------------------"
  echo " ✅ Backup complete: $FILE_SIZE"
  echo "    $BACKUP_FILE"
else
  echo " ❌ Backup failed!"
  exit 1
fi

# Cleanup old backups
echo "--------------------------------------------"
echo " Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "mikrotik_billing_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
echo " ✅ Cleanup complete"

echo "============================================"
