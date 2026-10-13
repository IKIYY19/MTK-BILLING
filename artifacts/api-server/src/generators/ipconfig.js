/**
 * IP Configuration Module Generator
 * Generates MikroTik RouterOS commands for IP, DNS, and DHCP
 */

class IPConfigGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# IP Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.addresses) {
      this.generateAddresses();
    }

    if (this.config.ipv6_addresses) {
      this.generateIPv6Addresses();
    }

    if (this.config.dns) {
      this.generateDNS();
    }

    if (this.config.dhcp_clients) {
      this.generateDHCPClient();
    }

    if (this.config.dhcp_servers) {
      this.generateDHCPServer();
    }

    return this.lines.join('\n');
  }

  generateAddresses() {
    this.lines.push('# IPv4 Addresses');
    for (const addr of this.config.addresses) {
      const comment = addr.comment ? ` comment="${addr.comment}"` : '';
      const network = addr.network ? ` network=${addr.network}` : '';
      this.lines.push(`/ip address add address=${addr.address} interface=${addr.interface}${network}${comment}`);
    }
    this.lines.push('');
  }

  generateIPv6Addresses() {
    this.lines.push('# IPv6 Addresses');
    for (const addr of this.config.ipv6_addresses) {
      const comment = addr.comment ? ` comment="${addr.comment}"` : '';
      const advertise = addr.advertise ? ` advertise=${addr.advertise}` : '';
      const from = addr.from ? ` from=${addr.from}` : '';
      this.lines.push(`/ipv6 address add address=${addr.address} interface=${addr.interface}${advertise}${from}${comment}`);
    }
    this.lines.push('');
  }

  generateDNS() {
    this.lines.push('# DNS Settings');
    const dns = this.config.dns;
    if (dns.servers && dns.servers.length > 0) {
      this.lines.push(`/ip dns set servers=${dns.servers.join(',')}`);
    }
    if (dns['allow-remote-requests'] !== undefined) {
      this.lines.push(`/ip dns set allow-remote-requests=${dns['allow-remote-requests']}`);
    }
    if (dns['use-doh-server']) {
      this.lines.push(`/ip dns set use-doh-server="${dns['use-doh-server']}"`);
    }
    if (dns['verify-doh-cert']) {
      this.lines.push(`/ip dns set verify-doh-cert=${dns['verify-doh-cert']}`);
    }
    this.lines.push('');
  }

  generateDHCPClient() {
    this.lines.push('# DHCP Client');
    for (const client of this.config.dhcp_clients) {
      const addDefaultRoute = client['add-default-route'] !== undefined ? ` add-default-route=${client['add-default-route']}` : '';
      const usePeerDNS = client['use-peer-dns'] !== undefined ? ` use-peer-dns=${client['use-peer-dns']}` : '';
      const comment = client.comment ? ` comment="${client.comment}"` : '';
      this.lines.push(`/ip dhcp-client add interface=${client.interface}${addDefaultRoute}${usePeerDNS}${comment}`);
    }
    this.lines.push('');
  }

  generateDHCPServer() {
    this.lines.push('# DHCP Server');
    for (const server of this.config.dhcp_servers) {
      // Network
      if (server.network) {
        const gw = server.network.gateway ? ` gateway=${server.network.gateway}` : '';
        const dns = server.network.dns ? ` dns-server=${server.network.dns}` : '';
        const domain = server.network.domain ? ` domain=${server.network.domain}` : '';
        this.lines.push(`/ip dhcp-server network add address=${server.network.address}${gw}${dns}${domain}`);
      }

      // Pool
      if (server.pool) {
        this.lines.push(`/ip pool add name=${server.pool.name} ranges=${server.pool.ranges}`);
      }

      // Server
      const addPool = server['add-pool'] ? ` add-pool=${server['add-pool']}` : '';
      const useFramed = server['use-framed'] ? ` use-framed=${server['use-framed']}` : '';
      const comment = server.comment ? ` comment="${server.comment}"` : '';
      this.lines.push(`/ip dhcp-server add name=${server.name} interface=${server.interface} address-pool=${server['address-pool']}${addPool}${useFramed}${comment}`);
    }
    this.lines.push('');
  }
}

module.exports = IPConfigGenerator;
