const { v4: uuidv4 } = require('uuid');

const DEFAULT_TEMPLATES = [
  {
    id: 'invoice_due_soon',
    name: 'Invoice Due Soon',
    event: 'invoice_due_soon',
    body: 'Hi {customer_name}, your invoice {invoice_number} for KES {amount} is due on {due_date}. Pay via M-Pesa: {paybill}, Acc: {invoice_number}. Thank you - {company_name}',
    is_active: true,
  },
  {
    id: 'invoice_overdue',
    name: 'Invoice Overdue',
    event: 'invoice_overdue',
    body: 'URGENT: {customer_name}, your invoice {invoice_number} of KES {amount} is {days_overdue} days overdue. Your service may be suspended. Pay via M-Pesa: {paybill}, Acc: {invoice_number} - {company_name}',
    is_active: true,
  },
  {
    id: 'payment_received',
    name: 'Payment Received',
    event: 'payment_received',
    body: 'Payment received! KES {amount} for {invoice_number}. Receipt: {mpesa_receipt}. New balance: KES {balance}. Thank you - {company_name}',
    is_active: true,
  },
  {
    id: 'service_suspended',
    name: 'Service Suspended',
    event: 'service_suspended',
    body: 'NOTICE: {customer_name}, your internet service has been SUSPENDED due to unpaid invoice {invoice_number} of KES {amount}. Pay KES {amount} via M-Pesa: {paybill}, Acc: {invoice_number} to restore - {company_name}',
    is_active: true,
  },
  {
    id: 'service_restored',
    name: 'Service Restored',
    event: 'service_restored',
    body: 'GOOD NEWS: {customer_name}, your internet service has been RESTORED after payment of KES {amount}. Receipt: {mpesa_receipt}. Enjoy! - {company_name}',
    is_active: true,
  },
  {
    id: 'welcome',
    name: 'Welcome New Customer',
    event: 'welcome',
    body: 'Welcome to {company_name}! Your internet is active. Plan: {plan_name}, Speed: {speed}. PPPoE: {pppoe_user}/{pppoe_pass}. Support: {support_phone} - {company_name}',
    is_active: true,
  },
];

const fallbackState = {
  templates: DEFAULT_TEMPLATES.map((template) => ({ ...template })),
  logs: [],
};

function useDatabase() {
  return Boolean(global.dbAvailable && global.db);
}

