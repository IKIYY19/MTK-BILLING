# 🚀 MikroTik Billing Platform

Complete ISP management platform with MikroTik RouterOS integration, billing system, customer portal, and network monitoring.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🔐 Security (NEW!)
- **JWT Authentication** - Secure login for all users
- **Protected API** - All routes require authentication
- **Password Hashing** - Bcrypt with salt
- **Token Management** - Auto-refresh and expiry handling

### 💰 Billing & Invoicing
- Customer management with online status polling
- Service plans (speed, quota, priority)
- Subscription lifecycle management
- Automated invoice generation
- Multiple payment methods (Cash, Bank, M-Pesa, Card)
- M-Pesa STK Push integration
- Customer self-service portal
- Prepaid wallet system
- Auto-suspension for non-payment

### 🌐 Network Management
- **MikroTik API Integration** - Direct router control
- WireGuard tunnel access for MikroTik routers behind CGNAT (requires a Linux
  VPS with a public endpoint; see [CGNAT_REMOTE_ACCESS.md](CGNAT_REMOTE_ACCESS.md))
- PPPoE server management
- Hotspot management with vouchers
- Real-time PPPoE session monitoring
- Network queues and bandwidth management
- DHCP/DNS/Firewall configuration
- FreeRADIUS integration

### 📊 Monitoring & Analytics (IMPROVED!)
- **Real PPPoE monitoring** (no more fake data!)
- **Real bandwidth graphs** with historical data
- **Live network map** with customer locations
- Revenue and churn analytics
- Customer growth tracking
- Financial reports (daily, monthly, debtors, tax)

### 📱 Communication
- SMS notifications via Africa's Talking
- WhatsApp Business integration
- Bulk messaging
- Payment reminders
- Service alerts

### 🎫 Support & Operations
- Ticket system with SLA tracking
- Device inventory management
- Auto backup & restore
- Multi-router support
- Topology builder
- Captive portal designer

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ (or use in-memory mode)

### Option 1: Local Development

```bash
# 1. Clone repository
git clone https://github.com/IKIYY19/Mikrotik-billing.git
cd Mikrotik-billing

# 2. Install workspace dependencies (pnpm is required)
corepack enable
pnpm install

# 3. Configure the initial administrator
cp .env.example .env
# Edit .env and set a unique INITIAL_ADMIN_EMAIL and strong INITIAL_ADMIN_PASSWORD.
# Set DATABASE_URL to use PostgreSQL; without it, data is temporary in memory.

# 4. Start the API and frontend
pnpm dev
```

**Initial administrator:** Configure `INITIAL_ADMIN_EMAIL` and
`INITIAL_ADMIN_PASSWORD` before first startup. The application does not create
a default administrator account. Public self-registration is disabled unless
`ALLOW_PUBLIC_REGISTRATION=true` is explicitly set; when enabled, registration
is limited to the tenant resolved from its configured custom domain and creates
staff accounts only.

### Option 2: Railway Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=Mikrotik-billing)

1. Click button above or go to Railway.app
2. Deploy from GitHub repo
3. Add PostgreSQL database
4. Set environment variables:
   ```env
   JWT_SECRET=<generate-random-64-chars>
   ENCRYPTION_KEY=<generate-random-32-chars>
   INITIAL_ADMIN_EMAIL=<your-admin-email>
   INITIAL_ADMIN_PASSWORD=<unique-strong-password>
   CORS_ORIGIN=https://your-domain.railway.app
   ```
   Railway's PostgreSQL integration supplies `DATABASE_URL`; database migrations
   run automatically when the API starts.

See `railway.json` for the Railway build configuration.

### Option 3: Docker (VPS)

```bash
# Clone repo
git clone https://github.com/IKIYY19/Mikrotik-billing.git
cd Mikrotik-billing

# Setup
cp .env.example .env
# Edit .env with your values

# Deploy
docker compose -f docker-compose.production.yml up --pull always -d --build
```

Use `docker-compose.production.yml` for the VPS deployment.

## 📁 Project Structure

```
Mikrotik-billing/
├── artifacts/
│   ├── api-server/         # Express API, routes, migrations, services, cron jobs
│   └── mikrotik-billing/   # React/Vite frontend
├── lib/                    # Shared API client and libraries
├── scripts/                # Workspace scripts
└── *.md                    # Scope and project documentation
```

## 🔑 API Endpoints

### Authentication
```
POST   /api/auth/register        # Create user account
POST   /api/auth/login           # Login and get JWT token
GET    /api/auth/me              # Get current user (requires auth)
```

