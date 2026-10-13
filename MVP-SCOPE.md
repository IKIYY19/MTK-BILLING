# MikroTik Billing MVP Scope

## Phase 1: PPPoE-first production MVP

Enabled capabilities:

- Tenant and administrator authentication
- Customer records
- Service plans with speed, quota, price, and validity
- Customer subscriptions
- Invoice and payment records
- MikroTik RouterOS API linking
- Router diagnostics and connectivity monitoring
- FreeRADIUS authentication and accounting
- PPPoE session monitoring
- Automatic suspension for expired or unpaid subscriptions
- PostgreSQL persistence
- Audit logging

Deferred until the PPPoE workflow is production-tested:

- Paid Hotspot captive portal
- Voucher sales
- Multi-provider payment automation
- OLT provisioning
- TR-069 device management
- Reseller workflows
- Advanced CGNAT automation

## Next implementation session: real-router acceptance test

Follow this sequence in order:

### Connect a real MikroTik router

- Use a LAN IP or public HTTPS URL, not `localhost`.
- Enable the RouterOS API on port `8728`.
- Run the generated Router Link script.

### Verify router registration

- Confirm the router appears in the dashboard.
- Confirm its NAS record exists in PostgreSQL.
- Run router diagnostics.

### Create the PPPoE service

- Create a service plan with upload and download limits.
- Create a customer.
- Create an active PPPoE subscription with username and password.
- Synchronize the subscription to RADIUS.

### Test RADIUS authentication

- Confirm the username appears in `radcheck`.
- Configure the router PPPoE server to use RADIUS.
- Test a real PPPoE client login.

### Test accounting and enforcement

- Confirm sessions appear in `radacct`.
- Confirm upload and download usage is recorded.
- Test speed limits.
- Test subscription suspension.
- Test service restoration after payment.

### Prepare production

- Configure a public domain and HTTPS.
- Rotate all local credentials.
- Add PostgreSQL backups.
- Restrict RouterOS API and RADIUS access with firewall rules.
- Add a staging-to-production deployment process.
