const logger = require("../utils/logger");
const service = require("../services/dnsAdblockService");
let started = false;
let busy = false;
function startCron() {
  if (started) return false;
  started = true;
  const maintenance = async () => {
    if (busy || !global.dbAvailable) return;
    busy = true;
    try { const health=await service.checkHealth(); const retries=await service.retryFailed(); logger.info("[DNS Adblock] Router health and retry pass", {checked:health.checked,retries}); }
    catch(error) { logger.error("[DNS Adblock] Maintenance pass failed", {error:error.message}); }
    finally { busy=false; }
  };
  const daily = async () => {
    if (busy || !global.dbAvailable) return;
    busy = true;
    try { logger.info("[DNS Adblock] Scheduled update", await service.dailyUpdate()); }
    catch(error) { logger.error("[DNS Adblock] Scheduled update failed", {error:error.message}); }
    finally { busy=false; }
  };
  setTimeout(maintenance, 90_000).unref?.();
  setTimeout(daily, 120_000).unref?.();
  setInterval(maintenance, 5 * 60_000).unref?.();
  setTimeout(() => { daily(); setInterval(daily, 24 * 60 * 60_000).unref?.(); }, 3 * 60 * 60_000 + 17 * 60_000).unref?.();
  logger.info("[DNS Adblock] Scheduler enabled (daily updates, five-minute router checks/retries)");
  return true;
}
module.exports={startCron};
