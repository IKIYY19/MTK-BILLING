/**
 * Prepaid Wallet System
 * Customers top up wallet → auto-deducts daily → suspends when empty
 * Unified store: PostgreSQL when available, in-memory fallback.
 */

const { v4: uuidv4 } = require("uuid");

const walletStore = {
  wallets: [],
  transactions: [],
  daily_rate_config: {},
};

// ─── Helpers ───
function getDb() {
  return global.dbAvailable ? global.db : null;
}

// ─── Top Up Wallet ───
async function topUp(
  customerId,
  amount,
  paymentMethod = "mpesa",
  reference = "",
) {
  const db = getDb();
  if (db) {
    // PG path
    let walletResult = await db.query(
      "SELECT * FROM wallets WHERE customer_id = $1",
      [customerId],
    );
    let wallet = walletResult.rows[0];

    if (!wallet) {
      const newId = uuidv4();
      walletResult = await db.query(
        `INSERT INTO wallets (id, customer_id, balance, daily_rate, auto_renew, status, created_at, updated_at)
         VALUES ($1, $2, 0, 0, false, 'inactive', NOW(), NOW()) RETURNING *`,
        [newId, customerId],
      );
      wallet = walletResult.rows[0];
    }

    const parsedAmount = parseFloat(amount);
    const oldBalance = parseFloat(wallet.balance);
    const newBalance = oldBalance + parsedAmount;
    await db.query(
      "UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2",
      [newBalance, wallet.id],
    );

    // Record transaction
    const transId = uuidv4();
    const transResult = await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, customer_id, type, amount, method, reference, balance_after, created_at)
       VALUES ($1, $2, $3, 'credit', $4, $5, $6, $7, NOW()) RETURNING *`,
      [
        transId,
        wallet.id,
        customerId,
        parsedAmount,
        paymentMethod,
        reference,
        newBalance,
      ],
    );
    const transaction = transResult.rows[0];

    wallet.balance = newBalance;

    // Auto-activate if balance > 0 and status is inactive
    if (parseFloat(wallet.balance) > 0 && wallet.status === "inactive") {
      const billing = require("./billingStore");
      const sub = billing.store.subscriptions.find(
        (s) => s.customer_id === customerId && s.plan_id,
      );
      const plan = sub
        ? billing.store.service_plans.find((p) => p.id === sub.plan_id)
        : null;
      const dailyRate = plan ? plan.price / 30 : 1;

      const activatedAt = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + (newBalance / dailyRate) * 24 * 60 * 60 * 1000,
      ).toISOString();

      await db.query(
        `UPDATE wallets SET daily_rate = $1, status = 'active', activated_at = $2, expires_at = $3, updated_at = NOW() WHERE id = $4`,
        [dailyRate, activatedAt, expiresAt, wallet.id],
      );

      wallet.daily_rate = dailyRate;
      wallet.status = "active";
      wallet.activated_at = activatedAt;
      wallet.expires_at = expiresAt;
    }

    // Update expiry if balance > 0 and daily_rate > 0
    if (parseFloat(wallet.balance) > 0 && parseFloat(wallet.daily_rate) > 0) {
      const dailyRate = parseFloat(wallet.daily_rate);
      const daysLeft = parseFloat(wallet.balance) / dailyRate;
      const expiresAt = new Date(
        Date.now() + daysLeft * 24 * 60 * 60 * 1000,
      ).toISOString();

      await db.query(
        "UPDATE wallets SET expires_at = $1, updated_at = NOW() WHERE id = $2",
        [expiresAt, wallet.id],
      );
      wallet.expires_at = expiresAt;

      // If was suspended, reactivate
      if (wallet.status === "suspended") {
        await db.query(
          `UPDATE wallets SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [wallet.id],
        );
        wallet.status = "active";

        const billing = require("./billingStore");
        const sub = billing.store.subscriptions.find(
          (s) => s.customer_id === customerId,
        );
        if (sub && sub.status === "suspended") {
          sub.status = "active";
          sub.updated_at = new Date().toISOString();
        }
      }
    }

    return { wallet, transaction };
  }

  // In-memory fallback
  let wallet = walletStore.wallets.find((w) => w.customer_id === customerId);
  if (!wallet) {
    wallet = {
      id: uuidv4(),
      customer_id: customerId,
      balance: 0,
      daily_rate: 0,
      auto_renew: false,
      status: "inactive",
      activated_at: null,
      expires_at: null,
      last_deduction: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    walletStore.wallets.push(wallet);
  }

  wallet.balance += parseFloat(amount);
  wallet.updated_at = new Date().toISOString();

  // Record transaction
  const transaction = {
    id: uuidv4(),
    wallet_id: wallet.id,
    customer_id: customerId,
    type: "credit",
    amount: parseFloat(amount),
    method: paymentMethod,
    reference,
    balance_after: wallet.balance,
    created_at: new Date().toISOString(),
  };
  walletStore.transactions.push(transaction);

  // Auto-activate if balance > 0
  if (wallet.balance > 0 && wallet.status === "inactive") {
    const billing = require("./billingStore");
    const sub = billing.store.subscriptions.find(
      (s) => s.customer_id === customerId && s.plan_id,
    );
    const plan = sub
      ? billing.store.service_plans.find((p) => p.id === sub.plan_id)
      : null;
    const dailyRate = plan ? plan.price / 30 : 1;

    wallet.daily_rate = dailyRate;
    wallet.status = "active";
    wallet.activated_at = new Date().toISOString();
    wallet.expires_at = new Date(
      Date.now() + (wallet.balance / dailyRate) * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  // Update expiry
  if (wallet.balance > 0 && wallet.daily_rate > 0) {
    const daysLeft = wallet.balance / wallet.daily_rate;
    wallet.expires_at = new Date(
      Date.now() + daysLeft * 24 * 60 * 60 * 1000,
    ).toISOString();

    // If was suspended, reactivate
    if (wallet.status === "suspended") {
      wallet.status = "active";
      const billing = require("./billingStore");
      const sub = billing.store.subscriptions.find(
        (s) => s.customer_id === customerId,
      );
      if (sub && sub.status === "suspended") {
        sub.status = "active";
        sub.updated_at = new Date().toISOString();
      }
    }
  }

  return { wallet, transaction };
}

// ─── Daily Deduction (runs via cron) ───
async function runDailyDeductions() {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  if (db) {
    // PG path
    const results = { deducted: [], suspended: [] };

    const walletResult = await db.query(
      `SELECT * FROM wallets WHERE status = 'active' AND daily_rate > 0 AND (last_deduction IS NULL OR last_deduction < CURRENT_DATE)`,
    );

    for (const wallet of walletResult.rows) {
      const balance = parseFloat(wallet.balance);
      const dailyRate = parseFloat(wallet.daily_rate);

      if (balance >= dailyRate) {
        // Deduct daily rate
        const newBalance = balance - dailyRate;
        await db.query(
          `UPDATE wallets SET balance = $1, last_deduction = CURRENT_DATE, updated_at = NOW() WHERE id = $2`,
          [newBalance, wallet.id],
        );

        const transId = uuidv4();
        await db.query(
          `INSERT INTO wallet_transactions (id, wallet_id, customer_id, type, amount, method, reference, balance_after, created_at)
           VALUES ($1, $2, $3, 'debit', $4, 'daily_subscription', $5, $6, NOW())`,
          [
            transId,
            wallet.id,
            wallet.customer_id,
            dailyRate,
            `Daily deduction ${today}`,
            newBalance,
          ],
        );

        results.deducted.push({
          customer_id: wallet.customer_id,
          amount: dailyRate,
          balance: newBalance,
        });
      } else {
        // Insufficient balance - suspend
        await db.query(
          `UPDATE wallets SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
          [wallet.id],
        );

        const transId = uuidv4();
        await db.query(
          `INSERT INTO wallet_transactions (id, wallet_id, customer_id, type, amount, method, reference, balance_after, created_at)
           VALUES ($1, $2, $3, 'suspension', 0, 'insufficient_balance', $4, $5, NOW())`,
          [
            transId,
            wallet.id,
            wallet.customer_id,
            `Suspended - balance ${balance.toFixed(2)} < daily rate ${dailyRate.toFixed(2)}`,
            balance,
          ],
        );

        // Suspend subscription
        const billing = require("./billingStore");
        const sub = billing.store.subscriptions.find(
          (s) => s.customer_id === wallet.customer_id,
        );
        if (sub && sub.status === "active") {
          sub.status = "suspended";
          sub.updated_at = new Date().toISOString();
        }

        results.suspended.push({
          customer_id: wallet.customer_id,
          balance: balance,
          daily_rate: dailyRate,
        });
      }
    }

    return results;
  }

  // In-memory fallback
  const results = { deducted: [], suspended: [] };

  for (const wallet of walletStore.wallets) {
    if (wallet.status !== "active" || wallet.daily_rate <= 0) {continue;}

    // Skip if already deducted today
    if (wallet.last_deduction === today) {continue;}

    if (wallet.balance >= wallet.daily_rate) {
      // Deduct daily rate
      wallet.balance -= wallet.daily_rate;
      wallet.last_deduction = today;
      wallet.updated_at = new Date().toISOString();

      walletStore.transactions.push({
        id: uuidv4(),
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        type: "debit",
        amount: wallet.daily_rate,
        method: "daily_subscription",
        reference: `Daily deduction ${today}`,
        balance_after: wallet.balance,
        created_at: new Date().toISOString(),
      });

      results.deducted.push({
        customer_id: wallet.customer_id,
        amount: wallet.daily_rate,
        balance: wallet.balance,
      });
    } else {
      // Insufficient balance - suspend
      wallet.status = "suspended";
      wallet.updated_at = new Date().toISOString();

      walletStore.transactions.push({
        id: uuidv4(),
        wallet_id: wallet.id,
        customer_id: wallet.customer_id,
        type: "suspension",
        amount: 0,
        method: "insufficient_balance",
        reference: `Suspended - balance ${wallet.balance.toFixed(2)} < daily rate ${wallet.daily_rate.toFixed(2)}`,
        balance_after: wallet.balance,
        created_at: new Date().toISOString(),
      });

      // Suspend subscription
      const billing = require("./billingStore");
      const sub = billing.store.subscriptions.find(
        (s) => s.customer_id === wallet.customer_id,
      );
      if (sub && sub.status === "active") {
        sub.status = "suspended";
        sub.updated_at = new Date().toISOString();
      }

      results.suspended.push({
        customer_id: wallet.customer_id,
        balance: wallet.balance,
        daily_rate: wallet.daily_rate,
      });
    }
  }

  return results;
}

// ─── Get Wallet ───
async function getWallet(customerId) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT * FROM wallets WHERE customer_id = $1",
      [customerId],
    );
    return result.rows[0] || null;
  }
  return walletStore.wallets.find((w) => w.customer_id === customerId) || null;
}

// ─── Get Transactions ───
async function getTransactions(customerId, limit = 20) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      "SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2",
      [customerId, limit],
    );
    return result.rows;
  }
  return walletStore.transactions
    .filter((t) => t.customer_id === customerId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

// ─── Get All Wallets ───
async function getAllWallets() {
  const db = getDb();
  const billing = require("./billingStore");

  if (db) {
    const result = await db.query(
      "SELECT * FROM wallets ORDER BY created_at DESC",
    );
    return result.rows.map((w) => {
      const customer = billing.store.customers.find(
        (c) => c.id === w.customer_id,
      );
      return {
        ...w,
        customer_name: customer?.name,
        customer_phone: customer?.phone,
      };
    });
  }

  return walletStore.wallets.map((w) => {
    const customer = billing.store.customers.find(
      (c) => c.id === w.customer_id,
    );
    return {
      ...w,
      customer_name: customer?.name,
      customer_phone: customer?.phone,
    };
  });
}

// ─── Set Daily Rate ───
async function setDailyRate(customerId, rate) {
  const db = getDb();
  if (db) {
    const walletResult = await db.query(
      "SELECT * FROM wallets WHERE customer_id = $1",
      [customerId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {return null;}

    const parsedRate = parseFloat(rate);
    const updates = {
      daily_rate: parsedRate,
      updated_at: new Date().toISOString(),
    };

    if (parseFloat(wallet.balance) > 0 && wallet.status === "inactive") {
      updates.status = "active";
      updates.activated_at = new Date().toISOString();
      updates.expires_at = new Date(
        Date.now() +
          (parseFloat(wallet.balance) / parsedRate) * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    await db.query(
      `UPDATE wallets SET daily_rate = $1, status = $2, activated_at = $3, expires_at = $4, updated_at = NOW() WHERE id = $5`,
      [
        updates.daily_rate,
        updates.status || wallet.status,
        updates.activated_at || wallet.activated_at,
        updates.expires_at || wallet.expires_at,
        wallet.id,
      ],
    );

    return { ...wallet, ...updates };
  }

  const wallet = walletStore.wallets.find((w) => w.customer_id === customerId);
  if (wallet) {
    wallet.daily_rate = parseFloat(rate);
    wallet.updated_at = new Date().toISOString();
    if (wallet.balance > 0 && wallet.status === "inactive") {
      wallet.status = "active";
      wallet.activated_at = new Date().toISOString();
      wallet.expires_at = new Date(
        Date.now() + (wallet.balance / wallet.daily_rate) * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
    return wallet;
  }
  return null;
}

// ─── Auto-set rates from plans ───
async function autoSetRatesFromPlans() {
  const db = getDb();
  const billing = require("./billingStore");

  if (db) {
    const wallets = await db.query(
      `SELECT * FROM wallets WHERE daily_rate <= 0 OR daily_rate IS NULL`,
    );

    for (const wallet of wallets.rows) {
      const sub = billing.store.subscriptions.find(
        (s) => s.customer_id === wallet.customer_id,
      );
      const plan = sub
        ? billing.store.service_plans.find((p) => p.id === sub.plan_id)
        : null;
      if (!plan) {continue;}

      const dailyRate = plan.price / 30;
      const updates = { daily_rate: dailyRate };

      if (parseFloat(wallet.balance) > 0) {
        updates.status = "active";
        updates.activated_at = wallet.activated_at || new Date().toISOString();
        updates.expires_at = new Date(
          Date.now() +
            (parseFloat(wallet.balance) / dailyRate) * 24 * 60 * 60 * 1000,
        ).toISOString();
      }

      await db.query(
        `UPDATE wallets SET daily_rate = $1, status = $2, activated_at = $3, expires_at = $4, updated_at = NOW() WHERE id = $5`,
        [
          updates.daily_rate,
          updates.status || wallet.status,
          updates.activated_at || wallet.activated_at,
          updates.expires_at || wallet.expires_at,
          wallet.id,
        ],
      );
    }

    // Return updated wallets
    const updated = await db.query(
      "SELECT * FROM wallets ORDER BY created_at DESC",
    );
    return updated.rows.map((w) => {
      const customer = billing.store.customers.find(
        (c) => c.id === w.customer_id,
      );
      return {
        ...w,
        customer_name: customer?.name,
        customer_phone: customer?.phone,
      };
    });
  }

  for (const wallet of walletStore.wallets) {
    if (wallet.daily_rate > 0) {continue;}
    const sub = billing.store.subscriptions.find(
      (s) => s.customer_id === wallet.customer_id,
    );
    const plan = sub
      ? billing.store.service_plans.find((p) => p.id === sub.plan_id)
      : null;
    if (plan) {
      wallet.daily_rate = plan.price / 30;
      if (wallet.balance > 0) {
        wallet.status = "active";
        wallet.activated_at = wallet.activated_at || new Date().toISOString();
        wallet.expires_at = new Date(
          Date.now() +
            (wallet.balance / wallet.daily_rate) * 24 * 60 * 60 * 1000,
        ).toISOString();
      }
      wallet.updated_at = new Date().toISOString();
    }
  }

  return walletStore.wallets.map((w) => {
    const customer = billing.store.customers.find(
      (c) => c.id === w.customer_id,
    );
    return {
      ...w,
      customer_name: customer?.name,
      customer_phone: customer?.phone,
    };
  });
}

module.exports = {
  walletStore,
  topUp,
  runDailyDeductions,
  getWallet,
  getTransactions,
  getAllWallets,
  setDailyRate,
  autoSetRatesFromPlans,
};