### Billing
```
GET    /api/billing/dashboard     # Billing statistics
GET    /api/billing/customers     # List customers
POST   /api/billing/customers     # Create customer
GET    /api/billing/customers/:id # Customer details
PUT    /api/billing/customers/:id # Update customer
DELETE /api/billing/customers/:id # Delete customer

GET    /api/billing/plans         # List service plans
POST   /api/billing/plans         # Create plan

GET    /api/billing/subscriptions # List subscriptions
POST   /api/billing/subscriptions # Create subscription

GET    /api/billing/invoices      # List invoices
POST   /api/billing/invoices      # Create invoice

GET    /api/billing/payments      # List payments
POST   /api/billing/payments      # Record payment

POST   /api/payments/mpesa/stk    # Initiate M-Pesa STK Push
GET    /api/billing/usage/history # Historical bandwidth data
POST   /api/billing/usage/record  # Record bandwidth usage
```

### Network
```
GET    /api/network/pppoe/active   # Active PPPoE sessions
GET    /api/network/hotspot/active # Active hotspot users
GET    /api/features/monitoring/dashboard # Real monitoring data
```

### Paid MikroTik Hotspot Portal

1. In **Billing Plans**, create a plan with service type **Hotspot package**, a whole-KES price, validity in days, upload/download speeds, and an optional data quota.
2. In **Captive Portal Builder**, select the linked MikroTik router and set the public HTTPS URL of this app ending in `/hotspot`. Push the generated login bridge to the router.
3. Allow the hosted portal and API hostnames in the router's Hotspot Walled Garden. The guest must be able to load the page and reach the API before hotspot authentication.
4. Configure M-Pesa with a public callback URL of `https://<your-host>/api/payments/mpesa/callback`. The callback is provider-verified server-to-server before a hotspot user is created.

The hosted page reads the router ID, client MAC/IP, login gateway, and original destination from the RouterOS redirect. It only uses the configured router record for API access; client-supplied IPs are never used as server-side router destinations. A successful provider-confirmed payment creates a MAC-bound RouterOS hotspot account with the selected speed, time, and optional byte limit. Expired users are removed by the API worker; failed router connections remain retryable without requesting another payment.

Public endpoints:
```
GET  /api/captive-hotspot/plans?router_id=<router-uuid>&mac=<client-mac>
POST /api/captive-hotspot/sessions
GET  /api/captive-hotspot/sessions/:token?router_id=<router-uuid>&mac=<client-mac>
POST /api/captive-hotspot/sessions/:token/retry
```

Hotspot session and lifecycle events are stored in PostgreSQL tables `captive_hotspot_sessions` and `captive_hotspot_events`. Review recent tenant events with authenticated `GET /api/captive-portal/hotspot-events?limit=100`. The public paid flow is disabled while the API is using in-memory storage.

### MikroTik Config Builder
```
GET    /api/projects               # List projects
POST   /api/projects               # Create project
POST   /api/generator/generate     # Generate MikroTik script
```

## 🗄️ Database

The app works with **PostgreSQL** or **in-memory storage**:

- **PostgreSQL**: Full persistence, recommended for production
- **In-Memory**: Development/testing, data lost on restart

Migrations run automatically when the production API starts.

## 🔐 Security

- All API routes require JWT authentication
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens expire after 7 days (configurable)
- CORS restricted to your domain
- MikroTik passwords encrypted with AES-256-GCM
- Environment variables for all secrets

## 📊 Monitoring

The app collects real metrics every 5 minutes:
- PPPoE session data from MikroTik routers
- Bandwidth usage per customer
- Online/offline status
- Historical usage trends

Data is stored in `usage_records` table for reporting.

## 🛠️ Tech Stack

**Frontend:**
- React 18
- Vite 5
- TailwindCSS 3
- Zustand (state management)
- Axios (HTTP client)
- React Router 6
- Lucide React (icons)

**Backend:**
- Node.js 18
- Express 4
- PostgreSQL (via `pg`)
- JWT authentication
- mikronode (MikroTik API)
- bcryptjs (password hashing)

**Deployment:**
- Railway.app (recommended)
- Docker Compose
- Dokploy (self-hosted)

## 📈 Roadmap

### Completed ✅
- [x] Authentication system
- [x] Real monitoring data
- [x] Real bandwidth graphs
- [x] Customer management
- [x] Billing & invoicing
- [x] Payment integration
- [x] SMS/WhatsApp notifications
- [x] Network map
- [x] Captive portal designer
- [x] Auto-suspension
- [x] Inventory management

### In Progress 🚧
- [ ] OLT integration (Huawei/ZTE)
- [ ] Email notifications
- [ ] Credit notes
- [ ] Audit logging
- [ ] Configuration versioning

### Planned 📋
- [ ] Mobile app (React Native)
- [ ] Advanced routing
- [ ] AI anomaly detection
- [ ] Multi-tenant resellers
- [ ] White-label branding

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🆘 Support

- **Documentation**: See guides in repository
- **Issues**: Open GitHub issue
- **Discussions**: GitHub Discussions

## ⚠️ Disclaimer

This tool manages critical network infrastructure. Always:
- Test configurations in lab environment first
- Review generated scripts before applying
- Backup router configs regularly
- Use strong passwords for all services
- Keep secrets out of version control

---

**Built with ❤️ for ISPs and Network Engineers**
