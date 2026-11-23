/**
 * Link Bonding helpers: discover bondable interfaces and generate RouterOS
 * bonding configuration. Bonding joins ports to the SAME upstream device;
 * it is not a substitute for PCC across different ISPs.
 */

const routerConnectionManager = require("./routerConnectionManager");

const BOND_MODES = ["802.3ad", "active-backup", "balance-xor", "balance-rr"];

function fail(message) {
  return Object.assign(new Error(message), { status: 400 });
}

const BONDABLE_TYPES = ["ether", "vlan", "sfp", "sfpplus", "wlan"];

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

async function scanBondCandidates(routerId) {
  const [interfaces, bonds, addresses, ethernet] = await Promise.all([
    routerConnectionManager.print(
      routerId,
      "/interface",
      "name,type,mac-address,disabled,running,comment,rx-byte,tx-byte,rx-packet,tx-packet",
    ).catch(() => []),
    routerConnectionManager.print(routerId, "/interface/bonding").catch(() => []),
    routerConnectionManager.print(routerId, "/ip/address").catch(() => []),
    routerConnectionManager.print(
      routerId,
      "/interface/ethernet",
      "name,status,speed,duplex,rx-byte,tx-byte",
    ).catch(() => []),
  ]);

  const sampleStarted = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const secondSample = await routerConnectionManager
    .print(routerId, "/interface", "name,rx-byte,tx-byte")
    .catch(() => []);
  const sampleSeconds = Math.max((Date.now() - sampleStarted) / 1000, 0.1);
  const secondByName = new Map(secondSample.map((item) => [item.name, item]));
  const ethernetByName = new Map(ethernet.map((item) => [item.name, item]));

  const addressByInterface = new Map();
  for (const entry of addresses) {
    if (!entry.interface) {continue;}
    if (!addressByInterface.has(entry.interface)) {addressByInterface.set(entry.interface, []);}
    addressByInterface.get(entry.interface).push(entry.address);
  }

  const existingBonds = bonds.map((bond) => ({
    name: bond.name,
    mode: bond.mode || "unknown",
    slaves: String(bond.slaves || "").split(",").map((name) => name.trim()).filter(Boolean),
    running: bond.running === "true" || bond.running === true,
    comment: bond.comment || "",
  }));

  const slaveNames = new Set(existingBonds.flatMap((bond) => bond.slaves));
  const bondNames = new Set(existingBonds.map((bond) => bond.name));

  const allInterfaces = interfaces.map((iface) => {
    const name = iface.name || iface["default-name"];
    const addressesForInterface = addressByInterface.get(name) || [];
    const eth = ethernetByName.get(name) || {};
    const inBond = slaveNames.has(name);
    const isBond = bondNames.has(name);
    const disabled = iface.disabled === "true" || iface.disabled === true;
    const running = iface.running === "true" || iface.running === true ||
      String(eth.status || "") === "true";
    const type = iface.type || (String(name).startsWith("ether") ? "ether" : "unknown");
    const candidate = Boolean(name) && BONDABLE_TYPES.includes(type) && !isBond && !inBond;
    const warnings = [];
    if (addressesForInterface.length > 0) {warnings.push("has IP - move it to the bond after applying");}
    if (disabled) {warnings.push("disabled");}
    if (!running) {warnings.push("link down");}

    const rxBytes = iface["rx-byte"] || eth["rx-byte"] || "0";
    const txBytes = iface["tx-byte"] || eth["tx-byte"] || "0";
    const rxBps = bitsPerSecond(
      rxBytes,
      secondByName.get(name)?.["rx-byte"] ?? rxBytes,
      sampleSeconds,
    );
    const txBps = bitsPerSecond(
      txBytes,
      secondByName.get(name)?.["tx-byte"] ?? txBytes,
      sampleSeconds,
    );

    return {
      name,
      type,
      mac_address: iface["mac-address"] || eth["mac-address"] || "",
      running,
      disabled,
      link: eth.status || null,
      speed: eth.speed || null,
      duplex: eth.duplex || null,
      in_bond: inBond,
      is_bond: isBond,
      addresses: addressesForInterface,
      rx_bytes: String(rxBytes),
      tx_bytes: String(txBytes),
      rx_bps: rxBps,
      tx_bps: txBps,
      rx_rate: formatRate(rxBps),
      tx_rate: formatRate(txBps),
      warnings,
      candidate,
    };
  });

  return {
    scanned_at: new Date().toISOString(),
    sample_seconds: Number(sampleSeconds.toFixed(2)),
    interfaces: allInterfaces,
    candidates: allInterfaces.filter((iface) => iface.candidate).map((iface) => iface.name),
    existing_bonds: existingBonds,
  };
}

function generateBondScript(config) {
  const name = String(config?.name || "").trim();
  const mode = String(config?.mode || "802.3ad").trim();
  const slaves = Array.isArray(config?.slaves) ? config.slaves.map((s) => String(s).trim()) : [];

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {throw fail("Invalid bond interface name");}
  if (!BOND_MODES.includes(mode)) {throw fail(`Unsupported bonding mode: ${mode}`);}
  if (slaves.length < 2 || slaves.length > 8) {
    throw fail("Select between 2 and 8 slave interfaces");
  }
  if (slaves.some((slave) => !/^[A-Za-z0-9._-]{1,64}$/.test(slave))) {
    throw fail("Invalid slave interface name");
  }
  if (new Set(slaves).size !== slaves.length) {
    throw fail("An interface can only be a slave once");
  }
  if (slaves.includes(name)) {throw fail("Bond cannot be its own slave");}

  const lines = [
    "#############################################",
    "# MikroTik Billing - Link Bonding",
    "# Generated " + new Date().toISOString(),
    "# Bonding requires BOTH ends to use the same mode. Do not bond links from different ISPs.",
    "#############################################",
    "",
    '# Remove only bonds previously generated by this tool',
    '/interface bonding remove [find comment~"^LB-BOND-"]',
    "",
  ];

  const params = [
    `name=${name}`,
    `mode=${mode}`,
    `slaves=${slaves.join(",")}`,
  ];
  if (mode === "802.3ad") {
    params.push("lacp-rate=1sec");
    params.push(`transmit-hash-policy=${config.hash_policy || "layer-2-and-3"}`);
    params.push(`min-links=${Math.max(1, Math.min(Number(config.min_links) || 1, slaves.length))}`);
  } else if (mode === "active-backup") {
    const primary = String(config.primary || slaves[0]).trim();
    if (!slaves.includes(primary)) {throw fail("Primary interface must be one of the slaves");}
    params.push(`primary=${primary}`);
    params.push(`link-monitor-interval=${Math.max(100, Math.min(Number(config.link_monitor_interval) || 100, 10000))}`);
  }

  lines.push(`/interface bonding add ${params.join(" ")} comment="LB-BOND-${name}"`);
  lines.push("");
  lines.push("# After applying:");
  lines.push(`#  1. Move the IP address / DHCP client / PPPoE client from the slave ports to ${name}.`);
  lines.push(`#  2. Update NAT and firewall rules that referenced the old interface.`);
  lines.push("#  3. On the upstream switch, configure a matching LAG for 802.3ad / balance-xor.");
  lines.push("#  4. Remove the old default route if it pointed at a slave port.");
  lines.push("");

  return lines.join("\n");
}

module.exports = { scanBondCandidates, generateBondScript, BOND_MODES };
