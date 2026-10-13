const fallbackBilling = require("../db/billingStore");

const MAX_LIST_LIMIT = 10000;

function usesRepositoryBackend() {
  const backend = global.billingRepo;
  return Boolean(
    global.dbAvailable && backend && backend.customers && !backend.store,
  );
}

function getBackend() {
  return global.billingRepo || fallbackBilling;
}

function getStore() {
  return fallbackBilling.store;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {return fallback;}
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCustomer(customer) {
  if (!customer) {return null;}
  return {
    ...customer,
    subscription_count: toNumber(customer.subscription_count, 0),
    outstanding_balance: toNumber(customer.outstanding_balance, 0),
  };
}

function normalizePlan(plan) {
  if (!plan) {return null;}
  return {
    ...plan,
    price: toNumber(plan.price, 0),
    quota_gb:
      plan.quota_gb === null || plan.quota_gb === undefined
        ? null
        : toNumber(plan.quota_gb, null),
    priority:
      plan.priority === null || plan.priority === undefined
        ? null
        : toNumber(plan.priority, null),
    active_subscribers: toNumber(plan.active_subscribers, 0),
  };
}

function normalizeCustomerRef(row) {
  if (!row?.customer_id && !row?.customer) {return null;}
  if (row.customer) {return normalizeCustomer(row.customer);}
  return normalizeCustomer({
    id: row.customer_id,
    name: row.customer_name || "",
    email: row.customer_email || "",
    phone: row.customer_phone || "",
    address: row.customer_address || "",
    city: row.customer_city || "",
    status: row.customer_status || undefined,
  });
}

function normalizePlanRef(row) {
  if (!row?.plan_id && !row?.plan) {return null;}
  if (row.plan) {return normalizePlan(row.plan);}
  return normalizePlan({
    id: row.plan_id,
    name: row.plan_name || "",
    speed_up: row.speed_up || row.plan_speed_up || "",
    speed_down: row.speed_down || row.plan_speed_down || "",
    price: row.plan_price !== undefined ? row.plan_price : row.price,
    quota_gb: row.plan_quota_gb ?? null,
    priority: row.plan_priority ?? null,
  });
}

function normalizeRouterRef(row) {
  if (row?.mikrotik_connection) {return row.mikrotik_connection;}
  if (row?.router) {return row.router;}
  if (row?.mikrotik_connection_id || row?.mikrotik_connection_name) {
    return {
      id: row.mikrotik_connection_id || null,
      name: row.mikrotik_connection_name || "",
      ip_address: row.mikrotik_connection_ip || "",
      type: "mikrotik_connection",
    };
  }
  if (!row?.router_id && !row?.router_name) {return null;}
  return {
    id: row.router_id || null,
    name: row.router_name || "",
    type: "router",
  };
}

function normalizeSubscription(subscription) {
  if (!subscription) {return null;}
  return {
    ...subscription,
    auto_provision: subscription.auto_provision !== false,
    mikrotik_connection_id:
      subscription.mikrotik_connection_id ||
      subscription.router?.id ||
      subscription.router_id ||
      null,
    customer: normalizeCustomerRef(subscription),
    plan: normalizePlanRef(subscription),
    router: normalizeRouterRef(subscription),
  };
}

function normalizeInvoice(invoice) {
  if (!invoice) {return null;}
  const paidAmount = toNumber(invoice.paid_amount, 0);
  const total = toNumber(invoice.total, 0);
  return {
    ...invoice,
    amount: toNumber(invoice.amount, 0),
    tax: toNumber(invoice.tax, 0),
    tax_rate: toNumber(invoice.tax_rate, 0),
    total,
    paid_amount: paidAmount,
    balance:
      invoice.balance === null || invoice.balance === undefined
        ? total - paidAmount
        : toNumber(invoice.balance, total - paidAmount),
    customer: normalizeCustomerRef(invoice),
  };
}

function normalizePayment(payment) {
  if (!payment) {return null;}
  const invoice = payment.invoice
    ? normalizeInvoice(payment.invoice)
    : payment.invoice_id
      ? {
          id: payment.invoice_id,
          invoice_number: payment.invoice_number || "",
          total:
            payment.invoice_total === undefined
              ? undefined
              : toNumber(payment.invoice_total, 0),
        }
      : null;

  return {
    ...payment,
    amount: toNumber(payment.amount, 0),
    customer: normalizeCustomerRef(payment),
    invoice,
  };
}

async function listCustomers() {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    const { data } = await backend.customers.list({
      page: 1,
      limit: MAX_LIST_LIMIT,
    });
    return data.map(normalizeCustomer);
  }

  const store = getStore();
  return store.customers.map((customer) => {
    const subscriptions = store.subscriptions.filter(
      (item) => item.customer_id === customer.id,
    );
    const invoices = store.invoices.filter(
      (item) => item.customer_id === customer.id && item.status !== "paid",
    );
    const outstandingBalance = invoices.reduce(
      (sum, item) => sum + toNumber(item.total, 0),
      0,
    );
    return normalizeCustomer({
      ...customer,
      subscription_count: subscriptions.length,
      outstanding_balance: outstandingBalance,
    });
  });
}

