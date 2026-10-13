/**
 * ISP Billing Store
 * In-memory store for customers, plans, subscriptions, invoices, payments
 * Mirrors the pattern used in provisionStore.js
 */

const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const billingStore = {
  customers: [],
  service_plans: [],
  subscriptions: [],
  invoices: [],
  payments: [],
  usage_records: [],
  tickets: [],
};

// Utility: generate invoice number
function generateInvoiceNumber() {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count =
    billingStore.invoices.filter((i) => i.invoice_number.startsWith(prefix))
      .length + 1;
  return `${prefix}-${String(count).padStart(4, "0")}`;
}

// Utility: generate receipt number
function generateReceiptNumber() {
  const now = new Date();
  const prefix = `RCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count =
    billingStore.payments.filter(
      (p) => p.receipt_number && p.receipt_number.startsWith(prefix),
    ).length + 1;
  return `${prefix}-${String(count).padStart(4, "0")}`;
}

// Utility: format date for display
function formatDate(d) {
  if (!d) {return null;}
  return d instanceof Date ? d.toISOString().split("T")[0] : d;
}

module.exports = {
  store: billingStore,
  generateInvoiceNumber,
  generateReceiptNumber,

  // ─── CUSTOMERS ───
  async createCustomer(data) {
    const bcrypt = require("bcryptjs");
    const portalPassword =
      data.portal_password || crypto.randomBytes(16).toString("base64url");
    const passwordHash = await bcrypt.hash(portalPassword, 10);

    const customer = {
      id: uuidv4(),
      name: data.name,
      email: data.email || "",
      phone: data.phone || "",
      address: data.address || "",
      city: data.city || "",
      country: data.country || "",
      lat: data.lat || null,
      lng: data.lng || null,
      id_number: data.id_number || "",
      status: data.status || "active",
      notes: data.notes || "",
      fup_profile_id: data.fup_profile_id || null,
      portal_username: data.email || data.phone || `user_${Date.now()}`,
      portal_password_hash: passwordHash,
      portal_token: uuidv4(),
      portal_token_expires: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(), // 30 days
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    billingStore.customers.push(customer);
    return { ...customer, portal_password: portalPassword };
  },

  async updateCustomer(id, data) {
    const idx = billingStore.customers.findIndex((c) => c.id === id);
    if (idx === -1) {return null;}
    billingStore.customers[idx] = {
      ...billingStore.customers[idx],
      ...data,
      fup_profile_id:
        data.fup_profile_id !== undefined
          ? data.fup_profile_id
          : billingStore.customers[idx].fup_profile_id,
      updated_at: new Date().toISOString(),
    };
    return billingStore.customers[idx];
  },

  async deleteCustomer(id) {
    const idx = billingStore.customers.findIndex((c) => c.id === id);
    if (idx === -1) {return null;}
    return billingStore.customers.splice(idx, 1)[0];
  },

  // ─── SERVICE PLANS ───
  async createPlan(data) {
    const plan = {
      id: uuidv4(),
      name: data.name,
      speed_up: data.speed_up || "1M",
      speed_down: data.speed_down || "1M",
      price: data.price || 0,
      quota_gb: data.quota_gb || null,
      priority: data.priority || 8,
      description: data.description || "",
      plan_type: data.plan_type || "monthly",
      validity_days: data.validity_days || 30,
      tenant_id: data.tenant_id || null,
      created_at: new Date().toISOString(),
    };
    billingStore.service_plans.push(plan);
    return plan;
  },

  async updatePlan(id, data) {
    const idx = billingStore.service_plans.findIndex((p) => p.id === id);
    if (idx === -1) {return null;}
    billingStore.service_plans[idx] = {
      ...billingStore.service_plans[idx],
      ...data,
    };
    return billingStore.service_plans[idx];
  },

  async deletePlan(id) {
    const idx = billingStore.service_plans.findIndex((p) => p.id === id);
    if (idx === -1) {return null;}
    return billingStore.service_plans.splice(idx, 1)[0];
  },

  // ─── SUBSCRIPTIONS ───
  async createSubscription(data) {
    const sub = {
      id: uuidv4(),
      customer_id: data.customer_id,
      plan_id: data.plan_id,
      router_id: data.router_id || null,
      mikrotik_connection_id: data.mikrotik_connection_id || null,
      pppoe_username: data.pppoe_username || "",
      pppoe_password: data.pppoe_password || "",
      mac_address: data.mac_address || "",
      mac_binding_enabled: data.mac_binding_enabled || false,
      pppoe_profile: data.pppoe_profile || null,
      status: data.status || "active",
      start_date: formatDate(data.start_date) || formatDate(new Date()),
      end_date: formatDate(data.end_date) || null,
      billing_cycle: data.billing_cycle || "monthly",
      auto_provision: data.auto_provision !== false,
      last_synced_at: data.last_synced_at || null,
      last_sync_status: data.last_sync_status || null,
      last_sync_error: data.last_sync_error || null,
      created_at: new Date().toISOString(),
    };
    billingStore.subscriptions.push(sub);
    return sub;
  },

  async updateSubscription(id, data) {
    const idx = billingStore.subscriptions.findIndex((s) => s.id === id);
    if (idx === -1) {return null;}
    billingStore.subscriptions[idx] = {
      ...billingStore.subscriptions[idx],
      ...data,
    };
    return billingStore.subscriptions[idx];
  },

  async toggleSubscriptionStatus(id) {
    const idx = billingStore.subscriptions.findIndex((s) => s.id === id);
    if (idx === -1) {return null;}
    const sub = billingStore.subscriptions[idx];
    sub.status = sub.status === "active" ? "suspended" : "active";
    sub.updated_at = new Date().toISOString();
    return sub;
  },

  async deleteSubscription(id) {
    const idx = billingStore.subscriptions.findIndex((s) => s.id === id);
    if (idx === -1) {return null;}
    return billingStore.subscriptions.splice(idx, 1)[0];
  },

  // ─── INVOICES ───
  async createInvoice(data) {
    const invoice = {
      id: uuidv4(),
      invoice_number: generateInvoiceNumber(),
      customer_id: data.customer_id,
      subscription_id: data.subscription_id || null,
      amount: data.amount || 0,
      tax: data.tax || 0,
      total: (data.amount || 0) + (data.tax || 0),
      due_date:
        formatDate(data.due_date) ||
        formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      status: "pending",
      notes: data.notes || "",
      created_at: new Date().toISOString(),
    };
    billingStore.invoices.push(invoice);
    return invoice;
  },

  async updateInvoice(id, data) {
    const idx = billingStore.invoices.findIndex((i) => i.id === id);
    if (idx === -1) {return null;}
    billingStore.invoices[idx] = { ...billingStore.invoices[idx], ...data };
    return billingStore.invoices[idx];
  },

  // ─── PAYMENTS ───
  async createPayment(data) {
    const payment = {
      id: uuidv4(),
      invoice_id: data.invoice_id,
      customer_id: data.customer_id,
      amount: data.amount || 0,
      method: data.method || "cash",
      reference: data.reference || "",
      receipt_number: generateReceiptNumber(),
      notes: data.notes || "",
      received_at: new Date().toISOString(),
    };
    billingStore.payments.push(payment);

    // Update invoice status
    const invoice = billingStore.invoices.find((i) => i.id === data.invoice_id);
    if (invoice) {
      const paid = billingStore.payments
        .filter((p) => p.invoice_id === invoice.id)
        .reduce((sum, p) => sum + p.amount, 0);
      invoice.status = paid >= invoice.total ? "paid" : "partial";
      invoice.paid_amount = paid;
    }

    return payment;
  },

  async updatePayment(id, data) {
    const idx = billingStore.payments.findIndex((payment) => payment.id === id);
    if (idx === -1) {return null;}

    billingStore.payments[idx] = {
      ...billingStore.payments[idx],
      ...data,
      updated_at: new Date().toISOString(),
    };

    return billingStore.payments[idx];
  },

  // ─── USAGE RECORDS ───
  async recordUsage(data) {
    const record = {
      id: uuidv4(),
      customer_id: data.customer_id,
      bytes_in: data.bytes_in || 0,
      bytes_out: data.bytes_out || 0,
      session_time: data.session_time || 0,
      recorded_at: new Date().toISOString(),
    };
    billingStore.usage_records.push(record);
    return record;
  },

  // ─── DASHBOARD STATS ───
  async getDashboardStats() {
    const totalCustomers = billingStore.customers.length;
    const activeCustomers = billingStore.customers.filter(
      (c) => c.status === "active",
    ).length;
    const totalSubscriptions = billingStore.subscriptions.length;
    const activeSubscriptions = billingStore.subscriptions.filter(
      (s) => s.status === "active",
    ).length;
    const suspendedSubscriptions = billingStore.subscriptions.filter(
      (s) => s.status === "suspended",
    ).length;

    const totalRevenue = billingStore.payments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthlyRevenue = billingStore.payments
      .filter((p) => {
        const d = new Date(p.received_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((sum, p) => sum + p.amount, 0);

    const totalInvoiced = billingStore.invoices.reduce(
      (sum, i) => sum + i.total,
      0,
    );
    const totalOutstanding = billingStore.invoices
      .filter((i) => i.status !== "paid")
      .reduce((sum, i) => sum + i.total, 0);
    const overdueInvoices = billingStore.invoices.filter(
      (i) => i.status !== "paid" && new Date(i.due_date) < new Date(),
    ).length;

    const mrr = billingStore.subscriptions
      .filter((s) => s.status === "active")
      .reduce((sum, s) => {
        const plan = billingStore.service_plans.find((p) => p.id === s.plan_id);
        return sum + (plan ? plan.price : 0);
      }, 0);

    const recentPayments = [...billingStore.payments]
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
      .slice(0, 5)
      .map(p => {
        const customer = billingStore.customers.find(c => c.id === p.customer_id);
        return { id: p.id, amount: p.amount, method: p.method, received_at: p.received_at, customer_name: customer?.name || "Unknown" };
      });

    // Try to get real active RADIUS sessions from radacct table
    let activeRadiusSessions = 0;
    try {
      const db = global.dbAvailable ? global.db : null;
      if (db) {
        const result = await db.query("SELECT COUNT(*) as count FROM radacct WHERE acctstoptime IS NULL");
        activeRadiusSessions = parseInt(result.rows[0].count) || 0;
      }
    } catch (e) {
      // radacct table may not exist in in-memory mode
    }

    // Calculate revenue trend (month-over-month percentage change)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthRevenue = billingStore.payments
      .filter((p) => {
        const d = new Date(p.received_at);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
      })
      .reduce((sum, p) => sum + p.amount, 0);
    const revenueTrend = lastMonthRevenue > 0 ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : undefined;

    // Get currency symbol from settings
    let currencySymbol = '$';
    try {
      const db = global.dbAvailable ? global.db : null;
      if (db) {
        const result = await db.query("SELECT value FROM settings WHERE key = 'currency_symbol' LIMIT 1");
        if (result.rows.length > 0) { currencySymbol = result.rows[0].value; }
      }
    } catch (e) {}

    return {
      total_customers: totalCustomers,
      active_customers: activeCustomers,
      total_subscriptions: totalSubscriptions,
      active_subscriptions: activeSubscriptions,
      suspended_subscriptions: suspendedSubscriptions,
      total_revenue: totalRevenue,
      monthly_revenue: monthlyRevenue,
      total_invoiced: totalInvoiced,
      total_outstanding: totalOutstanding,
      overdue_invoices: overdueInvoices,
      mrr,
      arpu: activeCustomers > 0 ? mrr / activeCustomers : 0,
      tax_rate: 16,
      active_radius_sessions: activeRadiusSessions,
      revenue_trend: revenueTrend,
      currency_symbol: currencySymbol,
      recent_payments: recentPayments,
    };
  },

  // ─── AUTO-GENERATE MONTHLY INVOICES ───
  async generateMonthlyInvoices() {
    const activeSubs = billingStore.subscriptions.filter(
      (s) => s.status === "active",
    );
    const created = [];

    for (const sub of activeSubs) {
      const plan = billingStore.service_plans.find((p) => p.id === sub.plan_id);
      if (!plan) {continue;}

      // Check if invoice already exists for this month
      const thisMonth = new Date().getMonth();
      const thisYear = new Date().getFullYear();
      const existing = billingStore.invoices.find((i) => {
        if (i.customer_id !== sub.customer_id) {return false;}
        const d = new Date(i.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      if (existing) {continue;}

      const invoice = await this.createInvoice({
        customer_id: sub.customer_id,
        subscription_id: sub.id,
        amount: plan.price,
        tax: plan.price * 0.16, // 16% VAT
      });
      created.push(invoice);
    }

    return created;
  },
};
