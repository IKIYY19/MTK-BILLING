/**
 * Automatically resumes PPPoE subscriptions whose vacation pause has ended.
 */
const logger = require("../utils/logger");

async function run() {
  if (!global.dbAvailable || !global.db) {return;}
  try {
    const { autoResumeExpired } = require("../services/subscriptionPause");
    const result = await autoResumeExpired();
    if (result.resumed > 0 || result.failed > 0) {
      logger.info("Subscription pause cron completed", result);
    }
  } catch (error) {
    logger.error("Subscription pause cron failed", { error: error.message });
  }
}

function startCron() {
  const timer = setInterval(run, 5 * 60 * 1000);
  if (timer.unref) {timer.unref();}
  const initial = setTimeout(run, 60 * 1000);
  if (initial.unref) {initial.unref();}
  return timer;
}

module.exports = { run, startCron };
