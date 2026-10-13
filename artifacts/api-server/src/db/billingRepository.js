/**
 * PostgreSQL Billing Repository
 * Replaces the in-memory billingStore.js
 */

const db = require("../db");
const { v4: uuidv4 } = require("uuid");
const { sanitizeAuditData } = require("../utils/audit");

// ─── CUSTOMERS ───
const customers = {
  async list({ page = 1, limit = 20, search = "", status = "" } = {}) {
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let paramIdx = 1;

    if (search) {
      where.push(
        `(LOWER(name) LIKE LOWER($${paramIdx}) OR LOWER(email) LIKE LOWER($${paramIdx}) OR phone LIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (status) {
      where.push(`status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await db.query(
      `SELECT COUNT(*) FROM customers ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await db.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM subscriptions WHERE customer_id = c.id) as subscription_count,
        (SELECT COALESCE(SUM(i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0)
         FROM invoices i WHERE i.customer_id = c.id AND i.status != 'paid') as outstanding_balance
       FROM customers c ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { data: dataRes.rows, total, page, limit };
  },

  async findById(id) {
    const customer = await db.query("SELECT * FROM customers WHERE id = $1", [
      id,
    ]);
    if (customer.rows.length === 0) {return null;}
    return customer.rows[0];
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO customers (id, name, email, phone, address, city, country, lat, lng, id_number, status, notes, account_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        id,
        data.name,
        data.email || "",
        data.phone || "",
        data.address || "",
        data.city || "",
        data.country || "",
        data.lat || null,
        data.lng || null,
        data.id_number || "",
        data.status || "active",
        data.notes || "",
        data.account_number || null,
      ],
    );
    if (userId)
      {await audit.log(userId, "create", "customer", id, null, result.rows[0]);}
    return result.rows[0];
  },

  async update(id, data, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const result = await db.query(
      `UPDATE customers SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
       address = COALESCE($4, address), city = COALESCE($5, city), country = COALESCE($6, country),
       lat = COALESCE($7, lat), lng = COALESCE($8, lng), id_number = COALESCE($9, id_number),
       status = COALESCE($10, status), notes = COALESCE($11, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 RETURNING *`,
      [
        data.name,
        data.email,
        data.phone,
        data.address,
        data.city,
        data.country,
        data.lat,
        data.lng,
        data.id_number,
        data.status,
        data.notes,
        id,
      ],
    );
    if (userId)
      {await audit.log(
        userId,
        "update",
        "customer",
        id,
        existing,
        result.rows[0],
      );}
    return result.rows[0];
  },

  async delete(id, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    await db.query("DELETE FROM customers WHERE id = $1", [id]);
    if (userId)
      {await audit.log(userId, "delete", "customer", id, existing, null);}
    return existing;
  },
};

// ─── SERVICE PLANS ───
const plans = {
  async list() {
    const result = await db.query(
      `SELECT sp.*,
        (SELECT COUNT(*) FROM subscriptions WHERE plan_id = sp.id AND status = 'active') as active_subscribers
       FROM service_plans sp WHERE sp.is_active = true ORDER BY price ASC`,
    );
    return result.rows;
  },

  async findById(id) {
    const result = await db.query("SELECT * FROM service_plans WHERE id = $1", [
      id,
    ]);
    return result.rows[0] || null;
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO service_plans (
         id, name, speed_up, speed_down, price, quota_gb, priority, description,
         is_active, plan_type, validity_days, tenant_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        id,
        data.name,
        data.speed_up,
        data.speed_down,
        data.price,
        data.quota_gb || null,
        data.priority || 8,
        data.description || "",
        data.is_active !== false,
        data.plan_type || "monthly",
        data.validity_days || 30,
        data.tenant_id || null,
      ],
    );
    if (userId)
      {await audit.log(userId, "create", "plan", id, null, result.rows[0]);}
    return result.rows[0];
  },

  async update(id, data, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const result = await db.query(
      `UPDATE service_plans SET name = COALESCE($1, name), speed_up = COALESCE($2, speed_up),
       speed_down = COALESCE($3, speed_down), price = COALESCE($4, price), quota_gb = COALESCE($5, quota_gb),
       priority = COALESCE($6, priority), description = COALESCE($7, description),
       is_active = COALESCE($8, is_active), plan_type = COALESCE($9, plan_type),
       validity_days = COALESCE($10, validity_days), tenant_id = COALESCE($11, tenant_id)
       WHERE id = $12 RETURNING *`,
      [
        data.name,
        data.speed_up,
        data.speed_down,
        data.price,
        data.quota_gb,
        data.priority,
        data.description,
        data.is_active,
        data.plan_type,
        data.validity_days,
        data.tenant_id,
        id,
      ],
    );
    if (userId)
      {await audit.log(userId, "update", "plan", id, existing, result.rows[0]);}
    return result.rows[0];
  },

  async delete(id, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    await db.query("UPDATE service_plans SET is_active = false WHERE id = $1", [
      id,
    ]);
    if (userId) {await audit.log(userId, "delete", "plan", id, existing, null);}
    return existing;
  },
};

// ─── SUBSCRIPTIONS ───
const subscriptions = {
  async list({ page = 1, limit = 20, status = "" } = {}) {
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      where.push(`s.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await db.query(
      `SELECT COUNT(*) FROM subscriptions s ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await db.query(
      `SELECT s.*, c.name as customer_name, c.email as customer_email,
        sp.name as plan_name, sp.speed_up, sp.speed_down, sp.price as plan_price,
        r.name as router_name,
        mc.id as mikrotik_connection_id,
        mc.name as mikrotik_connection_name,
        mc.ip_address as mikrotik_connection_ip
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       LEFT JOIN routers r ON r.id = s.router_id
       LEFT JOIN mikrotik_connections mc ON mc.id = s.mikrotik_connection_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { data: result.rows, total, page, limit };
  },

  async findById(id) {
    const result = await db.query(
      `SELECT s.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        sp.name as plan_name, sp.speed_up, sp.speed_down, sp.price as plan_price, sp.priority as plan_priority,
        r.name as router_name,
        mc.id as mikrotik_connection_id,
        mc.name as mikrotik_connection_name,
        mc.ip_address as mikrotik_connection_ip
       FROM subscriptions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       LEFT JOIN routers r ON r.id = s.router_id
       LEFT JOIN mikrotik_connections mc ON mc.id = s.mikrotik_connection_id
       WHERE s.id = $1`,
      [id],
    );
    return result.rows[0] || null;
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO subscriptions (id, customer_id, plan_id, router_id, mikrotik_connection_id, pppoe_username, pppoe_password,
       mac_address, mac_binding_enabled, pppoe_profile, status, start_date, end_date, billing_cycle, auto_provision, last_synced_at, last_sync_status, last_sync_error, last_radius_sync_status, last_radius_sync_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`,
      [
        id,
        data.customer_id,
        data.plan_id,
        data.router_id || null,
        data.mikrotik_connection_id || null,
        data.pppoe_username || "",
        data.pppoe_password || "",
        data.mac_address || "",
        data.mac_binding_enabled || false,
        data.pppoe_profile || null,
        data.status || "active",
        data.start_date || new Date().toISOString().split("T")[0],
        data.end_date || null,
        data.billing_cycle || "monthly",
        data.auto_provision !== false,
        data.last_synced_at || null,
        data.last_sync_status || null,
        data.last_sync_error || null,
        data.last_radius_sync_status || null,
        data.last_radius_sync_error || null,
      ],
    );
    if (userId)
      {await audit.log(
        userId,
        "create",
        "subscription",
        id,
        null,
        result.rows[0],
      );}
    return result.rows[0];
  },

  async update(id, data, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const result = await db.query(
      `UPDATE subscriptions SET status = COALESCE($1, status), pppoe_username = COALESCE($2, pppoe_username),
       pppoe_password = COALESCE($3, pppoe_password), mac_address = COALESCE($4, mac_address),
       mac_binding_enabled = COALESCE($5, mac_binding_enabled), billing_cycle = COALESCE($6, billing_cycle),
       auto_provision = COALESCE($7, auto_provision), end_date = COALESCE($8, end_date),
       mikrotik_connection_id = COALESCE($9, mikrotik_connection_id), router_id = COALESCE($10, router_id),
       pppoe_profile = COALESCE($11, pppoe_profile), last_synced_at = COALESCE($12, last_synced_at),
       last_sync_status = COALESCE($13, last_sync_status), last_sync_error = $14,
       last_radius_sync_status = COALESCE($15, last_radius_sync_status), last_radius_sync_error = $16,
       updated_at = CURRENT_TIMESTAMP WHERE id = $17 RETURNING *`,
      [
        data.status,
        data.pppoe_username,
        data.pppoe_password,
        data.mac_address,
        data.mac_binding_enabled,
        data.billing_cycle,
        data.auto_provision,
        data.end_date,
        data.mikrotik_connection_id,
        data.router_id,
        data.pppoe_profile,
        data.last_synced_at,
        data.last_sync_status,
        data.last_sync_error !== undefined
          ? data.last_sync_error
          : existing.last_sync_error,
        data.last_radius_sync_status || null,
        data.last_radius_sync_error !== undefined
          ? data.last_radius_sync_error
          : existing.last_radius_sync_error,
        id,
      ],
    );
    if (userId)
      {await audit.log(
        userId,
        "update",
        "subscription",
        id,
        existing,
        result.rows[0],
      );}
    return result.rows[0];
  },

  async toggleStatus(id, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const newStatus = existing.status === "active" ? "suspended" : "active";
    const result = await db.query(
      `UPDATE subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [newStatus, id],
    );
    if (userId)
      {await audit.log(
        userId,
        "toggle_status",
        "subscription",
        id,
        { status: existing.status },
        { status: newStatus },
      );}
    return result.rows[0];
  },

  async suspendOverdue() {
    // Suspend subscriptions where customer has overdue invoices
    const result = await db.query(
      `UPDATE subscriptions SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND customer_id IN (
         SELECT DISTINCT i.customer_id FROM invoices i
         WHERE i.status != 'paid' AND i.due_date < CURRENT_DATE
       ) AND auto_provision = true
       RETURNING *`,
    );
    return result.rows;
  },

  async delete(id, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const result = await db.query(
      "DELETE FROM subscriptions WHERE id = $1 RETURNING *",
      [id],
    );
    if (userId)
      {await audit.log(userId, "delete", "subscription", id, existing, null);}
    return result.rows[0];
  },
};

// ─── INVOICES ───
const invoices = {
  async generateNumber() {
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const result = await db.query(
      `SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE $1`,
      [`${prefix}%`],
    );
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(4, "0")}`;
  },

  async list({ page = 1, limit = 20, status = "", customer_id = "" } = {}) {
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      where.push(`i.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (customer_id) {
      where.push(`i.customer_id = $${paramIdx}`);
      params.push(customer_id);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await db.query(
      `SELECT COUNT(*) FROM invoices i ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await db.query(
      `SELECT i.*, c.name as customer_name, c.email as customer_email,
        COALESCE(SUM(p.amount), 0) as paid_amount,
        (i.total - COALESCE(SUM(p.amount), 0)) as balance
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN payments p ON p.invoice_id = i.id
       ${whereClause}
       GROUP BY i.id, c.id
       ORDER BY i.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { data: result.rows, total, page, limit };
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const invoiceNumber = await this.generateNumber();

    // Get tax rate
    const taxRes = await db.query(
      "SELECT rate FROM tax_rates WHERE is_default = true AND is_active = true LIMIT 1",
    );
    const taxRate =
      taxRes.rows.length > 0 ? parseFloat(taxRes.rows[0].rate) : 0;
    const tax =
      data.tax !== undefined ? data.tax : (data.amount * taxRate) / 100;
    const total = parseFloat(data.amount) + parseFloat(tax);

    const result = await db.query(
      `INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, amount, tax, tax_rate, total, due_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id,
        invoiceNumber,
        data.customer_id,
        data.subscription_id || null,
        data.amount,
        tax,
        taxRate,
        total,
        data.due_date ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        data.status || "pending",
        data.notes || "",
      ],
    );
    if (userId)
      {await audit.log(userId, "create", "invoice", id, null, result.rows[0]);}
    return result.rows[0];
  },

  async update(id, data, userId = null) {
    const existing = await this.findById(id);
    if (!existing) {return null;}
    const result = await db.query(
      `UPDATE invoices SET status = COALESCE($1, status), notes = COALESCE($2, notes),
       due_date = COALESCE($3, due_date), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [data.status, data.notes, data.due_date, id],
    );
    if (userId)
      {await audit.log(
        userId,
        "update",
        "invoice",
        id,
        existing,
        result.rows[0],
      );}
    return result.rows[0];
  },

  async findById(id) {
    const result = await db.query(
      `SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        c.address as customer_address, c.city as customer_city
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = $1`,
      [id],
    );
    return result.rows[0] || null;
  },

  async generateMonthly(userId = null) {
    const activeSubs = await db.query(
      `SELECT s.*, c.name as customer_name, sp.price as plan_price, sp.name as plan_name
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans sp ON sp.id = s.plan_id
       WHERE s.status = 'active'`,
    );

    const created = [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    for (const sub of activeSubs.rows) {
      // Skip if invoice already exists for this month
      const existing = await db.query(
        `SELECT id FROM invoices WHERE customer_id = $1 AND EXTRACT(MONTH FROM created_at) = $2 AND EXTRACT(YEAR FROM created_at) = $3`,
        [sub.customer_id, thisMonth + 1, thisYear],
      );
      if (existing.rows.length > 0) {continue;}

      const invoice = await this.create(
        {
          customer_id: sub.customer_id,
          subscription_id: sub.id,
          amount: sub.plan_price || 0,
          notes: `Monthly invoice for ${sub.plan_name || "service"}`,
        },
        userId,
      );
      created.push(invoice);
    }

    return created;
  },

  async getOverdue() {
    const result = await db.query(
      `SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status != 'paid' AND i.due_date < CURRENT_DATE
       ORDER BY i.due_date ASC`,
    );
    return result.rows;
  },

  async getByDueDate(dueDate) {
    const result = await db.query(
      `SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status != 'paid' AND i.due_date = $1
       ORDER BY i.due_date ASC`,
      [dueDate],
    );
    return result.rows;
  },
};

// ─── PAYMENTS ───
const payments = {
  async generateReceiptNumber() {
    const now = new Date();
    const prefix = `RCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const result = await db.query(
      `SELECT COUNT(*) FROM payments WHERE receipt_number LIKE $1`,
      [`${prefix}%`],
    );
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(4, "0")}`;
  },

  async list({ page = 1, limit = 20, customer_id = "" } = {}) {
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let paramIdx = 1;

    if (customer_id) {
      where.push(`p.customer_id = $${paramIdx}`);
      params.push(customer_id);
      paramIdx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countRes = await db.query(
      `SELECT COUNT(*) FROM payments p ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await db.query(
      `SELECT p.*, c.name as customer_name, i.invoice_number
       FROM payments p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN invoices i ON i.id = p.invoice_id
       ${whereClause}
       ORDER BY p.received_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { data: result.rows, total, page, limit };
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const receiptNumber = await this.generateReceiptNumber();

    const result = await db.query(
      `INSERT INTO payments (id, invoice_id, customer_id, amount, method, reference, receipt_number, gateway_transaction_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        id,
        data.invoice_id,
        data.customer_id,
        data.amount,
        data.method || "cash",
        data.reference || "",
        receiptNumber,
        data.gateway_transaction_id || null,
        data.notes || "",
      ],
    );

    // Update invoice status
    const paymentTotal = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE invoice_id = $1`,
      [data.invoice_id],
    );
    const invoice = await db.query("SELECT total FROM invoices WHERE id = $1", [
      data.invoice_id,
    ]);
    if (invoice.rows.length > 0) {
      const paid = parseFloat(paymentTotal.rows[0].total);
      const total = parseFloat(invoice.rows[0].total);
      const newStatus =
        paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
      await db.query(
        "UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [newStatus, data.invoice_id],
      );
    }

    if (userId)
      {await audit.log(userId, "create", "payment", id, null, result.rows[0]);}

    // Trigger notification
    await notifications.trigger("payment_received", {
      customer_id: data.customer_id,
      payment: result.rows[0],
    });

    return result.rows[0];
  },

  async update(id, data, userId = null) {
    const current = await db.query(
      "SELECT * FROM payments WHERE id = $1 LIMIT 1",
      [id],
    );
    if (current.rows.length === 0) {return null;}

    const existing = current.rows[0];
    const result = await db.query(
      `UPDATE payments
       SET status = COALESCE($1, status),
           reference = COALESCE($2, reference),
           notes = COALESCE($3, notes),
           gateway_transaction_id = COALESCE($4, gateway_transaction_id),
           refund_amount = COALESCE($5, refund_amount),
           refund_reference = COALESCE($6, refund_reference),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        data.status ?? null,
        data.reference ?? null,
        data.notes ?? null,
        data.gateway_transaction_id ?? null,
        data.refund_amount ?? null,
        data.refund_reference ?? null,
        id,
      ],
    );

    if (userId) {
      await audit.log(
        userId,
        "update",
        "payment",
        id,
        existing,
        result.rows[0],
      );
    }

    return result.rows[0];
  },
};

// ─── CREDIT NOTES ───
const creditNotes = {
  async generateNumber() {
    const now = new Date();
    const prefix = `CN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const result = await db.query(
      `SELECT COUNT(*) FROM credit_notes WHERE credit_note_number LIKE $1`,
      [`${prefix}%`],
    );
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(4, "0")}`;
  },

  async create(data, userId = null) {
    const id = uuidv4();
    const number = await this.generateNumber();

    const result = await db.query(
      `INSERT INTO credit_notes (id, credit_note_number, invoice_id, customer_id, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        id,
        number,
        data.invoice_id || null,
        data.customer_id,
        data.amount,
        data.reason || "",
        data.status || "pending",
      ],
    );

    // If linked to invoice, adjust invoice total
    if (data.invoice_id) {
      const invoice = await db.query(
        "SELECT total FROM invoices WHERE id = $1",
        [data.invoice_id],
      );
      if (invoice.rows.length > 0) {
        const newTotal =
          parseFloat(invoice.rows[0].total) - parseFloat(data.amount);
        await db.query(
          "UPDATE invoices SET total = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [Math.max(0, newTotal), data.invoice_id],
        );
      }
    }

    if (userId)
      {await audit.log(
        userId,
        "create",
        "credit_note",
        id,
        null,
        result.rows[0],
      );}
    return result.rows[0];
  },

  async list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const countRes = await db.query("SELECT COUNT(*) FROM credit_notes");
    const total = parseInt(countRes.rows[0].count);

    const result = await db.query(
      `SELECT cn.*, c.name as customer_name, i.invoice_number
       FROM credit_notes cn
       LEFT JOIN customers c ON c.id = cn.customer_id
       LEFT JOIN invoices i ON i.id = cn.invoice_id
       ORDER BY cn.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return { data: result.rows, total, page, limit };
  },
};

// ─── USAGE ───
const usage = {
  async record(data) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO usage_records (id, customer_id, session_id, bytes_in, bytes_out, session_time)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        id,
        data.customer_id,
        data.session_id || null,
        data.bytes_in || 0,
        data.bytes_out || 0,
        data.session_time || 0,
      ],
    );
    return result.rows[0];
  },

  async getByCustomer(customerId, limit = 100) {
    const result = await db.query(
      `SELECT * FROM usage_records WHERE customer_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [customerId, limit],
    );
    return result.rows;
  },

  async recordRadius(data) {
    // Parse RADIUS accounting packet
    return this.record({
      customer_id: data.customer_id,
      session_id: data.session_id || data["Acct-Session-Id"],
      bytes_in: parseInt(data["Acct-Input-Octets"] || data.bytes_in || 0),
      bytes_out: parseInt(data["Acct-Output-Octets"] || data.bytes_out || 0),
      session_time: parseInt(
        data["Acct-Session-Time"] || data.session_time || 0,
      ),
    });
  },
};

// ─── AUDIT ───
const audit = {
  async log(
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    req = null,
  ) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO billing_audit_logs (id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(sanitizeAuditData(oldValues)) : null,
        newValues ? JSON.stringify(sanitizeAuditData(newValues)) : null,
        req?.ip || null,
        req?.get?.("User-Agent") || null,
      ],
    );
    return id;
  },

  async getByEntity(entityType, entityId, limit = 50) {
    const result = await db.query(
      `SELECT * FROM billing_audit_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [entityType, entityId, limit],
    );
    return result.rows;
  },
};

// ─── NOTIFICATIONS ───
const notifications = {
  async getTemplate(eventType, channel) {
    const result = await db.query(
      `SELECT * FROM notification_templates WHERE event_type = $1 AND channel = $2 AND is_active = true LIMIT 1`,
      [eventType, channel],
    );
    return result.rows[0] || null;
  },

  async trigger(eventType, data) {
    try {
      // Dispatch via the real notification service (SMS + WhatsApp)
      const notificationService = require('./notificationService');
      const customer = data.customer || null;
      if (customer?.phone) {
        notificationService.triggerSMS(eventType, data).catch((e) =>
          console.error(`[Notification] SMS dispatch failed for ${eventType}:`, e?.message || e)
        );
      }

      // Also try email via the email service
      const emailService = require('../services/email');
      const customerEmail = data.customer?.email || data.customerEmail;
      if (customerEmail) {
        emailService.triggerEmail(eventType, {
          customerName: data.customer?.name || 'Customer',
          customerEmail,
          ...data,
        }).catch((e) =>
          console.error(`[Notification] Email dispatch failed for ${eventType}:`, e?.message || e)
        );
      }
    } catch (e) {
      console.error(`[Notification] trigger error for ${eventType}:`, e?.message || e);
    }
  },
};

// ─── DASHBOARD ───
const dashboard = {
  async getStats() {
    const [
      totalCustomers,
      activeCustomers,
      totalSubscriptions,
      activeSubscriptions,
      suspendedSubscriptions,
      revenue,
      monthlyRevenue,
      totalInvoiced,
      totalOutstanding,
      overdueInvoices,
      taxRate,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) FROM customers"),
      db.query("SELECT COUNT(*) FROM customers WHERE status = 'active'"),
      db.query("SELECT COUNT(*) FROM subscriptions"),
      db.query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'"),
      db.query("SELECT COUNT(*) FROM subscriptions WHERE status = 'suspended'"),
      db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments"),
      db.query(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p
        WHERE EXTRACT(MONTH FROM p.received_at) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM p.received_at) = EXTRACT(YEAR FROM CURRENT_DATE)`),
      db.query("SELECT COALESCE(SUM(total), 0) as total FROM invoices"),
      db.query(`SELECT COALESCE(SUM(i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0) as total
        FROM invoices i WHERE i.status != 'paid'`),
      db.query(
        `SELECT COUNT(*) FROM invoices WHERE status != 'paid' AND due_date < CURRENT_DATE`,
      ),
      db.query(
        "SELECT rate FROM tax_rates WHERE is_default = true AND is_active = true LIMIT 1",
      ),
    ]);

    const activeSubs = await db.query(
      `SELECT COALESCE(SUM(sp.price), 0) as total FROM subscriptions s
       LEFT JOIN service_plans sp ON sp.id = s.plan_id WHERE s.status = 'active'`,
    );

    const mrr = parseFloat(activeSubs.rows[0].total);
    const activeCount = parseInt(activeCustomers.rows[0].count);

    const [radacctResult, recentPaymentsResult] = await Promise.all([
      db.query("SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL").catch(() => ({ rows: [{ count: 0 }] })),
      db.query(
        `SELECT p.id, p.amount, p.method, p.received_at, c.name as customer_name
         FROM payments p LEFT JOIN customers c ON c.id = p.customer_id
         ORDER BY p.received_at DESC LIMIT 5`
      ).catch(() => ({ rows: [] })),
    ]);

    return {
      total_customers: parseInt(totalCustomers.rows[0].count),
      active_customers: activeCount,
      total_subscriptions: parseInt(totalSubscriptions.rows[0].count),
      active_subscriptions: parseInt(activeSubscriptions.rows[0].count),
      suspended_subscriptions: parseInt(suspendedSubscriptions.rows[0].count),
      total_revenue: parseFloat(revenue.rows[0].total),
      monthly_revenue: parseFloat(monthlyRevenue.rows[0].total),
      total_invoiced: parseFloat(totalInvoiced.rows[0].total),
      total_outstanding: parseFloat(totalOutstanding.rows[0].total),
      overdue_invoices: parseInt(overdueInvoices.rows[0].count),
      mrr: mrr,
      arpu: activeCount > 0 ? mrr / activeCount : 0,
      tax_rate: taxRate.rows.length > 0 ? parseFloat(taxRate.rows[0].rate) : 0,
      active_radius_sessions: parseInt(radacctResult.rows[0]?.count || 0),
      recent_payments: recentPaymentsResult.rows || [],
    };
  },
};

// ─── TAX ───
const tax = {
  async getDefault() {
    const result = await db.query(
      "SELECT * FROM tax_rates WHERE is_default = true AND is_active = true LIMIT 1",
    );
    return result.rows[0] || { rate: 0, name: "None" };
  },

  async list() {
    const result = await db.query("SELECT * FROM tax_rates ORDER BY rate ASC");
    return result.rows;
  },

  async setDefault(id) {
    await db.query("UPDATE tax_rates SET is_default = false");
    await db.query("UPDATE tax_rates SET is_default = true WHERE id = $1", [
      id,
    ]);
    return this.getDefault();
  },

  async create(data) {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO tax_rates (id, name, rate, is_default, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        id,
        data.name,
        data.rate,
        data.is_default || false,
        data.is_active !== false,
      ],
    );
    return result.rows[0];
  },
};

module.exports = {
  customers,
  plans,
  subscriptions,
  invoices,
  payments,
  creditNotes,
  usage,
  audit,
  notifications,
  dashboard,
  tax,
};
