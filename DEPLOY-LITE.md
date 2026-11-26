# Lite deployment (no TR-069)

Runs the full billing stack **without GenieACS / Mongo / Redis**, so it fits on a
2–4 GB RAM VPS. Includes Caddy for automatic HTTPS.

## What runs
- `postgres` — billing + RADIUS tables
- `radius` — FreeRADIUS (UDP 1812 / 1813 / 3799)
- `app` — API + built frontend on port 5000, WireGuard on UDP 51820
- `caddy` — reverse proxy on TCP 80/443 with automatic Let's Encrypt certificate

TR-069 pages in the UI will be non-functional; everything else works normally.

## VPS requirements
- 2 vCPU / 4 GB RAM / 40 GB SSD (2 GB RAM works if you add a 2 GB swap file)
- KVM/Xen with `/dev/net/tun` and `NET_ADMIN` (WireGuard needs these)
- Public static IPv4
- Ubuntu 22.04/24.04, Docker Engine + Compose plugin

## Open firewall ports
| Port | Purpose |
|---|---|
| TCP 80, 443 | HTTP → HTTPS redirect, portal + API |
| UDP 1812, 1813 | RADIUS authentication + accounting from routers |
| UDP 3799 | CoA / PoD |
| UDP 51820 | WireGuard (routers behind CGNAT) |
| TCP 22 | SSH (restrict to your IP) |

Do **not** expose port 5000 publicly — Caddy proxies to it internally.

## Deploy
```bash
git clone https://github.com/IKIYY19/MTK-BILLING.git
cd MTK-BILLING
cp .env.example .env
# Edit .env: DOMAIN, DB_PASSWORD, RADIUS_SECRET, JWT_SECRET,
# ENCRYPTION_KEY, INITIAL_ADMIN_EMAIL/PASSWORD, CORS_ORIGIN, APP_URL.
# Point DOMAIN's DNS A record at this VPS before starting Caddy.

docker compose -f docker-compose.lite.yml up -d --build
docker compose -f docker-compose.lite.yml logs -f app
```

Health check: `curl -I https://$DOMAIN/api/health` → `200`.

## Router / RADIUS setup
Register each router as a FreeRADIUS client in the app (RADIUS → NAS clients)
using the VPS public IP and the same `RADIUS_SECRET`. On each MikroTik:

```routeros
/radius add address=<VPS_PUBLIC_IP> service=ppp,hotspot \
    secret=<RADIUS_SECRET> authentication-port=1812 accounting-port=1813
/ppp aaa set use-radius=yes accounting=yes
/ip hotspot profile set <profile> use-radius=yes
```

Routers behind CGNAT should use the WireGuard one-command script from
**Router Link**; set `WG_SERVER_ENDPOINT` to the VPS public IP/domain.

## Backups
```bash
# Daily database dump (add to crontab)
docker compose -f docker-compose.lite.yml exec -T postgres \
  pg_dump -U postgres mikrotik_config_builder | gzip > /backup/db-$(date +%F).sql.gz
```
Also snapshot the Docker volumes: `pgdata`, `wg-config`, `caddy-data`, `caddy-config`.

## Restoring the full stack
The original `docker-compose.yml` (with TR-069) is unchanged:
```bash
docker compose -f docker-compose.yml up -d --build
```