function templateName(templateId) {
  const match = DEFAULT_TEMPLATES.find((template) => template.id === templateId);
  if (match) {return match.name;}
  return templateId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTemplate(row) {
  if (!row) {return null;}
  return {
    id: row.event_type || row.id,
    name: row.name || templateName(row.event_type || row.id),
    event: row.event_type || row.event || row.id,
    body: row.body,
    is_active: row.is_active !== false,
  };
}

function normalizeLog(row) {
  if (!row) {return null;}
  return {
    ...row,
    to: row.recipients || row.to || [],
    recipients: row.recipients || row.to || [],
    cost: row.cost === null || row.cost === undefined ? 0 : Number(row.cost),
    is_sandbox: row.is_sandbox === true,
  };
}

async function ensureDefaultTemplates(channel = 'sms') {
  if (!useDatabase()) {return;}

  for (const template of DEFAULT_TEMPLATES) {
    await global.db.query(
      `INSERT INTO notification_templates (event_type, channel, subject, body, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_type, channel) DO NOTHING`,
      [template.id, channel, template.name, template.body, template.is_active]
    );
  }
}

async function listTemplates(channel = 'sms') {
  if (useDatabase()) {
    await ensureDefaultTemplates(channel);
    const result = await global.db.query(
      `SELECT event_type, subject, body, is_active
       FROM notification_templates
       WHERE channel = $1
       ORDER BY event_type ASC`,
      [channel]
    );
    return result.rows.map((row) => normalizeTemplate({
      event_type: row.event_type,
      name: row.subject,
      body: row.body,
      is_active: row.is_active,
    }));
  }

  return fallbackState.templates.map((template) => ({ ...template }));
}

async function getTemplate(templateId, channel = 'sms') {
  if (useDatabase()) {
    await ensureDefaultTemplates(channel);
    const result = await global.db.query(
      `SELECT event_type, subject, body, is_active
       FROM notification_templates
       WHERE event_type = $1 AND channel = $2
       LIMIT 1`,
      [templateId, channel]
    );
    return normalizeTemplate(result.rows[0]);
  }

  return fallbackState.templates.find((template) => template.id === templateId) || null;
}

async function updateTemplate(templateId, data, channel = 'sms') {
  const existing = await getTemplate(templateId, channel);
  const payload = {
    id: templateId,
    name: data.name || existing?.name || templateName(templateId),
    body: data.body !== undefined ? data.body : existing?.body,
    is_active: data.is_active !== undefined ? data.is_active : existing?.is_active !== false,
  };

  if (!payload.body) {
    throw new Error('Template body is required');
  }

  if (useDatabase()) {
    const result = await global.db.query(
      `INSERT INTO notification_templates (event_type, channel, subject, body, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_type, channel) DO UPDATE
       SET subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           is_active = EXCLUDED.is_active
       RETURNING event_type, subject, body, is_active`,
      [payload.id, channel, payload.name, payload.body, payload.is_active]
    );
    return normalizeTemplate({
      event_type: result.rows[0].event_type,
      name: result.rows[0].subject,
      body: result.rows[0].body,
      is_active: result.rows[0].is_active,
    });
  }

  const index = fallbackState.templates.findIndex((template) => template.id === templateId);
  if (index === -1) {
    fallbackState.templates.push({
      id: payload.id,
      event: payload.id,
      name: payload.name,
      body: payload.body,
      is_active: payload.is_active,
    });
    return fallbackState.templates[fallbackState.templates.length - 1];
  }

  fallbackState.templates[index] = {
    ...fallbackState.templates[index],
    ...payload,
    event: payload.id,
  };
  return fallbackState.templates[index];
}

async function createLog(log) {
  const recipients = Array.isArray(log.to) ? log.to : Array.isArray(log.recipients) ? log.recipients : log.to ? [log.to] : [];
  const payload = {
    id: log.id || uuidv4(),
    channel: log.channel || 'sms',
    event_type: log.event || null,
    template_id: log.template_id || null,
    recipients,
    message: log.message || '',
    status: log.status || 'queued',
    message_id: log.message_id || null,
    cost: Number(log.cost || 0),
    is_sandbox: log.is_sandbox === true,
    metadata: log.metadata || null,
    created_at: log.created_at || new Date().toISOString(),
  };

  if (useDatabase()) {
    const result = await global.db.query(
      `INSERT INTO message_logs (
         id, channel, event_type, template_id, recipients, message, status, message_id, cost, is_sandbox, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        payload.id,
        payload.channel,
        payload.event_type,
        payload.template_id,
        payload.recipients,
        payload.message,
        payload.status,
        payload.message_id,
        payload.cost,
        payload.is_sandbox,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
        payload.created_at,
      ]
    );
    return normalizeLog(result.rows[0]);
  }

  fallbackState.logs.unshift(payload);
  return normalizeLog(payload);
}

async function listLogs({ page = 1, limit = 50 } = {}) {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 50;
  const offset = (safePage - 1) * safeLimit;

  if (useDatabase()) {
    const [countResult, dataResult] = await Promise.all([
      global.db.query('SELECT COUNT(*) FROM message_logs'),
      global.db.query(
        `SELECT *
         FROM message_logs
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [safeLimit, offset]
      ),
    ]);

    return {
      data: dataResult.rows.map(normalizeLog),
      total: Number(countResult.rows[0].count || 0),
      page: safePage,
      limit: safeLimit,
    };
  }

  return {
    data: fallbackState.logs.slice(offset, offset + safeLimit).map(normalizeLog),
    total: fallbackState.logs.length,
    page: safePage,
    limit: safeLimit,
  };
}

async function deleteLog(id) {
  if (useDatabase()) {
    await global.db.query('DELETE FROM message_logs WHERE id = $1', [id]);
    return { success: true };
  }

  const index = fallbackState.logs.findIndex((log) => log.id === id);
  if (index !== -1) {
    fallbackState.logs.splice(index, 1);
  }
  return { success: true };
}

async function clearLogs() {
  if (useDatabase()) {
    await global.db.query('DELETE FROM message_logs');
    return { success: true };
  }

  fallbackState.logs = [];
  return { success: true };
}

module.exports = {
  DEFAULT_TEMPLATES,
  listTemplates,
  getTemplate,
  updateTemplate,
  createLog,
  listLogs,
  deleteLog,
  clearLogs,
};