async function getCustomerById(id) {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    const customer = await backend.customers.findById(id);
    return normalizeCustomer(customer);
  }

  const store = getStore();
  return normalizeCustomer(
    store.customers.find((customer) => customer.id === id),
  );
}

async function getCustomerDetail(id) {
  const customer = await getCustomerById(id);
  if (!customer) {return null;}

  const [subscriptions, invoices, payments] = await Promise.all([
    listSubscriptions(),
    listInvoices(),
    listPayments(),
  ]);

  return {
    ...customer,
    subscriptions: subscriptions.filter((item) => item.customer_id === id),
    invoices: invoices.filter((item) => item.customer_id === id),
    payments: payments.filter((item) => item.customer_id === id),
  };
}

async function getCompanyAbbreviation() {
  try {
    let companyName = "";
    let abbreviation = "";

    // Try to get from settings
    if (global.dbAvailable && global.db) {
      const result = await global.db.query(
        `SELECT key, value FROM settings WHERE key IN ('company_name', 'company_abbreviation')`,
      );
      for (const row of result.rows) {
        if (row.key === "company_abbreviation" && row.value)
          {abbreviation = row.value;}
        if (row.key === "company_name" && row.value) {companyName = row.value;}
      }
    }

    // Use abbreviation if set
    if (abbreviation) {
      return (
        abbreviation
          .trim()
          .substring(0, 6)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "") || "CUST"
      );
    }

    // Derive from company name: first letter of each word, max 4 chars
    if (companyName) {
      const words = companyName.trim().split(/\s+/);
      const derived = words
        .map((w) => w.charAt(0))
        .join("")
        .toUpperCase()
        .substring(0, 4);
      if (derived) {return derived;}
    }
  } catch (e) {
    // Silent fallback
  }

  return "CUST";
}

async function generateAccountNumber() {
  const namePrefix = await getCompanyAbbreviation();

  if (usesRepositoryBackend() && global.db) {
    const result = await global.db.query(
      `SELECT COUNT(*) as count FROM customers WHERE account_number ILIKE $1`,
      [`${namePrefix}-%`],
    );
    const count = parseInt(result.rows[0]?.count || 0);
    return `${namePrefix}-${String(count + 1).padStart(5, "0")}`;
  }

  const store = getStore();
  const existing = store.customers.filter(
    (c) => c.account_number && c.account_number.startsWith(namePrefix),
  );
  return `${namePrefix}-${String(existing.length + 1).padStart(5, "0")}`;
}

async function createCustomer(data) {
  const enriched = { ...data };
  if (!enriched.account_number) {
    enriched.account_number = await generateAccountNumber(data.name);
  }

  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizeCustomer(await backend.customers.create(enriched));
  }
  return normalizeCustomer(await backend.createCustomer(enriched));
}

async function updateCustomer(id, data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizeCustomer(await backend.customers.update(id, data));
  }
  return normalizeCustomer(await backend.updateCustomer(id, data));
}

async function deleteCustomer(id) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizeCustomer(await backend.customers.delete(id));
  }
  return normalizeCustomer(await backend.deleteCustomer(id));
}

async function listPlans() {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    return (await backend.plans.list()).map(normalizePlan);
  }

  const store = getStore();
  return store.service_plans.map((plan) => {
    const activeSubscribers = store.subscriptions.filter(
      (item) => item.plan_id === plan.id && item.status === "active",
    ).length;
    return normalizePlan({
      ...plan,
      active_subscribers: activeSubscribers,
    });
  });
}

async function getPlanById(id) {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    return normalizePlan(await backend.plans.findById(id));
  }

  const store = getStore();
  return normalizePlan(store.service_plans.find((plan) => plan.id === id));
}

async function createPlan(data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizePlan(await backend.plans.create(data));
  }
  return normalizePlan(await backend.createPlan(data));
}

