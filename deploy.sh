#!/bin/bash
set -euo pipefail

COMPOSE="docker compose"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Set production values before continuing."
fi

$COMPOSE up --pull always -d --build
$COMPOSE ps
