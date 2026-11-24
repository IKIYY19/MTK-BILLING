/**
 * Build RouterOS-compatible rate-limit strings from a service plan.
 *
 * Mikrotik format is from the router's point of view: rx = client upload,
 * tx = client download. So the pair is <upload>/<download>.
 *   <rx>/<tx> [<burst-rx>/<burst-tx>] [<threshold-rx>/<threshold-tx>] <burst-time>
 * Example: 5M/10M 10M/20M 6M/12M 10
 * Burst time is a plain number of seconds (no "s" suffix) in this syntax.
 */

const VALUE = /^\d+(?:\.\d+)?[KMGT]?$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function valid(value, field) {
  if (!value) {return true;}
  if (!VALUE.test(value)) {
    throw new Error(`Invalid ${field}: use a value like 10M, 512k or 1G`);
  }
  return true;
}

/**
 * @param {object} plan service plan (speed_up, speed_down, burst_*)
 */
function buildRateLimit(plan, options = {}) {
  const down = clean(plan?.speed_down);
  const up = clean(plan?.speed_up);
  if (!down || !up) {return "";}

  valid(down, "download speed");
  valid(up, "upload speed");

  const pair = options.order === "down-up" ? `${down}/${up}` : `${up}/${down}`;
  const parts = [pair];

  const burst = clean(plan.burst_limit);
  const threshold = clean(plan.burst_threshold);
  const time = clean(plan.burst_time);
  valid(burst, "burst limit");
  valid(threshold, "burst threshold");

  if (burst) {parts.push(`${burst}/${burst}`);}
  if (threshold) {parts.push(`${threshold}/${threshold}`);}
  if (time) {
    const seconds = time.replace(/s$/i, "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(seconds)) {
      throw new Error("Invalid burst time: use seconds, e.g. 10");
    }
    parts.push(seconds);
  }
  return parts.join(" ");
}

function buildHotspotRateLimit(plan) {
  // Hotspot user profiles use the same rx/tx (upload/download) convention.
  return buildRateLimit(plan);
}

module.exports = { buildRateLimit, buildHotspotRateLimit };