async function updatePlan(id, data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizePlan(await backend.plans.update(id, data));
  }
  return normalizePlan(await backend.updatePlan(id, data));
}

async function deletePlan(id) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return normalizePlan(await backend.plans.delete(id));
  }
  return normalizePlan(await backend.deletePlan(id));
}

async function listSubscriptions() {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    const { data } = await backend.subscriptions.list({
      page: 1,
      limit: MAX_LIST_LIMIT,
    });
    return data.map(normalizeSubscription);
  }

  const store = getStore();
  return store.subscriptions.map((subscription) =>
    normalizeSubscription({
      ...subscription,
      customer:
        store.customers.find(
          (customer) => customer.id === subscription.customer_id,
        ) || null,
      plan:
        store.service_plans.find((plan) => plan.id === subscription.plan_id) ||
        null,
      router:
        store.routers?.find((router) => router.id === subscription.router_id) ||
        null,
    }),
  );
}

async function getSubscriptionById(id) {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    return normalizeSubscription(await backend.subscriptions.findById(id));
  }

  const subscriptions = await listSubscriptions();
  return subscriptions.find((subscription) => subscription.id === id) || null;
}

async function createSubscription(data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const subscription = await backend.subscriptions.create(data);
    return getSubscriptionById(subscription.id);
  }
  return normalizeSubscription(await backend.createSubscription(data));
}

async function updateSubscription(id, data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const subscription = await backend.subscriptions.update(id, data);
    return subscription ? getSubscriptionById(subscription.id) : null;
  }
  return normalizeSubscription(await backend.updateSubscription(id, data));
}

async function toggleSubscriptionStatus(id) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const subscription = await backend.subscriptions.toggleStatus(id);
    return subscription ? getSubscriptionById(subscription.id) : null;
  }
  return normalizeSubscription(await backend.toggleSubscriptionStatus(id));
}

async function deleteSubscription(id) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const deleted = await backend.subscriptions.delete(id);
    return deleted;
  }
  return await backend.deleteSubscription(id);
}

async function listInvoices() {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    const { data } = await backend.invoices.list({
      page: 1,
      limit: MAX_LIST_LIMIT,
    });
    return data.map(normalizeInvoice);
  }

  const store = getStore();
  return store.invoices.map((invoice) => {
    const customer =
      store.customers.find((item) => item.id === invoice.customer_id) || null;
    const paidAmount = store.payments
      .filter((payment) => payment.invoice_id === invoice.id)
      .reduce((sum, payment) => sum + toNumber(payment.amount, 0), 0);

    return normalizeInvoice({
      ...invoice,
      customer,
      paid_amount: paidAmount,
      balance: toNumber(invoice.total, 0) - paidAmount,
    });
  });
}

async function getInvoiceById(id) {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    return normalizeInvoice(await backend.invoices.findById(id));
  }

  const invoices = await listInvoices();
  return invoices.find((invoice) => invoice.id === id) || null;
}

async function createInvoice(data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const invoice = await backend.invoices.create(data);
    return getInvoiceById(invoice.id);
  }
  return normalizeInvoice(await backend.createInvoice(data));
}

async function updateInvoice(id, data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const invoice = await backend.invoices.update(id, data);
    return invoice ? getInvoiceById(invoice.id) : null;
  }
  return normalizeInvoice(await backend.updateInvoice(id, data));
}

async function generateMonthlyInvoices() {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return (await backend.invoices.generateMonthly()).map(normalizeInvoice);
  }
  return (await backend.generateMonthlyInvoices()).map(normalizeInvoice);
}

async function listPayments(options = {}) {
  if (usesRepositoryBackend()) {
    const backend = getBackend();
    const { data } = await backend.payments.list({
      page: 1,
      limit: MAX_LIST_LIMIT,
      customer_id: options.customerId || "",
    });
    return data.map(normalizePayment);
  }

  const store = getStore();
  return store.payments
    .filter(
      (payment) =>
        !options.customerId || payment.customer_id === options.customerId,
    )
    .map((payment) =>
      normalizePayment({
        ...payment,
        customer:
          store.customers.find((item) => item.id === payment.customer_id) ||
          null,
        invoice:
          store.invoices.find((item) => item.id === payment.invoice_id) || null,
      }),
    );
}

async function getPaymentById(id) {
  if (usesRepositoryBackend()) {
    const rows = await listPayments();
    return rows.find((payment) => payment.id === id) || null;
  }

  const payments = await listPayments();
  return payments.find((payment) => payment.id === id) || null;
}

