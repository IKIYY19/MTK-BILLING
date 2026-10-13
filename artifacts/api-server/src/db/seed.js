const db = require('./index');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const exampleTemplates = [
  {
    name: 'Basic VLAN Setup',
    description: 'Creates VLAN interfaces with IP addresses and bridge VLAN filtering',
    category: 'interfaces',
    content: {
      interfaces: [
        { name: 'vlan10', 'vlan-id': 10, interface: 'ether1' },
        { name: 'vlan20', 'vlan-id': 20, interface: 'ether1' },
      ],
      addresses: [
        { address: '192.168.10.1/24', interface: 'vlan10' },
        { address: '192.168.20.1/24', interface: 'vlan20' },
      ],
    },
    is_public: true,
  },
  {
    name: 'OSPF Single Area',
    description: 'Basic OSPF configuration with single area',
    category: 'routing',
    content: {
      ospf: {
        'router-id': '1.1.1.1',
        areas: [{ name: 'backbone', 'area-id': '0.0.0.0' }],
        networks: [
          { network: '192.168.1.0/24', area: 'backbone' },
          { network: '10.0.0.0/30', area: 'backbone' },
        ],
      },
    },
    is_public: true,
  },
  {
    name: 'BGP Basic Setup',
    description: 'Basic BGP configuration with peer and advertised networks',
    category: 'routing',
    content: {
      bgp: {
        as: 65001,
        'router-id': '1.1.1.1',
        peers: [
          { name: 'peer1', 'remote-as': 65002, 'remote-address': '10.0.0.2' },
        ],
        networks: ['192.168.1.0/24', '192.168.2.0/24'],
      },
    },
    is_public: true,
  },
  {
    name: 'PPPoE Server',
    description: 'Complete PPPoE server setup with profiles and secrets',
    category: 'isp',
    content: {
      server: {
        name: 'pppoe-server',
        interface: 'ether2',
        'service-name': 'ISP-PPPoE',
      },
      profiles: [
        {
          name: 'default',
          'local-address': '10.0.0.1',
          'remote-address': 'pppoe-pool',
          'rate-limit': '10M/10M',
        },
      ],
      pool: { name: 'pppoe-pool', ranges: '10.0.0.100-10.0.0.200' },
    },
    is_public: true,
  },
  {
    name: 'Hotspot Setup',
    description: 'Basic hotspot configuration with walled garden',
    category: 'isp',
    content: {
      hotspot: {
        interface: 'ether3',
        address: '10.5.50.1/24',
        'hotspot-address': '10.5.50.1',
        'dns-name': 'hotspot.local',
      },
      profiles: [{ name: 'default', 'rate-limit': '5M/5M' }],
      walled_garden: ['*.google.com', '*.facebook.com'],
    },
    is_public: true,
  },
  {
    name: 'WireGuard VPN',
    description: 'WireGuard server and peer configuration',
    category: 'vpn',
    content: {
      server: {
        name: 'wg-server',
        port: 13231,
        'private-key': '(generate-on-client)',
      },
      peers: [
        {
          name: 'client1',
          'public-key': '(client-public-key)',
          'allowed-address': '10.200.0.2/32',
          endpoint: '0.0.0.0:0',
        },
      ],
    },
    is_public: true,
  },
  {
    name: 'Basic Firewall',
    description: 'Standard firewall rules with NAT and FastTrack',
    category: 'firewall',
    content: {
      filter_rules: [
        { chain: 'input', action: 'accept', connection_state: 'established,related,untracked' },
        { chain: 'input', action: 'drop', comment: 'Drop everything else' },
        { chain: 'forward', action: 'accept', connection_state: 'established,related,untracked' },
        { chain: 'forward', action: 'fasttrack', connection_state: 'established,related' },
      ],
      nat: [{ chain: 'srcnat', action: 'masquerade', out_interface: 'ether1' }],
    },
    is_public: true,
  },
];

async function seed() {
  console.log('Seeding database...');
  try {
    const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || '';
    const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || '';

    if (seedAdminEmail && seedAdminPassword) {
      console.log(`Creating explicit admin user for ${seedAdminEmail}...`);
      const adminHash = await bcrypt.hash(seedAdminPassword, 10);

      await db.query(
        `INSERT INTO users (id, email, password_hash, name, role, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO NOTHING`,
        [uuidv4(), seedAdminEmail, adminHash, 'Administrator', 'admin']
      );
      console.log('✅ Explicit admin seed completed');
    } else {
      console.log('Skipping admin seed - set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one');
    }

    // Seed example templates
    console.log('Seeding example templates...');
    for (const template of exampleTemplates) {
      await db.query(
        `INSERT INTO templates (name, description, category, content, is_public)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [template.name, template.description, template.category, template.content, template.is_public]
      );
    }
    console.log(`✅ Seeded ${exampleTemplates.length} templates`);

    console.log('Seeding default settings...');
    await db.query(
      `INSERT INTO settings (key, value) VALUES ('radius_provisioning_enabled', 'true')
       ON CONFLICT (key) DO NOTHING`
    ).catch(() => {});
    console.log('✅ RADIUS provisioning auto-enabled');

    console.log('✅ Seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seed };
