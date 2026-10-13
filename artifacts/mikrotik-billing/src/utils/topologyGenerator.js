/**
 * Topology Configuration Generator
 * Converts visual network topology into MikroTik RouterOS CLI commands
 */

export class TopologyConfigGenerator {
  constructor(nodes, connections) {
    this.nodes = nodes;
    this.connections = connections;
    this.lines = [];
    this.routerNodes = [];
    this.wanNodes = [];
    this.vlanNodes = [];
    this.wirelessNodes = [];
    this.switchNodes = [];
    this.serverNodes = [];
    this.clientNodes = [];
  }

  generate() {
    this.lines = [];
    
    // Categorize nodes
    this.nodes.forEach(node => {
      switch (node.type) {
        case 'router': this.routerNodes.push(node); break;
        case 'wan': this.wanNodes.push(node); break;
        case 'vlan': this.vlanNodes.push(node); break;
        case 'wireless': this.wirelessNodes.push(node); break;
        case 'switch': this.switchNodes.push(node); break;
        case 'server': this.serverNodes.push(node); break;
        case 'client': this.clientNodes.push(node); break;
      }
    });

    // Header
    this.lines.push('#############################################');
    this.lines.push('# MikroTik RouterOS Configuration');
    this.lines.push('# Generated from Network Topology');
    this.lines.push(`# Nodes: ${this.nodes.length} | Connections: ${this.connections.length}`);
    this.lines.push(`# Generated: ${new Date().toISOString()}`);
    this.lines.push('#############################################');
    this.lines.push('');

    // System settings
    if (this.routerNodes.length > 0) {
      this.generateSystem();
    }

    // WAN/Interface config
    if (this.wanNodes.length > 0) {
      this.generateWAN();
    }

    // VLAN config
    if (this.vlanNodes.length > 0) {
      this.generateVLANs();
    }

    // Bridge config (if multiple interfaces)
    if (this.vlanNodes.length > 1 || this.wirelessNodes.length > 0) {
      this.generateBridge();
    }

    // Wireless config
    if (this.wirelessNodes.length > 0) {
      this.generateWireless();
    }

    // DHCP config
    if (this.vlanNodes.length > 0) {
      this.generateDHCP();
    }

    // Firewall
    this.generateFirewall();

    // Footer
    this.lines.push('#############################################');
    this.lines.push('# End of Configuration');
    this.lines.push('#############################################');

    return this.lines.join('\n');
  }

  generateSystem() {
    const router = this.routerNodes[0];
    this.lines.push('# System Configuration');
    if (router.props.identity) {
      this.lines.push(`/system identity set name="${router.props.identity}"`);
    } else {
      this.lines.push(`/system identity set name="${router.props.name}"`);
    }
    this.lines.push('');
  }

