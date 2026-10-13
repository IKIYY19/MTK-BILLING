const { v4: uuidv4 } = require('uuid');

const fallbackSessions = new Map();

function useDatabase() {
  return Boolean(global.dbAvailable && global.db);
}

function normalizeSession(session) {
  if (!session) {return null;}
  return {
    ...session,
    amount: session.amount === null || session.amount === undefined ? 0 : Number(session.amount),
  };
}

async function savePending(session) {
  const payload = {
    id: session.id || uuidv4(),
    invoice_id: session.invoice_id || null,
    customer_id: session.customer_id || null,
    phone: session.phone,
    amount: Number(session.amount || 0),
    method: session.method || 'mpesa_stk',
    status: session.status || 'pending',
    checkout_request_id: session.checkoutRequestId,
    provider_response: session.provider_response || null,
  };

  if (!payload.checkout_request_id) {
    throw new Error('checkoutRequestId is required');
  }

  if (useDatabase()) {
    const result = await global.db.query(
      `INSERT INTO payment_sessions (
         id, invoice_id, customer_id, phone, amount, method, status, checkout_request_id, provider_response
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (checkout_request_id) DO UPDATE
       SET invoice_id = EXCLUDED.invoice_id,
           customer_id = EXCLUDED.customer_id,
           phone = EXCLUDED.phone,
           amount = EXCLUDED.amount,
           method = EXCLUDED.method,
           status = EXCLUDED.status,
           provider_response = EXCLUDED.provider_response,
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        payload.id,
        payload.invoice_id,
        payload.customer_id,
        payload.phone,
        payload.amount,
        payload.method,
        payload.status,
        payload.checkout_request_id,
        payload.provider_response ? JSON.stringify(payload.provider_response) : null,
      ]
    );
    return normalizeSession(result.rows[0]);
  }

  const record = {
    ...payload,
    checkoutRequestId: payload.checkout_request_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackSessions.set(payload.checkout_request_id, record);
  return normalizeSession(record);
}

async function findByCheckoutRequestId(checkoutRequestId) {
  if (!checkoutRequestId) {return null;}

  if (useDatabase()) {
    const result = await global.db.query(
      'SELECT * FROM payment_sessions WHERE checkout_request_id = $1 LIMIT 1',
      [checkoutRequestId]
    );
    return normalizeSession(result.rows[0]);
  }

  return normalizeSession(fallbackSessions.get(checkoutRequestId) || null);
}

async function markCompleted(checkoutRequestId, updates = {}) {
  const current = await findByCheckoutRequestId(checkoutRequestId);
  if (!current) {return null;}

  if (useDatabase()) {
    const result = await global.db.query(
      `UPDATE payment_sessions
       SET status = $1,
           mpesa_receipt = COALESCE($2, mpesa_receipt),
           payment_id = COALESCE($3, payment_id),
           provider_response = COALESCE($4, provider_response),
           completed_at = COALESCE($5, completed_at),
           updated_at = CURRENT_TIMESTAMP
       WHERE checkout_request_id = $6
       RETURNING *`,
      [
        updates.status || 'completed',
        updates.mpesaReceipt || null,
        updates.payment_id || null,
        updates.provider_response ? JSON.stringify(updates.provider_response) : null,
        updates.completed_at || new Date().toISOString(),
        checkoutRequestId,
      ]
    );
    return normalizeSession(result.rows[0]);
  }

  const record = {
    ...current,
    status: updates.status || 'completed',
    mpesaReceipt: updates.mpesaReceipt || current.mpesaReceipt || null,
    payment_id: updates.payment_id || current.payment_id || null,
    provider_response: updates.provider_response || current.provider_response || null,
    completed_at: updates.completed_at || current.completed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackSessions.set(checkoutRequestId, record);
  return normalizeSession(record);
}

async function markFailed(checkoutRequestId, updates = {}) {
  const current = await findByCheckoutRequestId(checkoutRequestId);
  if (!current) {return null;}

  if (useDatabase()) {
    const result = await global.db.query(
      `UPDATE payment_sessions
       SET status = $1,
           provider_response = COALESCE($2, provider_response),
           updated_at = CURRENT_TIMESTAMP
       WHERE checkout_request_id = $3
       RETURNING *`,
      [
        updates.status || 'failed',
        updates.provider_response ? JSON.stringify(updates.provider_response) : null,
        checkoutRequestId,
      ]
    );
    return normalizeSession(result.rows[0]);
  }

  const record = {
    ...current,
    status: updates.status || 'failed',
    provider_response: updates.provider_response || current.provider_response || null,
    updated_at: new Date().toISOString(),
  };
  fallbackSessions.set(checkoutRequestId, record);
  return normalizeSession(record);
}

module.exports = {
  savePending,
  findByCheckoutRequestId,
  markCompleted,
  markFailed,
};
