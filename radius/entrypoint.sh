#!/bin/bash
set -e

echo "Waiting for PostgreSQL to be ready..."
while ! nc -z "${DB_HOST:-postgres}" "${DB_PORT:-5432}"; do
  sleep 1
  echo "Waiting for database connection..."
done
echo "PostgreSQL is ready!"

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&|\\]/\\&/g'
}

DB_HOST_VALUE=$(escape_sed "${DB_HOST:-postgres}")
DB_PORT_VALUE=$(escape_sed "${DB_PORT:-5432}")
DB_USER_VALUE=$(escape_sed "${DB_USER:-postgres}")
DB_PASSWORD_VALUE=$(escape_sed "${DB_PASSWORD:-}")
DB_NAME_VALUE=$(escape_sed "${RADIUS_DB_NAME:-mikrotik_config_builder}")

# Inject database settings into the FreeRADIUS SQL module.
sed -i \
  -e "s|__DB_HOST__|${DB_HOST_VALUE}|g" \
  -e "s|__DB_PORT__|${DB_PORT_VALUE}|g" \
  -e "s|__DB_USER__|${DB_USER_VALUE}|g" \
  -e "s|__DB_PASSWORD__|${DB_PASSWORD_VALUE}|g" \
  -e "s|__RADIUS_DB_NAME__|${DB_NAME_VALUE}|g" \
  /etc/freeradius/mods-available/sql

# Inject the shared secret into the RADIUS client configuration.
if [ -n "${RADIUS_SECRET:-}" ]; then
  SECRET_VALUE=$(escape_sed "${RADIUS_SECRET}")
  sed -i "s|\${ENV:RADIUS_SECRET}|${SECRET_VALUE}|g" /etc/freeradius/clients.conf
fi

if [ "${RUN_RADIUS_MIGRATIONS:-true}" = "true" ]; then
  echo "Running RADIUS database migrations..."
  PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST:-postgres}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER:-postgres}" \
    -d "${RADIUS_DB_NAME:-mikrotik_config_builder}" \
    -f /docker-entrypoint-initdb.d/radius_schema.sql
fi

if [ ! -L /etc/freeradius/mods-enabled/sql ]; then
  ln -s ../mods-available/sql /etc/freeradius/mods-enabled/sql 2>/dev/null || true
fi

exec "$@"
