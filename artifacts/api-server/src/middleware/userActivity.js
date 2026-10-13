/**
 * User Activity Tracking Middleware
 * Updates user's last_seen timestamp and online status on authenticated requests
 */

const logger = require('../utils/logger');

// Online timeout in milliseconds (2 minutes)
const ONLINE_TIMEOUT = 2 * 60 * 1000;

// Update user activity on each authenticated request
async function trackUserActivity(req, res, next) {
  if (!req.user || !req.user.id) {
    return next();
  }

  try {
    const db = global.db || require('../db/memory');
    const now = new Date();
    
    // Update last_seen and set is_online to true
    await db.query(
      `UPDATE users 
       SET last_seen = $1, is_online = true 
       WHERE id = $2`,
      [now.toISOString(), req.user.id]
    );

    logger.debug('User activity tracked', { userId: req.user.id, last_seen: now });
  } catch (error) {
    logger.error('Failed to track user activity', { error: error.message, userId: req.user?.id });
    // Don't block the request if tracking fails
  }

  next();
}

// Periodically mark users as offline if they haven't been seen recently
async function updateOnlineStatus() {
  try {
    const db = global.db || require('../db/memory');
    const threshold = new Date(Date.now() - ONLINE_TIMEOUT);

    const result = await db.query(
      `UPDATE users 
       SET is_online = false 
       WHERE is_online = true 
       AND (last_seen IS NULL OR last_seen < $1)`,
      [threshold.toISOString()]
    );

    if (result.rowCount > 0) {
      logger.info('Marked users as offline', { count: result.rowCount });
    }
  } catch (error) {
    logger.error('Failed to update online status', { error: error.message });
  }
}

// Start the periodic update (run every minute)
let updateInterval;
function startOnlineStatusUpdater() {
  if (updateInterval) {return;}
  
  updateInterval = setInterval(updateOnlineStatus, 60000);
  logger.info('User online status updater started');
}

function stopOnlineStatusUpdater() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    logger.info('User online status updater stopped');
  }
}

module.exports = {
  trackUserActivity,
  updateOnlineStatus,
  startOnlineStatusUpdater,
  stopOnlineStatusUpdater,
};
