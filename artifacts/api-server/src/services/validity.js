/**
 * Plan validity is stored as days + hours + minutes. All expiry calculations
 * and RouterOS uptime limits go through these helpers so they stay consistent.
 */

function parts(plan = {}) {
  return {
    days: Math.max(0, Number(plan.validity_days) || 0),
    hours: Math.max(0, Number(plan.validity_hours) || 0),
    minutes: Math.max(0, Number(plan.validity_minutes) || 0),
  };
}

function totalMinutes(plan) {
  const { days, hours, minutes } = parts(plan);
  return days * 1440 + hours * 60 + minutes;
}

function toUptime(plan) {
  const { days, hours, minutes } = parts(plan);
  let value = "";
  if (days) {value += `${days}d`;}
  if (hours) {value += `${hours}h`;}
  if (minutes) {value += `${minutes}m`;}
  return value || "1d";
}

function label(plan) {
  const { days, hours, minutes } = parts(plan);
  const pieces = [];
  if (days) {pieces.push(`${days}d`);}
  if (hours) {pieces.push(`${hours}h`);}
  if (minutes) {pieces.push(`${minutes}m`);}
  return pieces.join(" ") || "—";
}

function endDate(plan, startDate = new Date()) {
  const minutes = totalMinutes(plan);
  if (!minutes) {return null;}
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {return null;}
  return new Date(start.getTime() + minutes * 60000).toISOString();
}

module.exports = { parts, totalMinutes, toUptime, label, endDate };
