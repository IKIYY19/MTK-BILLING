/**
 * Load Balancing helpers: interface discovery, internet detection and
 * RouterOS PCC script generation.
 */

const routerConnectionManager = require("./routerConnectionManager");

const PING_TARGET = "1.1.1.1";
const MAX_SCAN_INTERFACES = 12;

function bitsPerSecond(first, second, seconds) {
  const delta = Math.max(0, Number(second || 0) - Number(first || 0));
  return Math.round((delta * 8) / seconds);
}

function formatRate(bps) {
  if (!Number.isFinite(bps) || bps <= 0) {return "0 bps";}
  if (bps >= 1_000_000_000) {return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;}
  if (bps >= 1_000_000) {return `${(bps / 1_000_000).toFixed(2)} Mbps`;}
  if (bps >= 1_000) {return `${(bps / 1_000).toFixed(1)} Kbps`;}
  return `${bps} bps`;
}

function fail(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function subnetOf(address) {
  const value = String(address || "");
  const [ip, prefix] = value.split("/");
  if (!prefix) {return null;}
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) {return null;}
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {return null;}
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = octets.reduce((acc, octet) => (acc << 8) | octet, 0) >>> 0;
  const base = (network & mask) >>> 0;
  return `${(base >>> 24) & 255}.${(base >>> 16) & 255}.${(base >>> 8) & 255}.${base & 255}/${bits}`;
}

function parsePing(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const replies = list.filter((row) => row && (row.time || row["avg-rtt"]));
  const lossRow = list.find((row) => row && row["packet-loss"] !== undefined);
  const packetLoss = lossRow ? parseFloat(lossRow["packet-loss"]) : null;
  if (replies.length === 0) {
    return { internet: false, packetLoss: packetLoss ?? 100, latencyMs: null };
  }
  const times = replies
    .map((row) => parseFloat(String(row.time || row["avg-rtt"] || "")))
    .filter((value) => Number.isFinite(value));
  return {
    internet: packetLoss === null ? true : packetLoss < 100,
    packetLoss: packetLoss ?? 0,
    latencyMs: times.length
      ? Math.round((times.reduce((sum, value) => sum + value, 0) / times.length) * 100) / 100
      : null,
  };
}

async function testInternet(routerId, interfaceName, target) {
  try {
    const rows = await routerConnectionManager.executeCommand(
      routerId,
      "/ping",
      { address: target || PING_TARGET, interface: interfaceName, count: "2" },
      { timeoutMs: 6000 },
    );
    return parsePing(rows);
  } catch (error) {
    return { internet: false, packetLoss: 100, latencyMs: null, error: error.message };
  }
}

async function scanInterfaces(routerId, options = {}) {
  const scanStarted = Date.now();
  const [rawInterfaces, addresses, routes, dhcpClients] = await Promise.all([
    routerConnectionManager.print(
      routerId,
      "/interface",
      "name,type,mac-address,disabled,running,comment,rx-byte,tx-byte",
    ).catch(() => []),
    routerConnectionManager.print(routerId, "/ip/address").catch(() => []),
    routerConnectionManager.print(routerId, "/ip/route").catch(() => []),
    routerConnectionManager.print(routerId, "/ip/dhcp-client").catch(() => []),
  ]);

  const defaultRoutes = routes.filter((route) => route["dst-address"] === "0.0.0.0/0");
  const defaultByInterface = new Map();
  for (const route of defaultRoutes) {
    if (route["gateway-interface"] && !defaultByInterface.has(route["gateway-interface"])) {
      defaultByInterface.set(route["gateway-interface"], route.gateway || "");
    }
  }
  const dhcpByInterface = new Map();
  for (const client of dhcpClients) {
    if (client.interface && !dhcpByInterface.has(client.interface)) {
      dhcpByInterface.set(client.interface, client.gateway || "");
    }
  }
  const addressByInterface = new Map();
  for (const entry of addresses) {
    if (!entry.interface) {continue;}
    if (!addressByInterface.has(entry.interface)) {addressByInterface.set(entry.interface, []);}
    addressByInterface.get(entry.interface).push(entry.address);
  }

  const usable = rawInterfaces.filter((iface) => {
    if (iface.disabled === "true" || iface.disabled === true) {return false;}
    const name = iface.name || iface["default-name"];
    if (!name || name === "lo") {return false;}
    return iface.running === "true" || iface.running === true ||
      addressByInterface.has(name) || defaultByInterface.has(name);
  });
  const isWanLike = (iface) => {
    const name = iface.name || iface["default-name"];
    return addressByInterface.has(name) || defaultByInterface.has(name) || dhcpByInterface.has(name);
  };
  const preferred = usable.filter(isWanLike);
  const candidates = (preferred.length > 0 ? preferred : usable).slice(0, MAX_SCAN_INTERFACES);

  const interfaces = [];
  const pingTargets = [];
  for (const iface of candidates) {
    const name = iface.name || iface["default-name"];
    const interfaceAddresses = addressByInterface.get(name) || [];
    const gateway = defaultByInterface.get(name) || dhcpByInterface.get(name) || "";
    const entry = {
      name,
      type: iface.type || "unknown",
      running: iface.running === "true" || iface.running === true,
      mac_address: iface["mac-address"] || "",
      comment: iface.comment || "",
      addresses: interfaceAddresses,
      subnet: subnetOf(interfaceAddresses[0]),
      gateway,
      has_default_route: defaultByInterface.has(name),
      has_dhcp_client: dhcpByInterface.has(name),
      rx_bytes: iface["rx-byte"] || "0",
      tx_bytes: iface["tx-byte"] || "0",
      internet: false,
      packet_loss: 100,
      latency_ms: null,
      ping_error: null,
      skipped: null,
    };
    // Only interfaces with a usable gateway can carry internet traffic.
    if (gateway) {pingTargets.push(entry);}
    else {entry.skipped = "no gateway configured";}
    interfaces.push(entry);
  }

  await Promise.all(pingTargets.map(async (entry) => {
    const pingResult = await testInternet(routerId, entry.name, options.target);
    entry.internet = pingResult.internet;
    entry.packet_loss = pingResult.packetLoss;
    entry.latency_ms = pingResult.latencyMs;
    entry.ping_error = pingResult.error || null;
  }));

  const sampleSeconds = Math.max((Date.now() - scanStarted) / 1000, 0.1);
  const secondSample = await routerConnectionManager
    .print(routerId, "/interface", "name,rx-byte,tx-byte")
    .catch(() => []);
  const secondByName = new Map(secondSample.map((item) => [item.name, item]));
  for (const entry of interfaces) {
    const later = secondByName.get(entry.name) || {};
    const rxBps = bitsPerSecond(
      entry.rx_bytes,
      later["rx-byte"] ?? entry.rx_bytes,
      sampleSeconds,
    );
    const txBps = bitsPerSecond(
      entry.tx_bytes,
      later["tx-byte"] ?? entry.tx_bytes,
      sampleSeconds,
    );
    entry.rx_bps = rxBps;
    entry.tx_bps = txBps;
    entry.rx_rate = formatRate(rxBps);
    entry.tx_rate = formatRate(txBps);
  }

  return {
    target: options.target || PING_TARGET,
    scanned_at: new Date().toISOString(),
    sample_seconds: Number(sampleSeconds.toFixed(2)),
    interfaces,
    detected_wans: interfaces.filter((item) => item.internet).map((item) => item.name),
  };
}

