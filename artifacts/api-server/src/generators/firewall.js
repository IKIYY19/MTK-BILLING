/**
 * Firewall & NAT Module Generator
 * Generates MikroTik RouterOS commands for firewall, NAT, mangle, and raw rules
 */

class FirewallGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Firewall & NAT Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.address_lists) {
      this.generateAddressLists();
    }

    if (this.config.filter_rules) {
      this.generateFilterRules();
    }

    if (this.config.nat_rules) {
      this.generateNAT();
    }

    if (this.config.mangle_rules) {
      this.generateMangle();
    }

    if (this.config.raw_rules) {
      this.generateRaw();
    }

    return this.lines.join('\n');
  }

  generateAddressLists() {
    this.lines.push('# Address Lists');
    for (const list of this.config.address_lists) {
      const comment = list.comment ? ` comment="${list.comment}"` : '';
      const timeout = list.timeout ? ` timeout=${list.timeout}` : '';
      this.lines.push(`/ip firewall address-list add address=${list.address} list=${list.name}${timeout}${comment}`);
    }

    // Anti brute force template
    if (this.config.anti_bruteforce) {
      this.lines.push('');
      this.lines.push('# Anti Brute Force Rules');
      this.lines.push('/ip firewall address-list add address=0.0.0.0/0 list=brute_force_dst timeout=1m');
      this.lines.push('/ip firewall filter add chain=input dst-address-list=brute_force_dst action=drop comment="Drop brute force sources"');
    }
    this.lines.push('');
  }

  generateFilterRules() {
    this.lines.push('# Firewall Filter Rules');
    for (const rule of this.config.filter_rules) {
      const parts = [];
      parts.push(`chain=${rule.chain}`);

      if (rule.action) {parts.push(`action=${rule.action}`);}
      if (rule.comment) {parts.push(`comment="${rule.comment}"`);}
      if (rule.connection_state) {parts.push(`connection-state=${rule.connection_state}`);}
      if (rule.protocol) {parts.push(`protocol=${rule.protocol}`);}
      if (rule['src-address']) {parts.push(`src-address=${rule['src-address']}`);}
      if (rule['dst-address']) {parts.push(`dst-address=${rule['dst-address']}`);}
      if (rule['in-interface']) {parts.push(`in-interface=${rule['in-interface']}`);}
      if (rule['out-interface']) {parts.push(`out-interface=${rule['out-interface']}`);}
      if (rule['src-port']) {parts.push(`src-port=${rule['src-port']}`);}
      if (rule['dst-port']) {parts.push(`dst-port=${rule['dst-port']}`);}
      if (rule['address-list']) {parts.push(`address-list=${rule['address-list']}`);}
      if (rule['address-list-timeout']) {parts.push(`address-list-timeout=${rule['address-list-timeout']}`);}
      if (rule.limit) {parts.push(`limit=${rule.limit}`);}
      if (rule.log) {parts.push(`log=yes`);}
      if (rule['log-prefix']) {parts.push(`log-prefix="${rule['log-prefix']}"`);}

      this.lines.push(`/ip firewall filter add ${parts.join(' ')}`);
    }
    this.lines.push('');
  }

  generateNAT() {
    this.lines.push('# NAT Rules');
    for (const rule of this.config.nat_rules) {
      const parts = [];
      parts.push(`chain=${rule.chain}`);

      if (rule.action) {parts.push(`action=${rule.action}`);}
      if (rule.comment) {parts.push(`comment="${rule.comment}"`);}
      if (rule['out-interface']) {parts.push(`out-interface=${rule['out-interface']}`);}
      if (rule['in-interface']) {parts.push(`in-interface=${rule['in-interface']}`);}
      if (rule['src-address']) {parts.push(`src-address=${rule['src-address']}`);}
      if (rule['dst-address']) {parts.push(`dst-address=${rule['dst-address']}`);}
      if (rule['to-addresses']) {parts.push(`to-addresses=${rule['to-addresses']}`);}
      if (rule['to-ports']) {parts.push(`to-ports=${rule['to-ports']}`);}
      if (rule.protocol) {parts.push(`protocol=${rule.protocol}`);}
      if (rule['dst-port']) {parts.push(`dst-port=${rule['dst-port']}`);}

      this.lines.push(`/ip firewall nat add ${parts.join(' ')}`);
    }
    this.lines.push('');
  }

  generateMangle() {
    this.lines.push('# Mangle Rules');
    for (const rule of this.config.mangle_rules) {
      const parts = [];
      parts.push(`chain=${rule.chain}`);

      if (rule.action) {parts.push(`action=${rule.action}`);}
      if (rule.comment) {parts.push(`comment="${rule.comment}"`);}
      if (rule.protocol) {parts.push(`protocol=${rule.protocol}`);}
      if (rule['src-address']) {parts.push(`src-address=${rule['src-address']}`);}
      if (rule['dst-address']) {parts.push(`dst-address=${rule['dst-address']}`);}
      if (rule['in-interface']) {parts.push(`in-interface=${rule['in-interface']}`);}
      if (rule['out-interface']) {parts.push(`out-interface=${rule['out-interface']}`);}
      if (rule['src-port']) {parts.push(`src-port=${rule['src-port']}`);}
      if (rule['dst-port']) {parts.push(`dst-port=${rule['dst-port']}`);}
      if (rule['connection-mark']) {parts.push(`connection-mark=${rule['connection-mark']}`);}
      if (rule['routing-mark']) {parts.push(`routing-mark=${rule['routing-mark']}`);}
      if (rule['passthrough'] !== undefined) {parts.push(`passthrough=${rule['passthrough']}`);}
      if (rule['new-packet-mark']) {parts.push(`new-packet-mark=${rule['new-packet-mark']}`);}
      if (rule['new-connection-mark']) {parts.push(`new-connection-mark=${rule['new-connection-mark']}`);}
      if (rule['new-routing-mark']) {parts.push(`new-routing-mark=${rule['new-routing-mark']}`);}
      if (rule['dscp']) {parts.push(`dscp=${rule['dscp']}`);}

      this.lines.push(`/ip firewall mangle add ${parts.join(' ')}`);
    }
    this.lines.push('');
  }

  generateRaw() {
    this.lines.push('# Raw Rules');
    for (const rule of this.config.raw_rules) {
      const parts = [];
      parts.push(`chain=${rule.chain}`);

      if (rule.action) {parts.push(`action=${rule.action}`);}
      if (rule.comment) {parts.push(`comment="${rule.comment}"`);}
      if (rule.protocol) {parts.push(`protocol=${rule.protocol}`);}
      if (rule['src-address']) {parts.push(`src-address=${rule['src-address']}`);}
      if (rule['dst-address']) {parts.push(`dst-address=${rule['dst-address']}`);}
      if (rule['in-interface']) {parts.push(`in-interface=${rule['in-interface']}`);}
      if (rule['dst-port']) {parts.push(`dst-port=${rule['dst-port']}`);}

      this.lines.push(`/ip firewall raw add ${parts.join(' ')}`);
    }
    this.lines.push('');
  }
}

module.exports = FirewallGenerator;
