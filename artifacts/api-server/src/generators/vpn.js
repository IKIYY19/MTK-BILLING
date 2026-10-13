/**
 * VPN & Tunnels Module Generator
 * Generates MikroTik RouterOS commands for WireGuard, L2TP/IPsec, SSTP, GRE, EoIP, IPIP
 */

class VPNTunnelsGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# VPN & Tunnels Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.wireguard) {
      this.generateWireguard();
    }

    if (this.config.l2tp) {
      this.generateL2TP();
    }

    if (this.config.ipsec) {
      this.generateIPsec();
    }

    if (this.config.sstp) {
      this.generateSSTP();
    }

    if (this.config.gre) {
      this.generateGRE();
    }

    if (this.config.eoip) {
      this.generateEoIP();
    }

    if (this.config.ipip) {
      this.generateIPIP();
    }

    return this.lines.join('\n');
  }

  generateWireguard() {
    this.lines.push('# WireGuard Configuration');
    const wg = this.config.wireguard;

    // WireGuard Interface
    if (wg.interface) {
      const name = wg.interface.name ? ` name=${wg.interface.name}` : '';
      const privateKey = wg.interface['private-key'] ? ` private-key=${wg.interface['private-key']}` : '';
      const listenPort = wg.interface['listen-port'] ? ` listen-port=${wg.interface['listen-port']}` : '';
      const mtu = wg.interface.mtu ? ` mtu=${wg.interface.mtu}` : '';
      const comment = wg.interface.comment ? ` comment="${wg.interface.comment}"` : '';

      this.lines.push(`/interface wireguard add${name}${privateKey}${listenPort}${mtu}${comment}`);
    }

    // WireGuard Peers
    if (wg.peers) {
      for (const peer of wg.peers) {
        const interface_ = peer.interface ? ` interface=${peer.interface}` : '';
        const publicKey = peer['public-key'] ? ` public-key=${peer['public-key']}` : '';
        const presharedKey = peer['preshared-key'] ? ` preshared-key=${peer['preshared-key']}` : '';
        const allowedAddress = peer['allowed-address'] ? ` allowed-address=${peer['allowed-address']}` : '';
        const endpoint = peer.endpoint ? ` endpoint=${peer.endpoint}` : '';
        const persistentKeepalive = peer['persistent-keepalive'] ? ` persistent-keepalive=${peer['persistent-keepalive']}` : '';
        const comment = peer.comment ? ` comment="${peer.comment}"` : '';

        this.lines.push(`/interface wireguard peers add${interface_}${publicKey}${presharedKey}${allowedAddress}${endpoint}${persistentKeepalive}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateL2TP() {
    this.lines.push('# L2TP/IPsec Configuration');
    const l2tp = this.config.l2tp;

    // L2TP Server
    if (l2tp.server) {
      const enabled = l2tp.server.enabled !== undefined ? ` enabled=${l2tp.server.enabled}` : '';
      const ipsecSecret = l2tp.server['ipsec-secret'] ? ` ipsec-secret=${l2tp.server['ipsec-secret']}` : '';
      const useIpsec = l2tp.server['use-ipsec'] !== undefined ? ` use-ipsec=${l2tp.server['use-ipsec']}` : '';
      const keepalive = l2tp.server['keepalive-timeout'] ? ` keepalive-timeout=${l2tp.server['keepalive-timeout']}` : '';
      const maxMru = l2tp.server['max-mru'] ? ` max-mru=${l2tp.server['max-mru']}` : '';
      const maxMtu = l2tp.server['max-mtu'] ? ` max-mtu=${l2tp.server['max-mtu']}` : '';
      const mrru = l2tp.server.mrru ? ` mrru=${l2tp.server.mrru}` : '';
      const comment = l2tp.server.comment ? ` comment="${l2tp.server.comment}"` : '';

      this.lines.push(`/interface l2tp-server server set enabled=${enabled !== undefined ? enabled : 'yes'}${ipsecSecret}${useIpsec}${keepalive}${maxMru}${maxMtu}${mrru}${comment}`);
    }

    // L2TP Secrets
    if (l2tp.secrets) {
      for (const secret of l2tp.secrets) {
        const name = secret.name ? ` name=${secret.name}` : '';
        const password = secret.password ? ` password=${secret.password}` : '';
        const profile = secret.profile ? ` profile=${secret.profile}` : '';
        const remoteAddress = secret['remote-address'] ? ` remote-address=${secret['remote-address']}` : '';
        const comment = secret.comment ? ` comment="${secret.comment}"` : '';

        this.lines.push(`/ppp secret add${name}${password} service=l2tp${profile}${remoteAddress}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateIPsec() {
    this.lines.push('# IPsec Configuration');
    const ipsec = this.config.ipsec;

    // IPsec Proposals
    if (ipsec.proposals) {
      for (const proposal of ipsec.proposals) {
        const name = proposal.name ? ` name=${proposal.name}` : '';
        const authAlgorithm = proposal['auth-algorithm'] ? ` auth-algorithm=${proposal['auth-algorithm']}` : '';
        const encAlgorithm = proposal['enc-algorithm'] ? ` enc-algorithm=${proposal['enc-algorithm']}` : '';
        const dhGroup = proposal['dh-group'] ? ` dh-group=${proposal['dh-group']}` : '';
        const comment = proposal.comment ? ` comment="${proposal.comment}"` : '';

        this.lines.push(`/ip ipsec proposal add${name}${authAlgorithm}${encAlgorithm}${dhGroup}${comment}`);
      }
    }

    // IPsec Peers (Site-to-Site)
    if (ipsec.peers) {
      for (const peer of ipsec.peers) {
        const address = peer.address ? ` address=${peer.address}` : '';
        const secret = peer.secret ? ` secret=${peer.secret}` : '';
        const exchangeMode = peer['exchange-mode'] ? ` exchange-mode=${peer['exchange-mode']}` : '';
        const sendInitialContact = peer['send-initial-contact'] !== undefined ? ` send-initial-contact=${peer['send-initial-contact']}` : '';
        const comment = peer.comment ? ` comment="${peer.comment}"` : '';

        this.lines.push(`/ip ipsec peer add${address}${secret}${exchangeMode}${sendInitialContact}${comment}`);
      }
    }

    // IPsec Policies
    if (ipsec.policies) {
      for (const policy of ipsec.policies) {
        const dstAddr = policy['dst-address'] ? ` dst-address=${policy['dst-address']}` : '';
        const srcAddr = policy['src-address'] ? ` src-address=${policy['src-address']}` : '';
        const proposal = proposal['proposal-check'] ? ` proposal-check=${proposal['proposal-check']}` : '';
        const template = policy.template !== undefined ? ` template=${policy.template}` : '';
        const comment = policy.comment ? ` comment="${policy.comment}"` : '';

        this.lines.push(`/ip ipsec policy add${dstAddr}${srcAddr}${template}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateSSTP() {
    this.lines.push('# SSTP Configuration');
    const sstp = this.config.sstp;

    // SSTP Server
    if (sstp.server) {
      const enabled = sstp.server.enabled !== undefined ? ` enabled=${sstp.server.enabled}` : '';
      const certificate = sstp.server.certificate ? ` certificate=${sstp.server.certificate}` : '';
      const keepalive = sstp.server['keepalive-timeout'] ? ` keepalive-timeout=${sstp.server['keepalive-timeout']}` : '';
      const maxMru = sstp.server['max-mru'] ? ` max-mru=${sstp.server['max-mru']}` : '';
      const maxMtu = sstp.server['max-mtu'] ? ` max-mtu=${sstp.server['max-mtu']}` : '';
      const mrru = sstp.server.mrru ? ` mrru=${sstp.server.mrru}` : '';
      const pfs = sstp.server.pfs !== undefined ? ` pfs=${sstp.server.pfs}` : '';
      const comment = sstp.server.comment ? ` comment="${sstp.server.comment}"` : '';

      this.lines.push(`/interface sstp-server server set enabled=${enabled !== undefined ? enabled : 'yes'}${certificate}${keepalive}${maxMru}${maxMtu}${mrru}${pfs}${comment}`);
    }

    // SSTP Secrets
    if (sstp.secrets) {
      for (const secret of sstp.secrets) {
        const name = secret.name ? ` name=${secret.name}` : '';
        const password = secret.password ? ` password=${secret.password}` : '';
        const profile = secret.profile ? ` profile=${secret.profile}` : '';
        const comment = secret.comment ? ` comment="${secret.comment}"` : '';

        this.lines.push(`/ppp secret add${name}${password} service=sstp${profile}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateGRE() {
    this.lines.push('# GRE Tunnels');
    if (this.config.gre.tunnels) {
      for (const tunnel of this.config.gre.tunnels) {
        const name = tunnel.name ? ` name=${tunnel.name}` : '';
        const localAddress = tunnel['local-address'] ? ` local-address=${tunnel['local-address']}` : '';
        const remoteAddress = tunnel['remote-address'] ? ` remote-address=${tunnel['remote-address']}` : '';
        const mtu = tunnel.mtu ? ` mtu=${tunnel.mtu}` : '';
        const comment = tunnel.comment ? ` comment="${tunnel.comment}"` : '';

        this.lines.push(`/interface gre add${name}${localAddress}${remoteAddress}${mtu}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateEoIP() {
    this.lines.push('# EoIP Tunnels');
    if (this.config.eoip.tunnels) {
      for (const tunnel of this.config.eoip.tunnels) {
        const name = tunnel.name ? ` name=${tunnel.name}` : '';
        const localAddress = tunnel['local-address'] ? ` local-address=${tunnel['local-address']}` : '';
        const remoteAddress = tunnel['remote-address'] ? ` remote-address=${tunnel['remote-address']}` : '';
        const tunnelId = tunnel['tunnel-id'] ? ` tunnel-id=${tunnel['tunnel-id']}` : '';
        const mtu = tunnel.mtu ? ` mtu=${tunnel.mtu}` : '';
        const comment = tunnel.comment ? ` comment="${tunnel.comment}"` : '';

        this.lines.push(`/interface eoip add${name}${localAddress}${remoteAddress}${tunnelId}${mtu}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateIPIP() {
    this.lines.push('# IPIP Tunnels');
    if (this.config.ipip.tunnels) {
      for (const tunnel of this.config.ipip.tunnels) {
        const name = tunnel.name ? ` name=${tunnel.name}` : '';
        const localAddress = tunnel['local-address'] ? ` local-address=${tunnel['local-address']}` : '';
        const remoteAddress = tunnel['remote-address'] ? ` remote-address=${tunnel['remote-address']}` : '';
        const comment = tunnel.comment ? ` comment="${tunnel.comment}"` : '';

        this.lines.push(`/interface ipip add${name}${localAddress}${remoteAddress}${comment}`);
      }
    }
    this.lines.push('');
  }
}

module.exports = VPNTunnelsGenerator;
