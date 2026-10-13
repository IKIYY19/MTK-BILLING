/**
 * Wireless Module Generator
 * Generates MikroTik RouterOS commands for wireless, CAPsMAN
 */

class WirelessGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Wireless Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.wireless) {
      this.generateWireless();
    }

    if (this.config.security_profiles) {
      this.generateSecurityProfiles();
    }

    if (this.config.capsman) {
      this.generateCAPsMAN();
    }

    return this.lines.join('\n');
  }

  generateWireless() {
    this.lines.push('# Wireless Interface Configuration');
    for (const wireless of this.config.wireless) {
      const mode = wireless.mode ? ` mode=${wireless.mode}` : '';
      const ssid = wireless.ssid ? ` ssid="${wireless.ssid}"` : '';
      const band = wireless.band ? ` band=${wireless.band}` : '';
      const channelWidth = wireless['channel-width'] ? ` channel-width=${wireless['channel-width']}` : '';
      const frequency = wireless.frequency ? ` frequency=${wireless.frequency}` : '';
      const scanList = wireless['scan-list'] ? ` scan-list=${wireless['scan-list']}` : '';
      const radioName = wireless['radio-name'] ? ` radio-name="${wireless['radio-name']}"` : '';
      const securityProfile = wireless['security-profile'] ? ` security-profile=${wireless['security-profile']}` : '';
      const hideSsid = wireless['hide-ssid'] !== undefined ? ` hide-ssid=${wireless['hide-ssid']}` : '';
      const wdsMode = wireless['wds-mode'] ? ` wds-mode=${wireless['wds-mode']}` : '';
      const wdsDefaultBridge = wireless['wds-default-bridge'] ? ` wds-default-bridge=${wireless['wds-default-bridge']}` : '';
      const comment = wireless.comment ? ` comment="${wireless.comment}"` : '';

      this.lines.push(`/interface wireless set [find default-name=${wireless.interface}]${mode}${ssid}${band}${channelWidth}${frequency}${scanList}${radioName}${securityProfile}${hideSsid}${wdsMode}${wdsDefaultBridge}${comment}`);
    }
    this.lines.push('');
  }

  generateSecurityProfiles() {
    this.lines.push('# Wireless Security Profiles');
    for (const profile of this.config.security_profiles) {
      const name = profile.name ? ` name=${profile.name}` : '';
      const authType = profile['authentication-types'] ? ` authentication-types=${profile['authentication-types']}` : '';
      const groupKeyUpdate = profile['group-key-update'] ? ` group-key-update=${profile['group-key-update']}` : '';
      const groupCipher = profile['group-ciphers'] ? ` group-ciphers=${profile['group-ciphers']}` : '';
      const unicastCiphers = profile['unicast-ciphers'] ? ` unicast-ciphers=${profile['unicast-ciphers']}` : '';
      const wpaMode = profile['wpa-mode'] ? ` wpa-mode=${profile['wpa-mode']}` : '';
      const wpaPreSharedKey = profile['wpa-pre-shared-key'] ? ` wpa-pre-shared-key=${profile['wpa-pre-shared-key']}` : '';
      const comment = profile.comment ? ` comment="${profile.comment}"` : '';

      this.lines.push(`/interface wireless security-profiles add${name}${authType}${groupKeyUpdate}${groupCipher}${unicastCiphers}${wpaMode}${wpaPreSharedKey}${comment}`);
    }
    this.lines.push('');
  }

  generateCAPsMAN() {
    this.lines.push('# CAPsMAN Configuration');
    const capsman = this.config.capsman;

    // CAPsMAN Manager
    if (capsman.manager) {
      const enabled = capsman.manager.enabled !== undefined ? ` enabled=${capsman.manager.enabled}` : '';
      const certificate = capsman.manager.certificate ? ` certificate=${capsman.manager.certificate}` : '';
      const requireCaps = capsman.manager['require-certificate'] !== undefined ? ` require-certificate=${capsman.manager['require-certificate']}` : '';
      const comment = capsman.manager.comment ? ` comment="${capsman.manager.comment}"` : '';

      this.lines.push(`/capsman manager set${enabled}${certificate}${requireCaps}${comment}`);
    }

    // CAPsMAN Channels
    if (capsman.channels) {
      for (const channel of capsman.channels) {
        const name = channel.name ? ` name=${channel.name}` : '';
        const band = channel.band ? ` band=${channel.band}` : '';
        const controlChannelWidth = channel['control-channel-width'] ? ` control-channel-width=${channel['control-channel-width']}` : '';
        const extensionChannel = channel['extension-channel'] ? ` extension-channel=${channel['extension-channel']}` : '';
        const frequency = channel.frequency ? ` frequency=${channel.frequency}` : '';
        const comment = channel.comment ? ` comment="${channel.comment}"` : '';

        this.lines.push(`/capsman channel add${name}${band}${controlChannelWidth}${extensionChannel}${frequency}${comment}`);
      }
    }

    // CAPsMAN Datapaths
    if (capsman.datapaths) {
      for (const datapath of capsman.datapaths) {
        const name = datapath.name ? ` name=${datapath.name}` : '';
        const bridge = datapath.bridge ? ` bridge=${datapath.bridge}` : '';
        const clientToClientForwarding = datapath['client-to-client-forwarding'] !== undefined ? ` client-to-client-forwarding=${datapath['client-to-client-forwarding']}` : '';
        const localForwarding = datapath['local-forwarding'] !== undefined ? ` local-forwarding=${datapath['local-forwarding']}` : '';
        const useVlan = datapath['use-vlan'] !== undefined ? ` use-vlan=${datapath['use-vlan']}` : '';
        const comment = datapath.comment ? ` comment="${datapath.comment}"` : '';

        this.lines.push(`/capsman datapath add${name}${bridge}${clientToClientForwarding}${localForwarding}${useVlan}${comment}`);
      }
    }

    // CAPsMAN Security
    if (capsman.security) {
      for (const security of capsman.security) {
        const name = security.name ? ` name=${security.name}` : '';
        const authenticationTypes = security['authentication-types'] ? ` authentication-types=${security['authentication-types']}` : '';
        const encryption = security.encryption ? ` encryption=${security.encryption}` : '';
        const passphrase = security.passphrase ? ` passphrase="${security.passphrase}"` : '';
        const comment = security.comment ? ` comment="${security.comment}"` : '';

        this.lines.push(`/capsman security add${name}${authenticationTypes}${encryption}${passphrase}${comment}`);
      }
    }

    // CAPsMAN Configurations
    if (capsman.configurations) {
      for (const cfg of capsman.configurations) {
        const name = cfg.name ? ` name=${cfg.name}` : '';
        const masterConfiguration = cfg['master-configuration'] ? ` master-configuration=${cfg['master-configuration']}` : '';
        const slaveConfigurations = cfg['slave-configurations'] ? ` slave-configurations=${cfg['slave-configurations']}` : '';
        const channel = cfg.channel ? ` channel=${cfg.channel}` : '';
        const datapath = cfg.datapath ? ` datapath=${cfg.datapath}` : '';
        const security = cfg.security ? ` security=${cfg.security}` : '';
        const ssid = cfg.ssid ? ` ssid="${cfg.ssid}"` : '';
        const comment = cfg.comment ? ` comment="${cfg.comment}"` : '';

        this.lines.push(`/capsman configuration add${name}${masterConfiguration}${slaveConfigurations}${channel}${datapath}${security}${ssid}${comment}`);
      }
    }

    // CAPsMAN Provisioning
    if (capsman.provisioning) {
      for (const prov of capsman.provisioning) {
        const masterConfiguration = prov['master-configuration'] ? ` master-configuration=${prov['master-configuration']}` : '';
        const slaveConfigurations = prov['slave-configurations'] ? ` slave-configurations=${prov['slave-configurations']}` : '';
        const action = prov.action ? ` action=${prov.action}` : '';
        const comment = prov.comment ? ` comment="${prov.comment}"` : '';
        const hwSupportedRate = prov['hw-supported-rates'] ? ` hw-supported-rates=${prov['hw-supported-rates']}` : '';
        const identityRegexp = prov['identity-regexp'] ? ` identity-regexp="${prov['identity-regexp']}"` : '';
        const replacementConfiguration = prov['replacement-configuration'] ? ` replacement-configuration=${prov['replacement-configuration']}` : '';

        this.lines.push(`/capsman provisioning add${masterConfiguration}${slaveConfigurations}${action}${comment}${hwSupportedRate}${identityRegexp}${replacementConfiguration}`);
      }
    }
    this.lines.push('');
  }
}

module.exports = WirelessGenerator;
