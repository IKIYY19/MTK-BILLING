/**
 * Routing Module Generator
 * Generates MikroTik RouterOS commands for static routes, OSPF, BGP, PBR, VRF
 */

class RoutingGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Routing Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.static_routes) {
      this.generateStaticRoutes();
    }

    if (this.config.pbr) {
      this.generatePBR();
    }

    if (this.config.vrfs) {
      this.generateVRFs();
    }

    if (this.config.ospf) {
      this.generateOSPF();
    }

    if (this.config.bgp) {
      this.generateBGP();
    }

    return this.lines.join('\n');
  }

  generateStaticRoutes() {
    this.lines.push('# Static Routes');
    for (const route of this.config.static_routes) {
      const dstAddr = route['dst-address'] ? ` dst-address=${route['dst-address']}` : '';
      const gateway = route.gateway ? ` gateway=${route.gateway}` : '';
      const distance = route.distance ? ` distance=${route.distance}` : '';
      const routingTable = route['routing-table'] ? ` routing-table=${route['routing-table']}` : '';
      const comment = route.comment ? ` comment="${route.comment}"` : '';
      const scope = route.scope ? ` scope=${route.scope}` : '';
      const targetScope = route['target-scope'] ? ` target-scope=${route['target-scope']}` : '';
      this.lines.push(`/ip route add${dstAddr}${gateway}${distance}${routingTable}${scope}${targetScope}${comment}`);
    }
    this.lines.push('');
  }

  generatePBR() {
    this.lines.push('# Policy Based Routing (PBR)');
    for (const pbr of this.config.pbr) {
      const srcAddr = pbr['src-address'] ? ` src-address=${pbr['src-address']}` : '';
      const dstAddr = pbr['dst-address'] ? ` dst-address=${pbr['dst-address']}` : '';
      const inInterface = pbr['in-interface'] ? ` in-interface=${pbr['in-interface']}` : '';
      const routingMark = pbr['routing-mark'] ? ` routing-mark=${pbr['routing-mark']}` : '';
      const comment = pbr.comment ? ` comment="${pbr.comment}"` : '';
      this.lines.push(`/ip route add${srcAddr}${dstAddr}${inInterface} gateway=${pbr.gateway}${routingMark}${comment}`);
    }
    this.lines.push('');
  }

  generateVRFs() {
    this.lines.push('# VRF Configuration');
    for (const vrf of this.config.vrfs) {
      const comment = vrf.comment ? ` comment="${vrf.comment}"` : '';
      this.lines.push(`/routing vrf add name=${vrf.name}${comment}`);
    }
    this.lines.push('');
  }

  generateOSPF() {
    this.lines.push('# OSPF Configuration');
    const ospf = this.config.ospf;

    if (this.version === 'v7') {
      // RouterOS v7 OSPF
      if (ospf.instance) {
        const comment = ospf.instance.comment ? ` comment="${ospf.instance.comment}"` : '';
        this.lines.push(`/routing ospf instance add name=${ospf.instance.name || 'default'}${comment}`);
      }

      if (ospf['router-id']) {
        this.lines.push(`/routing ospf set [find default=yes] router-id=${ospf['router-id']}`);
      }
    } else {
      // RouterOS v6 OSPF
      if (ospf['router-id']) {
        this.lines.push(`/routing ospf set router-id=${ospf['router-id']}`);
      }
    }

    // Areas
    if (ospf.areas) {
      for (const area of ospf.areas) {
        const comment = area.comment ? ` comment="${area.comment}"` : '';
        this.lines.push(`/routing ospf area add name=${area.name} area-id=${area['area-id']}${comment}`);
      }
    }

    // Networks
    if (ospf.networks) {
      for (const network of ospf.networks) {
        const area = network.area ? ` area=${network.area}` : '';
        const comment = network.comment ? ` comment="${network.comment}"` : '';
        this.lines.push(`/routing ospf network add network=${network.network}${area}${comment}`);
      }
    }

    // Interfaces
    if (ospf.interfaces) {
      for (const iface of ospf.interfaces) {
        const cost = iface.cost ? ` cost=${iface.cost}` : '';
        const priority = iface.priority ? ` priority=${iface.priority}` : '';
        const networkType = iface['network-type'] ? ` network-type=${iface['network-type']}` : '';
        const comment = iface.comment ? ` comment="${iface.comment}"` : '';
        this.lines.push(`/routing ospf interface add interface=${iface.interface}${cost}${priority}${networkType}${comment}`);
      }
    }

    // Authentication
    if (ospf.auth) {
      for (const auth of ospf.auth) {
        const mode = auth.mode ? ` mode=${auth.mode}` : '';
        const key = auth.key ? ` key=${auth.key}` : '';
        const keyId = auth['key-id'] ? ` key-id=${auth['key-id']}` : '';
        this.lines.push(`/routing ospf interface set [find interface=${auth.interface}]${mode}${key}${keyId}`);
      }
    }

    this.lines.push('');
  }

  generateBGP() {
    this.lines.push('# BGP Configuration');
    const bgp = this.config.bgp;

    if (this.version === 'v7') {
      // RouterOS v7 BGP
      if (bgp.template) {
        const as = bgp.template.as ? ` as=${bgp.template.as}` : '';
        const output = bgp.template.output ? ` output.${bgp.template.output}` : '';
        const comment = bgp.template.comment ? ` comment="${bgp.template.comment}"` : '';
        this.lines.push(`/routing/bgp/template add${as}${output}${comment}`);
      }

      // Connections (peers)
      if (bgp.connections) {
        for (const conn of bgp.connections) {
          const name = conn.name ? ` name=${conn.name}` : '';
          const remoteAs = conn['remote-as'] ? ` remote-as=${conn['remote-as']}` : '';
          const remoteAddr = conn['remote-address'] ? ` remote-address=${conn['remote-address']}` : '';
          const localAddr = conn['local-address'] ? ` local-address=${conn['local-address']}` : '';
          const addressFamilies = conn['address-families'] ? ` address-families=${conn['address-families'].join(',')}` : '';
          const comment = conn.comment ? ` comment="${conn.comment}"` : '';
          this.lines.push(`/routing/bgp/connection add${name}${remoteAs}${remoteAddr}${localAddr}${addressFamilies}${comment}`);
        }
      }

      // Networks
      if (bgp.networks) {
        for (const network of bgp.networks) {
          const comment = network.comment ? ` comment="${network.comment}"` : '';
          this.lines.push(`/routing/bgp/network add network=${network.network}${comment}`);
        }
      }
    } else {
      // RouterOS v6 BGP
      if (bgp.instance) {
        const as = bgp.instance.as ? ` as=${bgp.instance.as}` : '';
        const clientId = bgp.instance['client-to-client-reflection'] !== undefined ? ` client-to-client-reflection=${bgp.instance['client-to-client-reflection']}` : '';
        const comment = bgp.instance.comment ? ` comment="${bgp.instance.comment}"` : '';
        this.lines.push(`/routing/bgp/instance set default${as}${clientId}${comment}`);
      }

      // Peers
      if (bgp.peers) {
        for (const peer of bgp.peers) {
          const name = peer.name ? ` name=${peer.name}` : '';
          const remoteAs = peer['remote-as'] ? ` remote-as=${peer['remote-as']}` : '';
          const remoteAddr = peer['remote-address'] ? ` remote-address=${peer['remote-address']}` : '';
          const updateSource = peer['update-source'] ? ` update-source=${peer['update-source']}` : '';
          const comment = peer.comment ? ` comment="${peer.comment}"` : '';
          this.lines.push(`/routing/bgp/peer add${name}${remoteAs}${remoteAddr}${updateSource}${comment}`);
        }
      }

      // Networks
      if (bgp.networks) {
        for (const network of bgp.networks) {
          const comment = network.comment ? ` comment="${network.comment}"` : '';
          this.lines.push(`/routing/bgp/network add network=${network.network}${comment}`);
        }
      }
    }

    this.lines.push('');
  }
}

module.exports = RoutingGenerator;
