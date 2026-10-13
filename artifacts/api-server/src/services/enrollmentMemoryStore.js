"use strict";

/**
 * Shared in-memory state for Zero-Touch enrollment.
 *
 * This store is used only when PostgreSQL is not available. It allows the
 * authenticated admin routes and public MikroTik enrollment routes to share the
 * same enrollment token/discovered-router state during local development,
 * testing, or demo mode.
 *
 * Production deployments should use PostgreSQL so enrollment state survives
 * process restarts.
 */

module.exports = {
  tokens: [],
  discovered: [],
};
