/**
 * Pre-built Firewall Rule Templates
 * Industry-standard MikroTik firewall configurations
 */

export const firewallTemplates = [
  {
    id: 'enterprise',
    name: 'Enterprise Firewall',
    description: 'Full enterprise-grade protection with anti-brute-force, port scan protection, and bogon filtering',
    icon: '🏢',
    ruleCount: 18,
    apply: (config = {}) => ({
      ...config,
      address_lists: [
        { address: '0.0.0.0/8', list: 'bogons', comment: 'RFC1122 "This" Network' },
        { address: '10.0.0.0/8', list: 'bogons', comment: 'RFC1918 Private' },
        { address: '100.64.0.0/10', list: 'bogons', comment: 'RFC6598 CGN' },
        { address: '169.254.0.0/16', list: 'bogons', comment: 'RFC3927 Link-Local' },
        { address: '172.16.0.0/12', list: 'bogons', comment: 'RFC1918 Private' },
        { address: '192.0.0.0/24', list: 'bogons', comment: 'RFC6890 IETF' },
        { address: '192.0.2.0/24', list: 'bogons', comment: 'RFC5737 Documentation' },
        { address: '192.168.0.0/16', list: 'bogons', comment: 'RFC1918 Private' },
        { address: '198.18.0.0/15', list: 'bogons', comment: 'RFC2544 Benchmark' },
        { address: '198.51.100.0/24', list: 'bogons', comment: 'RFC5737 Documentation' },
        { address: '203.0.113.0/24', list: 'bogons', comment: 'RFC5737 Documentation' },
        { address: '224.0.0.0/4', list: 'bogons', comment: 'RFC5771 Multicast' },
        { address: '240.0.0.0/4', list: 'bogons', comment: 'RFC6890 Reserved' },
      ],
      filter_rules: [
        // Connection tracking
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established connections' },
        { chain: 'input', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid connections' },
        
        // ICMP protection
        { chain: 'input', protocol: 'icmp', action: 'accept', limit: '50/5s', comment: 'Allow ICMP with rate limit' },
        { chain: 'input', protocol: 'icmp', action: 'drop', comment: 'Drop excessive ICMP' },
        
        // Anti brute force
        { chain: 'input', protocol: 'tcp', 'dst-port': '22', action: 'add-src-to-address-list', 'address-list': 'ssh_brute', 'address-list-timeout': '1h', limit: '3:30/1m', comment: 'Track SSHA brute force' },
        { chain: 'input', protocol: 'tcp', 'dst-port': '22', action: 'drop', 'src-address-list': 'ssh_brute', comment: 'Block SSH brute force' },
        { chain: 'input', protocol: 'tcp', 'dst-port': '8728', action: 'add-src-to-address-list', 'address-list': 'api_brute', 'address-list-timeout': '1h', limit: '3:30/1m', comment: 'Track API brute force' },
        { chain: 'input', protocol: 'tcp', 'dst-port': '8728', action: 'drop', 'src-address-list': 'api_brute', comment: 'Block API brute force' },
        
        // Anti port scan
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'fin,!ack,!syn,!rst,!psh,!urg', action: 'drop', comment: 'Drop XMAS scan' },
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'syn,rst', action: 'drop', comment: 'Drop SYN/RST scan' },
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'fin,syn', action: 'drop', comment: 'Drop SYN/FIN scan' },
        
        // Bogon filtering (on WAN interface)
        { chain: 'input', 'src-address-list': 'bogons', action: 'drop', comment: 'Drop bogon source addresses' },
        
        // Management access (restrict to LAN)
        { chain: 'input', 'src-address': '192.168.0.0/16', action: 'accept', comment: 'Allow management from LAN' },
        
        // Final drop
        { chain: 'input', action: 'drop', comment: 'Drop everything else - INPUT', log: 'yes', 'log-prefix': 'INPUT_DROP' },
        
        // Forward chain
        { chain: 'forward', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established forward' },
        { chain: 'forward', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid forward' },
        { chain: 'forward', action: 'accept', comment: 'Allow forward - LAN to WAN' },
        { chain: 'forward', action: 'drop', comment: 'Drop everything else - FORWARD' },
      ],
      nat_rules: [
        { chain: 'srcnat', action: 'masquerade', comment: 'NAT masquerade', 'out-interface': 'ether1' },
      ],
      raw_rules: [
        { chain: 'prerouting', protocol: 'icmp', action: 'accept', comment: 'Allow ICMP early' },
      ],
    }),
  },
  {
    id: 'home',
    name: 'Home / SOHO',
    description: 'Simple but effective firewall for home or small office networks',
    icon: '🏠',
    ruleCount: 6,
    apply: (config = {}) => ({
      ...config,
      filter_rules: [
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established' },
        { chain: 'input', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid' },
        { chain: 'input', protocol: 'icmp', action: 'accept', comment: 'Allow ping' },
        { chain: 'input', action: 'drop', comment: 'Drop all other input' },
        { chain: 'forward', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established forward' },
        { chain: 'forward', action: 'accept', comment: 'Allow LAN to internet' },
      ],
      nat_rules: [
        { chain: 'srcnat', action: 'masquerade', comment: 'NAT to internet', 'out-interface': 'ether1' },
        { chain: 'srcnat', action: 'fasttrack-connection', connection_state: 'established,related', comment: 'FastTrack for performance' },
      ],
    }),
  },
  {
    id: 'isp',
    name: 'ISP / WISP',
    description: 'ISP-grade protection with DDoS mitigation, anti-spoofing, and per-client rate limiting',
    icon: '📡',
    ruleCount: 22,
    apply: (config = {}) => ({
      ...config,
      filter_rules: [
        // DDoS protection
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established' },
        { chain: 'input', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid' },
        
        // Anti-spoofing
        { chain: 'input', 'src-address': '127.0.0.0/8', action: 'drop', comment: 'Drop loopback spoof' },
        { chain: 'forward', 'src-address': '127.0.0.0/8', action: 'drop', comment: 'Drop loopback spoof forward' },
        
        // ICMP flood protection
        { chain: 'input', protocol: 'icmp', action: 'accept', limit: '100/10s,burst:200', comment: 'ICMP flood protection' },
        { chain: 'input', protocol: 'icmp', action: 'drop', comment: 'Drop ICMP flood' },
        
        // SYN flood protection
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'syn', action: 'accept', limit: '100/5s,burst:200', comment: 'SYN flood protection' },
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'syn', action: 'drop', comment: 'Drop SYN flood' },
        
        // UDP flood protection
        { chain: 'input', protocol: 'udp', action: 'accept', limit: '500/10s,burst:1000', comment: 'UDP flood protection' },
        { chain: 'input', protocol: 'udp', action: 'drop', comment: 'Drop UDP flood' },
        
        // Anti port scan
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'fin,!ack,!syn,!rst,!psh,!urg', action: 'drop', comment: 'Drop XMAS' },
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'syn,rst', action: 'drop', comment: 'Drop SYN/RST' },
        { chain: 'input', protocol: 'tcp', 'tcp-flags': 'fin,syn', action: 'drop', comment: 'Drop SYN/FIN' },
        
        // Management
        { chain: 'input', protocol: 'tcp', 'dst-port': '22,8728,8291', action: 'accept', 'src-address': '10.0.0.0/8', comment: 'Allow management from internal' },
        { chain: 'input', protocol: 'tcp', 'dst-port': '22,8728,8291', action: 'drop', comment: 'Block external management' },
        
        // Final
        { chain: 'input', action: 'drop', comment: 'Final drop input', log: 'yes', 'log-prefix': 'INP_DROP' },
        
        // Forward
        { chain: 'forward', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established forward' },
        { chain: 'forward', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid forward' },
        { chain: 'forward', action: 'fasttrack-connection', connection_state: 'established,related', comment: 'FastTrack' },
        { chain: 'forward', action: 'accept', comment: 'Allow forward' },
        { chain: 'forward', action: 'drop', comment: 'Final drop forward', log: 'yes', 'log-prefix': 'FWD_DROP' },
      ],
      nat_rules: [
        { chain: 'srcnat', action: 'masquerade', 'out-interface': 'ether1', comment: 'WAN masquerade' },
      ],
      mangle_rules: [
        { chain: 'prerouting', action: 'mark-connection', connection_state: 'new', 'new-connection-mark': 'normal', 'passthrough': 'yes', comment: 'Mark normal traffic' },
      ],
    }),
  },
  {
    id: 'hotspot',
    name: 'Public WiFi / Hotspot',
    description: 'Client isolation, walled garden, and captive portal protection for public networks',
    icon: '📶',
    ruleCount: 14,
    apply: (config = {}) => ({
      ...config,
      filter_rules: [
        // Input protection
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked', comment: 'Allow established' },
        { chain: 'input', action: 'drop', connection_state: 'invalid', comment: 'Drop invalid' },
        { chain: 'input', action: 'drop', comment: 'Drop other input' },
        
        // Client isolation - prevent clients from talking to each other
        { chain: 'forward', 'src-address': '10.5.50.0/24', 'dst-address': '10.5.50.0/24', action: 'drop', comment: 'Block client-to-client' },
        
        // Allow hotspot to internet
        { chain: 'forward', 'src-address': '10.5.50.0/24', action: 'accept', connection_state: 'new,established,related', comment: 'Allow hotspot to internet' },
        
        // Walled garden (free access before auth)
        { chain: 'forward', 'dst-address': '8.8.8.8', action: 'accept', comment: 'Walled garden: DNS' },
        { chain: 'forward', 'dst-address': '8.8.4.4', action: 'accept', comment: 'Walled garden: DNS alt' },
        
        // Anti-ARP spoof
        { chain: 'forward', protocol: 'arp', action: 'drop', comment: 'Block ARP forwarding' },
        
        // DNS redirect to hotspot
        { chain: 'dstnat', protocol: 'udp', 'dst-port': '53', action: 'redirect', 'to-ports': '53', comment: 'DNS redirect to router' },
        
        // Established forward
        { chain: 'forward', action: 'accept', connection_state: 'established,related', comment: 'Allow established' },
        { chain: 'forward', action: 'drop', comment: 'Drop everything else', log: 'yes', 'log-prefix': 'HOTSPOT_DROP' },
      ],
      nat_rules: [
        { chain: 'srcnat', action: 'masquerade', comment: 'Hotspot NAT' },
      ],
    }),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Bare minimum security - accept established, drop input, allow forward, NAT',
    icon: '⚡',
    ruleCount: 5,
    apply: (config = {}) => ({
      ...config,
      filter_rules: [
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked', comment: 'Accept established' },
        { chain: 'input', action: 'drop', comment: 'Drop all other input' },
        { chain: 'forward', action: 'accept', comment: 'Allow all forward' },
        { chain: 'forward', action: 'fasttrack-connection', connection_state: 'established,related', comment: 'FastTrack' },
      ],
      nat_rules: [
        { chain: 'srcnat', action: 'masquerade', comment: 'NAT masquerade', 'out-interface': 'ether1' },
      ],
    }),
  },
];
