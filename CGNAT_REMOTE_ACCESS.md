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

In **Routers → Link Router → WireGuard / NAT**:

- Enter a router name, an API password (the script creates a `billing` API user
  on the router), the API port (default 8728), and confirm the server URL and
  tenant API key.
- Click **Generate Link Script** and copy the one-line RouterOS script.
- Paste it once in the router terminal (SSH/WinBox → New Terminal) and press Enter.

The script will:
1. create the WireGuard interface and peer (server public key, endpoint, keepalive),
2. assign the tunnel IP (`10.200.0.x`),
3. enable the MikroTik API service and create the `billing` user,
4. wait for the tunnel, then fetch and import the billing install script using
   the tenant API key.

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
