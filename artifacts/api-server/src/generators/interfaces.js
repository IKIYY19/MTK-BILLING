/**
 * Interfaces & Switching Module Generator
 * Generates MikroTik RouterOS commands for interfaces, bridges, and VLANs
 */

class InterfacesGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Interfaces & Switching Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.interfaces) {
      this.generateInterfaceComments();
    }

    if (this.config.bridges) {
      this.generateBridges();
    }

    if (this.config.bridge_ports) {
      this.generateBridgePorts();
    }

    if (this.config.vlans) {
      this.generateVLANs();
    }

    if (this.config.bridge_vlans) {
      this.generateBridgeVLANs();
    }

    return this.lines.join('\n');
  }

  generateInterfaceComments() {
    this.lines.push('# Interface comments/renames');
    for (const iface of this.config.interfaces) {
      if (iface.comment) {
        this.lines.push(`/interface set [find default-name=${iface.default_name || iface.name}] comment="${iface.comment}"`);
      }
      if (iface.new_name) {
        this.lines.push(`/interface set [find default-name=${iface.default_name || iface.name}] name="${iface.new_name}"`);
      }
      if (iface.disabled === true) {
        this.lines.push(`/interface set ${iface.name} disabled=yes`);
      } else if (iface.disabled === false) {
        this.lines.push(`/interface set ${iface.name} disabled=no`);
      }
    }
    this.lines.push('');
  }

  generateBridges() {
    this.lines.push('# Bridge creation');
    for (const bridge of this.config.bridges) {
      const pvid = bridge.pvid ? ` pvid=${bridge.pvid}` : '';
      const vlanFilter = bridge['vlan-filtering'] ? ` vlan-filtering=${bridge['vlan-filtering']}` : '';
      const comment = bridge.comment ? ` comment="${bridge.comment}"` : '';
      this.lines.push(`/interface bridge add name=${bridge.name}${pvid}${vlanFilter}${comment}`);
    }
    this.lines.push('');
  }

  generateBridgePorts() {
    this.lines.push('# Bridge ports');
    for (const port of this.config.bridge_ports) {
      const pvid = port.pvid ? ` pvid=${port.pvid}` : '';
      const frameTypes = port['frame-types'] ? ` frame-types=${port['frame-types']}` : '';
      const ingressFilter = port['ingress-filtering'] !== undefined ? ` ingress-filtering=${port['ingress-filtering']}` : '';
      const horizon = port.horizon ? ` horizon=${port.horizon}` : '';
      this.lines.push(`/interface bridge port add bridge=${port.bridge} interface=${port.interface}${pvid}${frameTypes}${ingressFilter}${horizon}`);
    }
    this.lines.push('');
  }

  generateVLANs() {
    this.lines.push('# VLAN interfaces');
    for (const vlan of this.config.vlans) {
      const comment = vlan.comment ? ` comment="${vlan.comment}"` : '';
      const useServiceTag = vlan['use-service-tag'] ? ` use-service-tag=${vlan['use-service-tag']}` : '';
      this.lines.push(`/interface vlan add name=${vlan.name} vlan-id=${vlan['vlan-id']} interface=${vlan.interface}${useServiceTag}${comment}`);
    }
    this.lines.push('');
  }

  generateBridgeVLANs() {
    if (this.version !== 'v7') {
      this.lines.push('# Bridge VLANs (RouterOS v6 style)');
    } else {
      this.lines.push('# Bridge VLANs (RouterOS v7 style)');
    }
    for (const bvlan of this.config.bridge_vlans) {
      const tagged = bvlan.tagged && bvlan.tagged.length > 0 ? ` tagged=${bvlan.tagged.join(',')}` : '';
      const untagged = bvlan.untagged && bvlan.untagged.length > 0 ? ` untagged=${bvlan.untagged.join(',')}` : '';
      this.lines.push(`/interface bridge vlan add bridge=${bvlan.bridge} vlan-ids=${bvlan['vlan-ids']}${tagged}${untagged}`);
    }
    this.lines.push('');
  }
}

module.exports = InterfacesGenerator;
