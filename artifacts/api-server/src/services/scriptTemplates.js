const logger = require("../utils/logger");

function esc(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function urlEncodeFunction() {
  return [
    ":global ztpUrlEncode do={",
    '  :local str $1; :local result ""; :local i 0; :local ch ""; :local len [:len $str]',
    "  :while ($i < $len) do={",
    "    :set ch [:pick $str $i]",
    '    :if ($ch = " ") do={ :set result ($result . "%20") } else={',
    '      :if ($ch = "&") do={ :set result ($result . "%26") } else={',
    '        :if ($ch = "=") do={ :set result ($result . "%3D") } else={',
    '          :if ($ch = "/") do={ :set result ($result . "%2F") } else={',
    '            :if ($ch = "?") do={ :set result ($result . "%3F") } else={',
    '              :if ($ch = "#") do={ :set result ($result . "%23") } else={',
    '                :if ($ch = "+") do={ :set result ($result . "%2B") } else={',
    '                  :if ($ch = "@") do={ :set result ($result . "%40") } else={',
    '                    :if ($ch = ":") do={ :set result ($result . "%3A") } else={',
    '                      :if ($ch = "*") do={ :set result ($result . "%2A") } else={',
    '                        :if ($ch = "%") do={ :set result ($result . "%25") } else={',
    "                          :set result ($result . $ch)",
    "                        }",
    "                      }",
    "                    }",
    "                  }",
    "                }",
    "              }",
    "            }",
    "          }",
    "        }",
    "      }",
    "    }",
    "    :set i ($i + 1)",
    "  }",
    "  :return $result",
    "}",
  ];
}

function wanDetectionLines(prefix = "[Setup]") {
  return [
    `:put "${prefix} Detecting WAN interface..."`,
    ':local wanPort ""',
    ":local foundWan false",
    "",
    "  :local defRoutes [/ip route find where dst-address=0.0.0.0/0]",
    "  :if ([:len $defRoutes] > 0) do={",
    '    :local gwIface ""',
    "    :do { :set gwIface [/ip route get ([:pick $defRoutes 0]) gateway-interface] } on-error={}",
    `    :put ("${prefix} Gateway interface: " . $gwIface)`,
    "    :if ([:len $gwIface] > 0) do={",
    "      :set wanPort $gwIface; :set foundWan true",
    `      :put ("${prefix} WAN from route: " . $wanPort)`,
    "    }",
    "  }",
    "",
    "  :if (!$foundWan) do={",
    "    :local dhcpClients [/ip dhcp-client find]",
    "    :if ([:len $dhcpClients] > 0) do={",
    "      :local dhcpIface [/ip dhcp-client get ([:pick $dhcpClients 0]) interface]",
    "      :if ([:len $dhcpIface] > 0) do={",
    "        :set wanPort $dhcpIface; :set foundWan true",
    `        :put ("${prefix} WAN from DHCP: " . $wanPort)`,
    "      }",
    "    }",
    "  }",
    "",
    '  :if (!$foundWan) do={',
    `    :put "${prefix} Testing internet on each interface..."`,
    "    :foreach iface in=[/interface ethernet find where running=yes] do={",
    "      :if (!$foundWan) do={",
    "        :local testIface [/interface ethernet get $iface name]",
    '        :do {',
    '          :if ([:resolve mikrotik.com] != "") do={',
    "            :set wanPort $testIface; :set foundWan true",
    `            :put ("${prefix} WAN via DNS test: " . $wanPort)`,
    "          }",
    "        } on-error={}",
    "      }",
    "    }",
    "  }",
    "",
    "  :if (!$foundWan) do={",
    "    :foreach iface in=[/interface ethernet find where running=yes] do={",
    "      :if (!$foundWan) do={",
    "        :set wanPort [/interface ethernet get $iface name]; :set foundWan true",
    `        :put ("${prefix} WAN fallback (first UP): " . $wanPort)`,
    "      }",
    "    }",
    "  }",
    "",
    "  :if (!$foundWan) do={",
    '    :set wanPort "ether1"',
    `    :put "${prefix} WARNING: No WAN detected, using ether1"`,
    "  }",
    `:put ("${prefix} WAN interface: " . $wanPort)`,
    "",
  ];
}

function interfaceDetectionLines() {
  return [
    "# ── Interface detection ──",
    ':local lanPort ""',
    ':local bridgePorts [/interface bridge find running=yes]',
    ':if ([:len $bridgePorts] > 0) do={ :set lanPort [/interface bridge get ($bridgePorts->0) name] }',
    ':if ([:len $lanPort] = 0) do={ :local ethernetPorts [/interface ethernet find running=yes]; :if ([:len $ethernetPorts] > 0) do={ :set lanPort [/interface ethernet get ($ethernetPorts->0) name] } }',
    ':if ([:len $lanPort] = 0) do={ :set lanPort "bridge1" }',
    ':put ("[Setup] LAN interface: " . $lanPort)',
    "",
  ];
}


  return [
    ...interfaceDetectionLines(),
    "# ── System Identity ──",
    `:local sysName [/system identity get name]`,
    `:if ($sysName != "${esc(routerIdentity)}") do={ /system identity set name="${esc(routerIdentity)}" }`,
    `:put "[Setup] Identity: ${esc(routerIdentity)}"`,
    "",
    "# ── Timezone ──",
    ':do { /system clock set time-zone-name=Africa/Nairobi } on-error={}',
    ':put "[Setup] Timezone configured"',
    "",
    "# ── DNS ──",
    ':do { /ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes cache-size=10000KiB } on-error={}',
    ':put "[Setup] DNS configured"',
    "",
    "# ── NTP ──",
    ':do { /system ntp client set enabled=yes mode=unicast servers=pool.ntp.org } on-error={}',
    ':put "[Setup] NTP configured"',
    "",
    "# ── RADIUS ──",
    `:do { /radius add address=${esc(radiusServer)} secret="${esc(radiusSecret)}" service=ppp,hotspot timeout=300ms comment="ISP RADIUS" disabled=no } on-error={}`,
    ':put "[Setup] RADIUS configured"',
    "",
    "# ── PPPoE Server ──",
    ':do { :if ([:len [/interface pppoe-server server find]] = 0) do={ /interface pppoe-server server add service-name=pppoe-internet interface=$lanPort authentication=pap,chap,mschap1,mschap2 one-session-per-host=yes disabled=no } } on-error={}',

    ':put "[Setup] PPPoE server ready"',
    "",
    "# ── Hotspot Server ──",
    ':do { :if ([:len [/ip hotspot find]] = 0) do={ /ip hotspot add interface=$lanPort disabled=no } } on-error={}',

    ':put "[Setup] Hotspot server ready"',
    "",
  ];
}