function validateWans(wans) {
  if (!Array.isArray(wans) || wans.length < 2) {
    throw fail("Select at least two interfaces to load balance");
  }
  if (wans.length > 8) {
    throw fail("At most 8 WAN interfaces are supported");
  }
  const safeName = /^[A-Za-z0-9._-]{1,64}$/;
  const safeIp = /^[0-9.]{1,15}$/;
  const safeSubnet = /^[0-9./]{1,18}$/;
  const cleaned = wans.map((wan, index) => {
    const name = String(wan?.name || "").trim();
    const gateway = String(wan?.gateway || "").trim();
    if (!safeName.test(name)) {throw fail(`Invalid interface name at position ${index + 1}`);}
    if (!safeIp.test(gateway)) {throw fail(`Invalid gateway for ${name}`);}
    const weight = Math.max(1, Math.min(8, Math.floor(Number(wan.weight) || 1)));
    const subnet = String(wan.subnet || "").trim();
    if (subnet && !safeSubnet.test(subnet)) {throw fail(`Invalid subnet for ${name}`);}
    return { name, gateway, weight, subnet };
  });
  const names = cleaned.map((wan) => wan.name);
  if (new Set(names).size !== names.length) {
    throw fail("Each interface can only be selected once");
  }
  return cleaned;
}

async function detectRouterOsVersion(routerId) {
  try {
    const resource = await routerConnectionManager.print(
      routerId,
      "/system/resource",
      "version",
    );
    const version = String(resource?.[0]?.version || "");
    const major = Number(version.match(/^\D*(\d+)/)?.[1]);
    return Number.isFinite(major) && major > 0 ? major : 7;
  } catch {
    // v7 is the safe default: it requires routing tables to exist first.
    return 7;
  }
}