  generateWAN() {
    this.lines.push('# WAN Configuration');
    
    this.wanNodes.forEach((wan, idx) => {
      const ifaceName = `ether${idx + 1}`;
      
      if (wan.props.type === 'dhcp') {
        this.lines.push(`# WAN ${idx + 1}: ${wan.props.name} (DHCP Client)`);
        this.lines.push(`/ip dhcp-client add interface=${ifaceName} add-default-route=yes use-peer-dns=yes comment="${wan.props.name}"`);
      } else if (wan.props.type === 'static') {
        this.lines.push(`# WAN ${idx + 1}: ${wan.props.name} (Static IP)`);
        this.lines.push(`/ip address add address=${wan.props.ip} interface=${ifaceName} comment="${wan.props.name}"`);
        if (wan.props.gateway) {
          this.lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${wan.props.gateway} distance=1 comment="Default route ${wan.props.name}"`);
        }
      } else if (wan.props.type === 'pppoe') {
        this.lines.push(`# WAN ${idx + 1}: ${wan.props.name} (PPPoE)`);
        this.lines.push(`/interface pppoe-client add name=pppoe-out${idx + 1} interface=${ifaceName} user=user password=password add-default-route=yes use-peer-dns=yes comment="${wan.props.name}"`);
      }
      
      if (wan.props.dns) {
        this.lines.push(`/ip dns set servers=${wan.props.dns}`);
      }
      
      this.lines.push('');
    });
  }

  generateVLANs() {
    this.lines.push('# VLAN Configuration');
    
    // Find which interface VLANs should be on (usually first WAN or router connection)
    const parentInterface = this.wanNodes.length > 0 ? 'ether1' : 'ether1';
    
    this.vlanNodes.forEach((vlan) => {
      this.lines.push(`# VLAN ${vlan.props.vlanId}: ${vlan.props.name}`);
      this.lines.push(`/interface vlan add name=${vlan.props.name.toLowerCase().replace(/\s/g, '')} vlan-id=${vlan.props.vlanId} interface=${parentInterface} comment="${vlan.props.name}"`);
      
      if (vlan.props.gateway) {
        this.lines.push(`/ip address add address=${vlan.props.gateway}/24 interface=${vlan.props.name.toLowerCase().replace(/\s/g, '')} comment="${vlan.props.name} gateway"`);
      }
      
      this.lines.push('');
    });
  }

  generateBridge() {
    this.lines.push('# Bridge Configuration');
    this.lines.push('/interface bridge add name=bridge1 comment="Main bridge"');
    
    // Add VLAN interfaces to bridge
    this.vlanNodes.forEach((vlan, idx) => {
      const vlanName = vlan.props.name.toLowerCase().replace(/\s/g, '');
      this.lines.push(`/interface bridge port add bridge=bridge1 interface=${vlanName} pvid=${vlan.props.vlanId}`);
    });

    // Add wireless to bridge
    this.wirelessNodes.forEach((wifi) => {
      this.lines.push(`/interface bridge port add bridge=bridge1 interface=wlan1 comment="${wifi.props.name}"`);
    });

    // Bridge VLANs
    this.vlanNodes.forEach((vlan) => {
      this.lines.push(`/interface bridge vlan add bridge=bridge1 vlan-ids=${vlan.props.vlanId} tagged=bridge1`);
    });

    this.lines.push('');
  }

  generateWireless() {
    this.lines.push('# Wireless Configuration');
    
    this.wirelessNodes.forEach((wifi) => {
      const securityProfile = `${wifi.props.name.toLowerCase().replace(/\s/g, '')}_sec`;
      
      // Security profile
      this.lines.push(`/interface wireless security-profiles add name=${securityProfile} authentication-types=${wifi.props.security} wpa2-pre-shared-key="${wifi.props.password}"`);
      
      // Wireless interface
      this.lines.push(`/interface wireless set [find default-name=wlan1] mode=ap-bridge ssid="${wifi.props.ssid}" band=${wifi.props.band} security-profile=${securityProfile} hide-ssid=no comment="${wifi.props.name}"`);
      
      this.lines.push('');
    });
  }

  generateDHCP() {
    this.lines.push('# DHCP Server Configuration');
    
    this.vlanNodes.forEach((vlan) => {
      const vlanName = vlan.props.name.toLowerCase().replace(/\s/g, '');
      const poolName = `pool_${vlanName}`;
      
      if (vlan.props.dhcpRange) {
        this.lines.push(`# DHCP Pool for ${vlan.props.name}`);
        this.lines.push(`/ip pool add name=${poolName} ranges=${vlan.props.dhcpRange}`);
      }
      
      if (vlan.props.subnet && vlan.props.gateway) {
        this.lines.push(`/ip dhcp-server network add address=${vlan.props.subnet} gateway=${vlan.props.gateway} dns-server=${vlan.props.gateway}`);
      }
      
      this.lines.push(`/ip dhcp-server add name=dhcp_${vlanName} interface=${vlanName} address-pool=${poolName} disabled=no comment="DHCP for ${vlan.props.name}"`);
      
      this.lines.push('');
    });
  }

  generateFirewall() {
    this.lines.push('# Firewall Configuration');
    
    // Basic input chain
    this.lines.push('# Input Chain - Protect Router');
    this.lines.push('/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="Allow established"');
    this.lines.push('/ip firewall filter add chain=input action=drop connection-state=invalid comment="Drop invalid"');
    this.lines.push('/ip firewall filter add chain=input protocol=icmp action=accept comment="Allow ICMP"');
    this.lines.push('/ip firewall filter add chain=input action=drop comment="Drop everything else"');
    
    // Forward chain
    this.lines.push('');
    this.lines.push('# Forward Chain');
    this.lines.push('/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="Allow established forward"');
    this.lines.push('/ip firewall filter add chain=forward action=drop connection-state=invalid comment="Drop invalid forward"');
    
    // If wireless exists, isolate it
    if (this.wirelessNodes.length > 0) {
      this.lines.push('');
      this.lines.push('# Wireless Isolation');
      this.wirelessNodes.forEach((wifi) => {
        this.lines.push(`/ip firewall filter add chain=forward src-address=${wifi.props.subnet || '192.168.10.0/24'} dst-address=${wifi.props.subnet || '192.168.10.0/24'} action=drop comment="Isolate ${wifi.props.name} clients"`);
      });
    }

    // NAT
    this.lines.push('');
    this.lines.push('# NAT Configuration');
    this.lines.push('/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1 comment="Masquerade WAN"');
    
    this.lines.push('');
  }
}
