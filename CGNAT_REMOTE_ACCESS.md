# WireGuard Remote Access for MikroTik Routers Behind CGNAT

This guide explains how to use the **WireGuard / CGNAT** feature so the billing
server can manage a MikroTik router that has **no public IP** (behind Carrier
Grade NAT). The router initiates an outbound WireGuard tunnel; the server then
reaches the router's API over the tunnel IP.

## Architecture

```
Billing server (Linux VPS, public IP)  <--- WireGuard --->  MikroTik (behind CGNAT)
   WG IP: 10.200.0.1                                        WG IP: 10.200.0.2
   Endpoint: <public-ip>:51820/udp                          initiates outbound
```

> **Important:** the WireGuard server must run on a **Linux host with a public
> IP/DNS** and the `wg` binaries installed. The router connects to this host;
> the billing application can run elsewhere as long as `WG_SERVER_ENDPOINT`
> points to it. For the fully automated flow (automatic peer reload), run the
> billing API on the same VPS as the WireGuard interface.

## 1. Configure the server

Add these to the API server's `.env` (and restart the API):

```env
WG_SERVER_ENDPOINT=<public-ip-or-dns>   # required: public endpoint routers connect to
WG_TUNNEL_SUBNET=10.200.0               # tunnel network (10.200.0.0/24)
WG_TUNNEL_PORT=51820                    # UDP listen port
WG_INTERFACE=wg-billing                 # server interface name
WG_PERSISTENT_KEEPALIVE=25              # router keepalive seconds
```

`WG_SERVER_ENDPOINT` must be a public IP or DNS name (no scheme, no path).
Open UDP `<WG_TUNNEL_PORT>` in the server firewall and forward it to the host.

## 2. Generate the server keypair and setup script

1. Log in to the dashboard and open **Routers → Link Router → WireGuard / NAT**.
2. Click **Sync** or open the tunnel status — this initializes the server keypair.
3. Click **View Server Setup Script**, download the generated bash script.
4. Run it as root on the Linux VPS:

```bash
sudo bash wg-server-setup.sh
```

The script installs `wireguard-tools`, enables IP forwarding, writes
`/etc/wireguard/wg-billing.conf` with the server private key and all current
peers, opens the firewall, and starts/enables the interface.

Verify on the VPS:

```bash
wg show wg-billing
```

## 3. Onboard a router

The fastest path is **Router Link** (one page):

1. Generate/copy your tenant API key if you have not already.
2. Enter the **public HTTPS** server URL (`VITE_PUBLIC_APP_URL`) and add the
   router admin credentials.
3. Switch to **Remote / CGNAT (one command)**, enter a router name, and click
   **Generate one-command remote link script**.
4. Copy the script, paste it once in the router terminal (SSH/WinBox → New
   Terminal) and press Enter. The page starts watching automatically, so the
   router appears as soon as it reports in.

The same flow is also available under **Routers → Link Router → WireGuard / NAT**.
Router scripts are blocked until a public `WG_SERVER_ENDPOINT` is configured and
the WireGuard interface on the server is active; the page shows the exact
blockers. An `http://` server URL is rejected for remote routers unless
`ALLOW_INSECURE_ROUTER_ENROLLMENT=true` is set for a local lab.

The script will:
1. create the WireGuard interface and peer (server public key, endpoint, keepalive),
2. assign the tunnel IP (`10.200.0.x`),
3. enable the MikroTik API service and create the `billing` user,
4. wait for the tunnel, then fetch and import the billing install script using
   the tenant API key. The enrollment URL carries the tunnel IP and router
   public key, so the first check-in automatically adopts the pre-created
   connection and marks the router managed — no manual "Link to Billing" step
   and no manual tunnel-IP entry.

## 4. Verify

Wait ~30 seconds, then:

- In the dashboard, the router should show a recent handshake and appear ONLINE.
- On the VPS: `wg show wg-billing latest-handshakes`
- On the router: `/interface wireguard print` and `/interface wireguard peers print`

The server runs a health-sync every 5 minutes to refresh handshake/online status.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Set WG_SERVER_ENDPOINT..." | Configure the public endpoint in `.env` and restart the API |
| Generate button disabled | The UI shows readiness blockers; follow them (run server setup script on the VPS) |
| No handshake | Check UDP port reachability, endpoint value, and that keys were not regenerated |
| Router API unreachable over tunnel | Confirm the router API service is enabled and the `billing` user exists; ping `10.200.0.1` from the router |

## Keys

WireGuard key pairs are generated server-side with Curve25519/X25519 (`wg genkey`
when available, Node `crypto.generateKeyPairSync('x25519')` otherwise). The
**Settings → WireGuard** tab can also generate a real keypair and stores its
configuration in the database. Never share private keys.
