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

/** Convert a RouterOS rate string (5M, 512k, 1G or plain bps) to bits/sec. */
function toBps(value) {
  const match = clean(value).match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!match) {return 0;}
  const multiplier = { '': 1, K: 1000, M: 1000000, G: 1000000000, T: 1000000000000 }[
    match[2].toUpperCase()
  ];
  return Math.round(Number(match[1]) * multiplier);
}

/** Split a RouterOS rate-limit string into its queue properties. */
function toQueueParams(rateLimit) {
  const parts = clean(rateLimit).split(/\s+/).filter(Boolean);
  if (!parts[0]) {return null;}
  const [rx, tx = rx] = parts[0].split('/');
  // RouterOS queue order matches the rate-limit string: upload/download.
  const params = {
    'max-limit': `${toBps(rx)}/${toBps(tx)}`,
    'limit-at': `${toBps(rx)}/${toBps(tx)}`,
  };
  if (parts[1]) {
    const [burstRx, burstTx = burstRx] = parts[1].split('/');
    params['burst-limit'] = `${toBps(burstRx)}/${toBps(burstTx)}`;
  }
  if (parts[2]) {
    const [thresholdRx, thresholdTx = thresholdRx] = parts[2].split('/');
    params['burst-threshold'] = `${toBps(thresholdRx)}/${toBps(thresholdTx)}`;
  }
  if (parts[3]) {params['burst-time'] = `${parts[3]}s`;}
  return params;
}

function buildHotspotRateLimit(plan) {
  // Hotspot user profiles use the same rx/tx (upload/download) convention.
  return buildRateLimit(plan);
}

module.exports = {
  buildRateLimit,
  buildHotspotRateLimit,
  toBps,
  toQueueParams,
};