async function createPayment(data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const payment = await backend.payments.create(data);
    return getPaymentById(payment.id);
  }
  return normalizePayment(await backend.createPayment(data));
}

async function updatePayment(id, data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    const payment = await backend.payments.update(id, data);
    return payment ? getPaymentById(payment.id) : null;
  }
  if (typeof backend.updatePayment !== "function") {
    throw new Error("Payment updates are not supported by current backend");
  }
  return normalizePayment(await backend.updatePayment(id, data));
}

async function getDashboardStats() {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return backend.dashboard.getStats();
  }
  return backend.getDashboardStats();
}

async function listUsageRecords({
  customerId,
  startTime = null,
  endTime = null,
  limit = 100,
} = {}) {
  if (usesRepositoryBackend() && global.db) {
    const params = [];
    const where = [];

    if (customerId) {
      params.push(customerId);
      where.push(`customer_id = $${params.length}`);
    }
    if (startTime) {
      params.push(startTime);
      where.push(`recorded_at >= $${params.length}`);
    }
    if (endTime) {
      params.push(endTime);
      where.push(`recorded_at <= $${params.length}`);
    }

    params.push(limit);
    const query = `
      SELECT *
      FROM usage_records
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY recorded_at DESC
      LIMIT $${params.length}
    `;
    const result = await global.db.query(query, params);
    return result.rows;
  }

  const store = getStore();
  let records = [...store.usage_records];
  if (customerId) {
    records = records.filter((record) => record.customer_id === customerId);
  }
  if (startTime) {
    records = records.filter(
      (record) => new Date(record.recorded_at) >= new Date(startTime),
    );
  }
  if (endTime) {
    records = records.filter(
      (record) => new Date(record.recorded_at) <= new Date(endTime),
    );
  }

  return records
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    .slice(0, limit);
}

async function recordUsage(data) {
  const backend = getBackend();
  if (usesRepositoryBackend()) {
    return backend.usage.record(data);
  }
  return backend.recordUsage(data);
}

async function findCustomerByPppoeUsername(username) {
  if (usesRepositoryBackend() && global.db) {
    const result = await global.db.query(
      `SELECT c.*, s.id as sub_id, s.pppoe_username, s.pppoe_password, s.status as sub_status,
              s.start_date, s.throttled, s.throttle_reason, s.plan_id,
              p.name as plan_name, p.speed_up, p.speed_down, p.price, p.quota_gb
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN service_plans p ON p.id = s.plan_id
       WHERE s.pppoe_username = $1 AND s.status = 'active'
       LIMIT 1`,
      [username],
    );
    if (result.rows.length === 0) {return null;}
    const row = result.rows[0];
    return {
      customer: normalizeCustomer(row),
      subscription: normalizeSubscription({
        id: row.sub_id,
        customer_id: row.id,
        plan_id: row.plan_id,
        pppoe_username: row.pppoe_username,
        pppoe_password: row.pppoe_password,
        status: row.sub_status,
        start_date: row.start_date,
        throttled: row.throttled,
        throttle_reason: row.throttle_reason,
      }),
      plan: normalizePlan({
        id: row.plan_id,
        name: row.plan_name,
        speed_up: row.speed_up,
        speed_down: row.speed_down,
        price: row.price,
        quota_gb: row.quota_gb,
      }),
    };
  }

  const store = getStore();
  const subscription = store.subscriptions.find(
    (s) => s.pppoe_username === username && s.status === "active",
  );
  if (!subscription) {return null;}
  const customer = store.customers.find((c) => c.id === subscription.customer_id);
  if (!customer) {return null;}
  const plan = store.service_plans.find((p) => p.id === subscription.plan_id) || null;
  return {
    customer: normalizeCustomer(customer),
    subscription: normalizeSubscription({
      ...subscription,
      customer,
      plan,
    }),
    plan: normalizePlan(plan),
  };
}

module.exports = {
  usesRepositoryBackend,
  listCustomers,
  getCustomerById,
  getCustomerDetail,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  listSubscriptions,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  toggleSubscriptionStatus,
  deleteSubscription,
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  generateMonthlyInvoices,
  listPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  getDashboardStats,
  listUsageRecords,
  recordUsage,
  findCustomerByPppoeUsername,
  normalizeCustomer,
  normalizePlan,
  normalizeSubscription,
  normalizeInvoice,
  normalizePayment,
  toNumber,
};
