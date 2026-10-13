/**
 * Load Balancing & Failover Module Generator
 * Generates MikroTik RouterOS commands for PCC, ECMP, recursive routing, and netwatch
 */

class LoadBalancingGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Load Balancing & Failover Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.pcc) {
      this.generatePCC();
    }

    if (this.config.ecmp) {
      this.generateECMP();
    }

    if (this.config.recursive_routing) {
      this.generateRecursiveRouting();
    }

    if (this.config.netwatch) {
      this.generateNetwatch();
    }

    return this.lines.join('\n');
  }

  generatePCC() {
    this.lines.push('# PCC Load Balancing');
    const pcc = this.config.pcc;
    const wanCount = pcc.wan_count || 2;

    // Mangle rules for PCC
    this.lines.push('# PCC Mangle Rules - Connection Marking');
    for (let i = 0; i < wanCount; i++) {
      const wanInterface = pcc.wan_interfaces?.[i] || `ether${i + 1}`;
      const wanSubnet = pcc.wan_subnets?.[i] || `10.0.${i + 1}.0/24`;
      const wanGateway = pcc.wan_gateways?.[i] || `10.0.${i + 1}.1`;

      // Input chain - mark connections
      this.lines.push(`/ip firewall mangle add chain=input in-interface=${wanInterface} action=mark-connection new-connection-mark=${wanInterface}-conn passthrough=yes comment="PCC mark connection WAN${i + 1}"`);

      // Prerouting chain - mark routing
      this.lines.push(`/ip firewall mangle add chain=prerouting in-interface=bridge connection-mark=${wanInterface}-conn passthrough=no action=mark-routing new-routing-mark=to_${wanInterface} comment="PCC mark routing WAN${i + 1}"`);

      // Output chain - exclude local traffic
      this.lines.push(`/ip firewall mangle add chain=output out-interface=${wanInterface} action=accept comment="PCC exclude local WAN${i + 1}"`);
    }

    // PCC distribution rules
    this.lines.push('');
    this.lines.push('# PCC Distribution Rules');
    for (let i = 0; i < wanCount; i++) {
      const wanInterface = pcc.wan_interfaces?.[i] || `ether${i + 1}`;
      const wanGateway = pcc.wan_gateways?.[i] || `10.0.${i + 1}.1`;
      const wanSubnet = pcc.wan_subnets?.[i] || `10.0.${i + 1}.0/24`;

      this.lines.push(`/ip firewall mangle add chain=prerouting dst-address=!${wanSubnet} connection-mark=no-mark action=mark-connection new-connection-mark=${wanInterface}-pcc passthrough=yes connection-state=new per-connection-classifier=${i + 1}/${wanCount} comment="PCC distribute WAN${i + 1}"`);
      this.lines.push(`/ip firewall mangle add chain=prerouting dst-address=!${wanSubnet} connection-mark=${wanInterface}-pcc action=mark-routing new-routing-mark=to_${wanInterface} passthrough=no comment="PCC route WAN${i + 1}"`);
    }

    // Routes for PCC
    this.lines.push('');
    this.lines.push('# PCC Routes');
    for (let i = 0; i < wanCount; i++) {
      const wanInterface = pcc.wan_interfaces?.[i] || `ether${i + 1}`;
      const wanGateway = pcc.wan_gateways?.[i] || `10.0.${i + 1}.1`;

      this.lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${wanGateway} routing-mark=to_${wanInterface} comment="PCC route WAN${i + 1}"`);
    }

    // Default route with ECMP
    if (pcc.ecmp_fallback) {
      this.lines.push('');
      this.lines.push('# ECMP Default Route');
      const gateways = [];
      for (let i = 0; i < wanCount; i++) {
        const wanGateway = pcc.wan_gateways?.[i] || `10.0.${i + 1}.1`;
        gateways.push(wanGateway);
      }
      this.lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${gateways.join(',')} comment="ECMP default route"`);
    }

    this.lines.push('');
  }

  generateECMP() {
    this.lines.push('# ECMP Load Balancing');
    const ecmp = this.config.ecmp;

    // ECMP Routes
    if (ecmp.routes) {
      for (const route of ecmp.routes) {
        const dstAddress = route['dst-address'] ? ` dst-address=${route['dst-address']}` : '';
        const gateways = route.gateways ? ` gateway=${route.gateways.join(',')}` : '';
        const distance = route.distance ? ` distance=${route.distance}` : '';
        const comment = route.comment ? ` comment="${route.comment}"` : '';

        this.lines.push(`/ip route add${dstAddress}${gateways}${distance}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateRecursiveRouting() {
    this.lines.push('# Recursive Routing Failover');
    const recursive = this.config.recursive_routing;

    if (recursive.routes) {
      for (const route of recursive.routes) {
        const dstAddress = route['dst-address'] ? ` dst-address=${route['dst-address']}` : '';
        const gateway = route.gateway ? ` gateway=${route.gateway}` : '';
        const routingMark = route['routing-mark'] ? ` routing-mark=${route['routing-mark']}` : '';
        const targetScope = route['target-scope'] ? ` target-scope=${route['target-scope']}` : '';
        const scope = route.scope ? ` scope=${route.scope}` : '';
        const distance = route.distance ? ` distance=${route.distance}` : '';
        const comment = route.comment ? ` comment="${route.comment}"` : '';

        this.lines.push(`/ip route add${dstAddress}${gateway}${routingMark}${targetScope}${scope}${distance}${comment}`);
      }
    }

    // Check routes for recursion
    if (recursive.check_routes) {
      for (const checkRoute of recursive.check_routes) {
        const dstAddress = checkRoute['dst-address'] ? ` dst-address=${checkRoute['dst-address']}` : '';
        const gateway = checkRoute.gateway ? ` gateway=${checkRoute.gateway}` : '';
        const comment = checkRoute.comment ? ` comment="${checkRoute.comment}"` : '';

        this.lines.push(`/ip route add${dstAddress}${gateway} scope=10 target-scope=11${comment}`);
      }
    }
    this.lines.push('');
  }

  generateNetwatch() {
    this.lines.push('# Netwatch Failover Scripts');
    const netwatch = this.config.netwatch;

    if (netwatch.hosts) {
      for (const host of netwatch.hosts) {
        const hostAddr = host.host ? ` host=${host.host}` : '';
        const timeout = host.timeout ? ` timeout=${host.timeout}` : '';
        const interval = host.interval ? ` interval=${host.interval}` : '';
        const upScript = host['up-script'] ? ` on-up="${host['up-script']}"` : '';
        const downScript = host['down-script'] ? ` on-down="${host['down-script']}"` : '';
        const comment = host.comment ? ` comment="${host.comment}"` : '';

        this.lines.push(`/tool netwatch add${hostAddr}${timeout}${interval}${upScript}${downScript}${comment}`);
      }
    }

    // Example failover script
    if (netwatch.failover_script) {
      this.lines.push('');
      this.lines.push('# Failover Script Example');
      this.lines.push('/system script add name=failover-script source="');
      this.lines.push(':global activeWAN;');
      this.lines.push(':if ($activeWAN = \\"ether1\\") do={');
      this.lines.push('  /ip route set [find comment=\\"Primary WAN\\"] disabled=yes;');
      this.lines.push('  /ip route set [find comment=\\"Backup WAN\\"] disabled=no;');
      this.lines.push('  :set activeWAN \\"ether2\\";');
      this.lines.push('} else={');
      this.lines.push('  /ip route set [find comment=\\"Primary WAN\\"] disabled=no;');
      this.lines.push('  /ip route set [find comment=\\"Backup WAN\\"] disabled=yes;');
      this.lines.push('  :set activeWAN \\"ether1\\";');
      this.lines.push('}"');
    }
    this.lines.push('');
  }
}

module.exports = LoadBalancingGenerator;