function firewallLines() {
  return [
    "# ── Firewall ──",
    ":do {",
    '  /ip firewall filter remove [find comment="ISP Established"]',
    '  /ip firewall filter remove [find comment="ISP Invalid"]',
    '  /ip firewall filter remove [find comment="ISP ICMP"]',
    '  /ip firewall filter remove [find comment="ISP NTP"]',
    '  /ip firewall filter remove [find comment="ISP SSH"]',
    '  /ip firewall filter remove [find comment="ISP WinBox"]',
    '  /ip firewall filter remove [find comment="ISP API"]',
    '  /ip firewall filter remove [find comment="ISP HTTPS"]',
    '  /ip firewall filter remove [find comment="ISP Input Drop"]',
    '  /ip firewall filter remove [find comment="ISP Forward Established"]',
    '  /ip firewall filter remove [find comment="ISP Forward Invalid"]',
    '  /ip firewall filter remove [find comment="ISP Forward Drop"]',
    '  /ip firewall filter remove [find comment="ISP FastTrack"]',
    '  /ip firewall filter remove [find comment="ISP LAN to WAN"]',
    "",
    '  /ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="ISP Established" place-before=0',
    '  /ip firewall filter add chain=input action=drop connection-state=invalid comment="ISP Invalid"',
    '  /ip firewall filter add chain=input protocol=icmp action=accept comment="ISP ICMP"',
    '  /ip firewall filter add chain=input protocol=udp port=123 action=accept comment="ISP NTP"',
    '  /ip firewall filter add chain=input protocol=tcp dst-port=22 action=accept comment="ISP SSH"',
    '  /ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept comment="ISP WinBox"',
    '  /ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept comment="ISP API"',
    '  /ip firewall filter add chain=input protocol=tcp dst-port=443 action=accept comment="ISP HTTPS"',
    '  /ip firewall filter add chain=input action=drop comment="ISP Input Drop"',
    "",
    '  /ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="ISP Forward Established" place-before=0',
    '  /ip firewall filter add chain=forward action=drop connection-state=invalid comment="ISP Forward Invalid"',
    '  /ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="ISP FastTrack"',
    '  /ip firewall filter add chain=forward action=accept in-interface=$lanPort comment="ISP LAN to WAN"',

    '  /ip firewall filter add chain=forward action=drop comment="ISP Forward Drop"',
    "} on-error={}",
    ':put "[Setup] Firewall configured"',
    "",
    "# ── NAT Masquerade ──",
    ':do { /ip firewall nat remove [find comment="ISP Masquerade"]; /ip firewall nat add chain=srcnat action=masquerade out-interface=$wanPort comment="ISP Masquerade" } on-error={}',
    ':put "[Setup] NAT masquerade added"',
    "",
    "# ── Connection Tracking ──",
    ':do { /ip firewall connection tracking set tcp-close-wait-time=10s tcp-time-wait-time=10s } on-error={}',
    ':put "[Setup] Connection tracking tuned"',
    "",
    "# ── Secure Services ──",
    ':do { /ip service set telnet disabled=yes; /ip service set ftp disabled=yes; /ip service set www disabled=yes } on-error={}',
    ':do { /ip ssh set strong-crypto=yes } on-error={}',
    ':put "[Setup] Insecure services disabled, SSH hardened"',
    "",
  ];
}