function generatePccScript(wans, options = {}) {
  const cleaned = validateWans(wans);
  const lan = String(options.lanInterface || "bridge").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(lan)) {
    throw fail("Invalid LAN/bridge interface name");
  }
  const isV7 = Number(options.routerosMajor) !== 6;
  const routeMarkKey = isV7 ? "routing-table" : "routing-mark";
  const total = cleaned.reduce((sum, wan) => sum + wan.weight, 0);
  const lines = [
    "#############################################",
    "# MikroTik Billing - PCC Load Balancing",
    "# Generated " + new Date().toISOString(),
    "# Review carefully before applying. This changes mangle, NAT and routes.",
    "#############################################",
    "",
    "# Remove only rules previously generated by this tool",
    '/ip firewall mangle remove [find comment~"^LB-"]',
    '/ip firewall nat remove [find comment~"^LB-"]',
    '/ip route remove [find comment~"^LB-"]',
    "/ip firewall filter remove [find comment~\"^LB-\"]",
    "",
    "# FastTrack must not bypass connection marking",
    '/ip firewall filter set [find action=fasttrack-connection] connection-mark=no-mark',
    `/ip firewall filter add chain=forward action=accept connection-mark=no-mark place-before=0 comment="LB-fastrack-accept"`,
    "",
  ];

  if (isV7) {
    lines.push("# RouterOS v7: mark-routing requires the routing tables to exist first");
    lines.push(':do { /routing table remove [find comment~"^LB-"] } on-error={}');
    cleaned.forEach((wan, index) => {
      const mark = `WAN${index + 1}`;
      lines.push(`:if ([:len [/routing table find name=to_${mark}]] = 0) do={ /routing table add name=to_${mark} fib comment="LB-to_${mark}" }`);
    });
    lines.push("");
  }

  cleaned.forEach((wan, index) => {
    const mark = `WAN${index + 1}`;
    lines.push(`# ${wan.name} - inbound connection mark`);
    lines.push(`/ip firewall mangle add chain=input in-interface=${wan.name} action=mark-connection new-connection-mark=${mark}-in passthrough=yes comment="LB-${mark}-in"`);
  });

  lineBreak(lines);
  cleaned.forEach((wan, index) => {
    const mark = `WAN${index + 1}`;
    lines.push(`# ${wan.name} - reply traffic from ${lan}`);
    lines.push(`/ip firewall mangle add chain=prerouting in-interface=${lan} connection-mark=${mark}-in action=mark-routing new-routing-mark=to_${mark} passthrough=no comment="LB-${mark}-reply"`);
  });

  lineBreak(lines);
  let offset = 0;
  cleaned.forEach((wan, index) => {
    const mark = `WAN${index + 1}`;
    for (let step = 0; step < wan.weight; step += 1) {
      lines.push(`/ip firewall mangle add chain=prerouting in-interface=${lan} connection-state=new connection-mark=no-mark dst-address-type=!local per-connection-classifier=both-addresses-and-ports:${total}/${offset + step} action=mark-connection new-connection-mark=${mark}-pcc passthrough=yes comment="LB-${mark}-pcc-${step + 1}"`);
    }
    lines.push(`/ip firewall mangle add chain=prerouting in-interface=${lan} connection-mark=${mark}-pcc action=mark-routing new-routing-mark=to_${mark} passthrough=no comment="LB-${mark}-route"`);
    offset += wan.weight;
  });

  lineBreak(lines);
  cleaned.forEach((wan, index) => {
    const mark = `WAN${index + 1}`;
    lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${wan.gateway} ${routeMarkKey}=to_${mark} check-gateway=ping distance=1 comment="LB-${mark}-default"`);
    lines.push(`/ip firewall nat add chain=srcnat out-interface=${wan.name} action=masquerade comment="LB-${mark}-nat"`);
  });

  lines.push("");
  lines.push("# Existing unmarked default route is left untouched as fallback.");
  return lines.join("\n");
}

function lineBreak(lines) {
  lines.push("");
}

function validateScript(script) {
  const text = String(script || "");
  if (!text.trim()) {throw fail("Script is empty");}
  if (text.length > 200000) {throw fail("Script is too large");}
  const blocked = [
    "/system reset-configuration",
    "/system reboot",
    "/system shutdown",
    "/user remove",
    "/file remove",
  ];
  for (const command of blocked) {
    if (text.toLowerCase().includes(command)) {
      throw fail(`Script contains a blocked command: ${command}`);
    }
  }
  return text;
}

/**
 * Make an arbitrary RouterOS script safe for the target router version.
 * RouterOS v7 needs routing tables to exist before any rule references a
 * routing mark, and /ip route uses `routing-table=` instead of `routing-mark=`.
 * This is applied at push time so every panel (PCC, bonding and custom
 * scripts) gets the same protection, even if the script was generated earlier.
 */
function normalizeScriptForRouterOS(script, routerosMajor) {
  const text = String(script || "");
  if (Number(routerosMajor) !== 7) {
    return text;
  }

  const lines = text.split("\n");
  const marks = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {continue;}
    for (const match of trimmed.matchAll(/(?:new-routing-mark|routing-mark)=([A-Za-z0-9._-]+)/g)) {
      const mark = match[1];
      if (mark && mark !== "no-mark" && mark !== "main") {marks.add(mark);}
    }
  }

  const normalized = lines.map((line) => {
    const trimmed = line.trim();
    if (/^\/ip(?:\s|\/)route\b/i.test(trimmed) && /\brouting-mark=/.test(trimmed)) {
      return line.replace(/\brouting-mark=/g, "routing-table=");
    }
    return line;
  });

  if (marks.size === 0) {
    return normalized.join("\n");
  }

  const setup = [
    "# RouterOS v7: routing tables must exist before they can be referenced",
    ...[...marks].map((mark) => `:if ([:len [/routing table find name=${mark}]] = 0) do={ /routing table add name=${mark} fib }`),
    "",
  ];
  return [...setup, ...normalized].join("\n");
}

module.exports = {
  scanInterfaces,
  detectRouterOsVersion,
  generatePccScript,
  normalizeScriptForRouterOS,
  validateScript,
  subnetOf,
};
