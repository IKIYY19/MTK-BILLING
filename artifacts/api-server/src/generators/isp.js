/**
 * ISP Services Module Generator
 * Generates MikroTik RouterOS commands for PPPoE, Hotspot, and RADIUS
 */

class ISPServicesGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# ISP Services Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.pppoe_server) {
      this.generatePPPoEServer();
    }

    if (this.config.ppp_profiles) {
      this.generatePPPProfiles();
    }

    if (this.config.ppp_secrets) {
      this.generatePPPSecrets();
    }

    if (this.config.hotspot) {
      this.generateHotspot();
    }

    if (this.config.radius) {
      this.generateRADIUS();
    }

    return this.lines.join('\n');
  }

  generatePPPoEServer() {
    this.lines.push('# PPPoE Server');
    const server = this.config.pppoe_server;

    const serviceName = server['service-name'] ? ` service-name="${server['service-name']}"` : '';
    const interface_ = server.interface ? ` interface=${server.interface}` : '';
    const maxMtu = server['max-mtu'] ? ` max-mtu=${server['max-mtu']}` : '';
    const maxMru = server['max-mru'] ? ` max-mru=${server['max-mru']}` : '';
    const mrru = server.mrru ? ` mrru=${server.mrru}` : '';
    const disabled = server.disabled !== undefined ? ` disabled=${server.disabled}` : '';
    const comment = server.comment ? ` comment="${server.comment}"` : '';

    this.lines.push(`/interface pppoe-server server add${serviceName}${interface_}${maxMtu}${maxMru}${mrru}${disabled}${comment}`);
    this.lines.push('');
  }

  generatePPPProfiles() {
    this.lines.push('# PPP Profiles');
    for (const profile of this.config.ppp_profiles) {
      const localAddr = profile['local-address'] ? ` local-address=${profile['local-address']}` : '';
      const remoteAddr = profile['remote-address'] ? ` remote-address=${profile['remote-address']}` : '';
      const rateLimit = profile['rate-limit'] ? ` rate-limit=${profile['rate-limit']}` : '';
      const onlyOne = profile['only-one'] ? ` only-one=${profile['only-one']}` : '';
      const changeTcpMss = profile['change-tcp-mss'] ? ` change-tcp-mss=${profile['change-tcp-mss']}` : '';
      const useCompression = profile['use-compression'] !== undefined ? ` use-compression=${profile['use-compression']}` : '';
      const useEncryption = profile['use-encryption'] !== undefined ? ` use-encryption=${profile['use-encryption']}` : '';
      const comment = profile.comment ? ` comment="${profile.comment}"` : '';

      this.lines.push(`/ppp profile add name=${profile.name}${localAddr}${remoteAddr}${rateLimit}${onlyOne}${changeTcpMss}${useCompression}${useEncryption}${comment}`);
    }
    this.lines.push('');
  }

  generatePPPSecrets() {
    this.lines.push('# PPP Secrets');
    for (const secret of this.config.ppp_secrets) {
      const name = secret.name ? ` name=${secret.name}` : '';
      const password = secret.password ? ` password=${secret.password}` : '';
      const service = secret.service ? ` service=${secret.service}` : '';
      const profile = secret.profile ? ` profile=${secret.profile}` : '';
      const localAddr = secret['local-address'] ? ` local-address=${secret['local-address']}` : '';
      const remoteAddr = secret['remote-address'] ? ` remote-address=${secret['remote-address']}` : '';
      const rateLimit = secret['rate-limit'] ? ` rate-limit=${secret['rate-limit']}` : '';
      const comment = secret.comment ? ` comment="${secret.comment}"` : '';

      this.lines.push(`/ppp secret add${name}${password}${service}${profile}${localAddr}${remoteAddr}${rateLimit}${comment}`);
    }
    this.lines.push('');
  }

  generateHotspot() {
    this.lines.push('# Hotspot Configuration');
    const hotspot = this.config.hotspot;

    // Server setup
    if (hotspot.server_setup) {
      const setup = hotspot.server_setup;
      const interface_ = setup.interface ? ` interface=${setup.interface}` : '';
      const address = setup.address ? ` address=${setup.address}` : '';
      const mask = setup.mask ? ` mask=${setup.mask}` : '';
      const localAddress = setup['local-address'] ? ` local-address=${setup['local-address']}` : '';
      const parentQueue = setup['parent-queue'] ? ` parent-queue=${setup['parent-queue']}` : '';
      this.lines.push(`/ip hotspot setup${interface_}${address}${mask}${localAddress}${parentQueue}`);
    }

    // Server profiles
    if (hotspot.profiles) {
      for (const profile of hotspot.profiles) {
        const rateLimit = profile['rate-limit'] ? ` rate-limit=${profile['rate-limit']}` : '';
        const sharedUsers = profile['shared-users'] ? ` shared-users=${profile['shared-users']}` : '';
        const sessionTimeout = profile['session-timeout'] ? ` session-timeout=${profile['session-timeout']}` : '';
        const idleTimeout = profile['idle-timeout'] ? ` idle-timeout=${profile['idle-timeout']}` : '';
        const comment = profile.comment ? ` comment="${profile.comment}"` : '';
        this.lines.push(`/ip hotspot profile add name=${profile.name}${rateLimit}${sharedUsers}${sessionTimeout}${idleTimeout}${comment}`);
      }
    }

    // User profiles
    if (hotspot.user_profiles) {
      for (const profile of hotspot.user_profiles) {
        const rateLimit = profile['rate-limit'] ? ` rate-limit=${profile['rate-limit']}` : '';
        const validity = profile.validity ? ` validity=${profile.validity}` : '';
        const uptime = profile.uptime ? ` uptime=${profile.uptime}` : '';
        const comment = profile.comment ? ` comment="${profile.comment}"` : '';
        this.lines.push(`/ip hotspot user profile add name=${profile.name}${rateLimit}${validity}${uptime}${comment}`);
      }
    }

    // Walled garden
    if (hotspot.walled_garden) {
      for (const wg of hotspot.walled_garden) {
        const action = wg.action ? ` action=${wg.action}` : '';
        const dstHost = wg['dst-host'] ? ` dst-host=${wg['dst-host']}` : '';
        const comment = wg.comment ? ` comment="${wg.comment}"` : '';
        this.lines.push(`/ip hotspot walled-garden add${action}${dstHost}${comment}`);
      }
    }

    // IP bindings
    if (hotspot.ip_bindings) {
      for (const binding of hotspot.ip_bindings) {
        const macAddress = binding['mac-address'] ? ` mac-address=${binding['mac-address']}` : '';
        const address = binding.address ? ` address=${binding.address}` : '';
        const toAddress = binding['to-address'] ? ` to-address=${binding['to-address']}` : '';
        const comment = binding.comment ? ` comment="${binding.comment}"` : '';
        this.lines.push(`/ip hotspot ip-binding add${macAddress}${address}${toAddress}${comment}`);
      }
    }

    this.lines.push('');
  }

  generateRADIUS() {
    this.lines.push('# RADIUS Configuration');
    const radius = this.config.radius;

    for (const server of radius.servers || []) {
      const address = server.address ? ` address=${server.address}` : '';
      const secret = server.secret ? ` secret=${server.secret}` : '';
      const service = server.service ? ` service=${server.service}` : '';
      const timeout = server.timeout ? ` timeout=${server.timeout}` : '';
      const comment = server.comment ? ` comment="${server.comment}"` : '';
      this.lines.push(`/radius add${address}${secret}${service}${timeout}${comment}`);
    }

    if (radius['use-radius'] !== undefined) {
      this.lines.push(`/ppp aaa set use-radius=${radius['use-radius']}`);
    }

    if (radius.accounting) {
      this.lines.push(`/ppp aaa set accounting=yes`);
    }

    this.lines.push('');
  }
}

module.exports = ISPServicesGenerator;