function reportingLines({ baseUrl, apiKey, slug, fetchMode, certFlag, hasVpn }) {
  const reportUrl = `${baseUrl}/api/router/v1/${slug}/report?model=$model&serial=$serial&version=$version&mac=$mac`;
  const syncUrl = `${baseUrl}/api/router/v1/${slug}/sync`;

  const lines = [
    "# ── Report back ──",
    ':put "[Setup] Reporting to server..."',
    ":local model; :do { :set model [/system routerboard get model] } on-error={}",
    ":local serial; :do { :set serial [/system routerboard get serial-number] } on-error={}",
    ":local version; :do { :set version [/system package get [find name=routeros] version] } on-error={}",
    ":local mac; :do { :set mac [/interface ethernet get [find default-name=$wanPort] mac-address] } on-error={:do { :set mac [/interface ethernet get ([find]->0) mac-address] } on-error={} }",
  ];

  if (hasVpn) {
    lines.push(
      ":local vpnIp \"\"",
      ":do {",
      '  :local sstpAddr [/ip address get [find interface="sstp-isp"] address]',
      '  :local slashPos [:find $sstpAddr "/"]',
      "  :if ([:len $slashPos] > 0) do={",
      "    :set vpnIp [:pick $sstpAddr 0 $slashPos]",
      "  } else={",
      "    :set vpnIp $sstpAddr",
      "  }",
      "} on-error={}",
    );
  }

  lines.push(
    `:local reportUrl "${reportUrl}"`,
    ":local mgmtUser $ztpMgmtUser; :local mgmtPass $ztpMgmtPass"
  );

  if (hasVpn) {
    lines.push(
      ':if ([:len $vpnIp] > 0) do={ :do { :set reportUrl ($reportUrl . "&vpn_ip=" . $vpnIp) } on-error={} }'
    );
  }

  lines.push(
    ':if ([:len $mgmtUser] > 0) do={ :do { :set reportUrl ($reportUrl . "&mgmt_user=" . [$ztpUrlEncode $mgmtUser]) } on-error={} }',
    ':if ([:len $mgmtPass] > 0) do={ :do { :set reportUrl ($reportUrl . "&mgmt_pass=" . [$ztpUrlEncode $mgmtPass]) } on-error={} }',
    `:do { /tool fetch url=$reportUrl http-header-field="Authorization: Bearer ${apiKey}" mode=${fetchMode} ${certFlag} output=none } on-error={}`,
    ':put "[Setup] Report sent"',
    "",
    "# ── Schedule auto-sync ──",
    "/system scheduler remove [find name=billing-sync]",
    `/system scheduler add name=billing-sync interval=5m on-event="/tool fetch url=\\"${syncUrl}\\" http-header-field=\\"Authorization: Bearer ${apiKey}\\" mode=${fetchMode} ${certFlag} output=none" comment="ISP Billing Sync" disabled=no`,
    ':put "[Setup] Sync scheduled every 5 minutes"',
    "",
    '# ── Health self-check ──',
    ':put "[Setup] Running health self-check..."',
    ':put ("  Router Identity: " . [/system identity get name])',
    ':put ("  RouterOS Version: " . [/system package get [find name=routeros] version])',
    ':put ("  WAN: " . $wanPort)',
    ':if ([:len $mgmtUser] > 0) do={ :put ("  API User: " . $mgmtUser) }'
  );

  if (hasVpn) {
    lines.push(
      ':if ([:len $vpnIp] > 0) do={ :put ("  VPN Tunnel IP: " . $vpnIp) }'
    );
  }

  lines.push(
    ':put ""',
    ':put "[Setup] Run this to check health anytime:"',
    `:put "  /tool fetch url=${baseUrl}/api/router/v1/${slug}/health?model=$[/system routerboard get model]&serial=$[/system routerboard get serial-number] http-header-field=\\"Authorization: Bearer ${apiKey}\\" mode=${fetchMode} ${certFlag}\\""`,
    ':put "  Then check: :put \\$[/file get install.rsc contents]\\""',
    "",
  );

  return lines;
}

function buildInstallScript(config) {
  const {
    baseUrl,
    apiKey,
    slug,
    radiusServer,
    radiusSecret,
    routerIdentity,
    fetchMode,
    certFlag,
    vpnServerAddress,
    vpnServerPort,
    vpnUsername,
    vpnPassword,
  } = config;

  const lines = [];
  lines.push("#############################################");
  lines.push("# MikroTik ISP Billing - Full Provisioning");
  lines.push(`# Tenant: ${esc(routerIdentity)}`);
  lines.push(`# Server: ${baseUrl}`);
  lines.push("#############################################");
  lines.push("");
  lines.push(':put "==================== ISP Billing Setup ===================="');
  lines.push("");
  lines.push("# ── Management credentials ──");
  lines.push(":global ztpMgmtUser; :global ztpMgmtPass;");
  lines.push(':local hasCreds [:len $ztpMgmtUser]');
  lines.push(':if ($hasCreds > 0) do={ :put "[Setup] Management credentials: found" } else={ :put "[Setup] No credentials set" }');
  lines.push("");

  // URL Encoder
  lines.push("# ── URL encoder ──");
  lines.push(...urlEncodeFunction());
  lines.push("");

  // WAN Detection
  lines.push("# ── WAN Detection ──");
  lines.push(...wanDetectionLines("[Setup]"));
  lines.push("");

  // Configuration
  lines.push(...configurationLines({ baseUrl, radiusServer, radiusSecret, routerIdentity, fetchMode, certFlag }));
  lines.push("");

  // Firewall
  lines.push(...firewallLines());
  lines.push("");

  // VPN Client setup
  if (vpnServerAddress) {
    const host = esc(vpnServerAddress);
    const user = esc(vpnUsername);
    const pass = esc(vpnPassword);
    const port = vpnServerPort || "443";
    const mode = fetchMode === "https" ? "https" : "http";
    const enableCert = mode === "https" ? "verify-server-certificate=no" : "";

    lines.push("# ── SSTP VPN Client (Auto Link) ──");
    lines.push(":do {");
    lines.push('  /interface sstp-client remove [find name="sstp-isp"]');
    lines.push("} on-error={}");
    lines.push("");
    lines.push(":do {");
    lines.push("  /interface sstp-client add \\");
    lines.push(`    name="sstp-isp" \\`);
    lines.push(`    connect-to=${host}:${port} \\`);
    lines.push(`    user="${user}" \\`);
    lines.push(`    password="${pass}" \\`);
    lines.push("    profile=default-encryption \\");
    lines.push(`    ${enableCert} \\`);
    lines.push('    comment="ISP Remote Access" \\');
    lines.push("    disabled=no");
    lines.push(`} on-error={ :put "[VPN] SSTP client add failed" }`);
    lines.push("");
    lines.push(`:put "[VPN] Connecting to ${host}:${port} as ${user}..."`);
    lines.push(":delay 5s");
    lines.push("");
  }

  // Reporting
  lines.push(...reportingLines({ baseUrl, apiKey, slug, fetchMode, certFlag, hasVpn: !!vpnServerAddress }));
  lines.push("");

  lines.push(":put \"==================== SETUP COMPLETED ====================\"");
  lines.push(`:put "[Setup] Router linked to ${baseUrl}"`);

  return lines.join("\n");
}

function buildVpnScript({ serverAddress, serverPort, username, password, routerIdentity, fetchMode }) {
  const host = esc(serverAddress);
  const user = esc(username);
  const pass = esc(password);
  const port = serverPort || "443";
  const name = (routerIdentity || "mikrotik-router").replace(/\s+/g, "-").toLowerCase();
  const mode = fetchMode === "https" ? "https" : "http";
  const certFlag = mode === "https" ? "check-certificate=no" : "";
  const enableCert = mode === "https" ? "verify-server-certificate=no" : "";

  return [
    "#############################################",
    "# ISP Billing — Remote Winbox / SSTP VPN",
    `# Router: ${esc(routerIdentity || 'Unknown')}`,
    "#############################################",
    "",
    "# ── SSTP VPN Client ──",
    ":do {",
    "  /interface sstp-client remove [find comment=\"ISP Remote Access\"]",
    "} on-error={}",
    "",
    ":do {",
    `  /interface sstp-client add \\`,
    `    name="sstp-isp" \\`,
    `    connect-to=${host}:${port} \\`,
    `    user="${user}" \\`,
    `    password="${pass}" \\`,
    `    profile=default-encryption \\`,
    `    ${enableCert} \\`,
    `    comment="ISP Remote Access" \\`,
    `    disabled=no`,
    "} on-error={ :put \"[VPN] SSTP client added or already exists\" }",
    "",
    `:put "[VPN] Connecting to ${host}:${port} as ${user}..."`,
    ":delay 3s",
    "",
    ":local vpnStatus [/interface sstp-client get [find name=sstp-isp] running]",
    ':if ($vpnStatus) do={',
    '  :put "[VPN] CONNECTED — SSTP tunnel active"',
    `  :put "[VPN] Server: ${host}:${port}"`,
    `  :put "[VPN] Router accessible via SSTP tunnel"`,
    "} else={",
    '  :put "[VPN] FAILED — Check server address and credentials"',
    `  :put "[VPN] Verify: ${host}:${port} is reachable and ${user} has SSTP access"`,
    "}",
    "",
    `:put ""`,
    `:put "[VPN] To disconnect: /interface sstp-client set [find name=sstp-isp] disabled=yes"`,
    `:put "[VPN] To reconnect: /interface sstp-client set [find name=sstp-isp] disabled=no"`,
    `:put ""`,
    `:put "[VPN] Once connected, Winbox to the router's LAN IP through the VPN"`,
    `:put "[VPN] Default LAN: " . [/ip address get [find interface=bridge1] address]`,
    "",
  ].join("\n");
}

module.exports = {
  buildInstallScript,
  buildVpnScript,
  wanDetectionLines,
  configurationLines,
  firewallLines,
  reportingLines,
  urlEncodeFunction,
};
