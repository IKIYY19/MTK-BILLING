const { v4: uuidv4 } = require("uuid");

/**
 * In-memory storage fallback when PostgreSQL is not available
 * Simulates database operations with plain JavaScript objects
 */

const store = {
  tenants: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Default ISP",
      slug: "default",
      company_name: "Default ISP",
      email: "",
      phone: "",
      address: "",
      domain: "",
      logo_url: null,
      primary_color: null,
      secondary_color: null,
      accent_color: null,
      settings: {},
      is_active: true,
      max_customers: 0,
      max_routers: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  projects: [],
  project_modules: [],
  templates: [],
  mikrotik_connections: [],
  script_history: [],
  version_history: [],
  routers: [],
  provision_logs: [],
  provision_events: [],
  users: [],
  resellers: [],
  customers: [],
  payments: [],
  olt_connections: [],
  integrations: [],
  hotspot_vouchers: [],
  fup_profiles: [],
  tr069_devices: [],
  // RADIUS tables
  nas: [],
  radcheck: [],
  radreply: [],
  radusergroup: [],
  radgroupcheck: [],
  radgroupreply: [],
  radacct: [],
  radpostauth: [],
  ipam_subnets: [],
  ipam_ips: [],
  // Billing tables (for db.query() direct access)
  subscriptions: [],
  service_plans: [],
  invoices: [],
  tickets: [],
  ticket_categories: [],
  ticket_messages: [],
  reviews: [],
  staff_points: [],
  settings: [],
  usage_records: [],
  audit_logs: [],
  provisioning_queue: [],
};

// Seed integrations
const seedIntegrations = () => {
  store.integrations = [
    {
      id: uuidv4(),
      service_name: "africas_talking",
      display_name: "Africa's Talking",
      category: "sms",
      config_data: { username: "", api_key: "", sender_id: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "mpesa",
      display_name: "M-Pesa",
      category: "payment",
      config_data: {
        consumer_key: "",
        consumer_secret: "",
        shortcode: "",
        passkey: "",
        environment: "",
      },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "whatsapp",
      display_name: "WhatsApp Business",
      category: "messaging",
      config_data: { access_token: "", phone_number_id: "", verify_token: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "sendgrid",
      display_name: "SendGrid",
      category: "email",
      config_data: { api_key: "", from_email: "", from_name: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "twilio",
      display_name: "Twilio SMS",
      category: "sms",
      config_data: { account_sid: "", auth_token: "", phone_number: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "stripe",
      display_name: "Stripe",
      category: "payment",
      config_data: {
        secret_key: "",
        publishable_key: "",
        webhook_secret: "",
        currency: "",
      },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "paypal",
      display_name: "PayPal",
      category: "payment",
      config_data: {
        client_id: "",
        client_secret: "",
        environment: "",
        webhook_id: "",
      },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "flutterwave",
      display_name: "Flutterwave",
      category: "payment",
      config_data: {
        secret_key: "",
        public_key: "",
        encryption_key: "",
        environment: "",
      },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "slack",
      display_name: "Slack Notifications",
      category: "monitoring",
      config_data: { webhook_url: "", channel: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "discord",
      display_name: "Discord Webhook",
      category: "monitoring",
      config_data: { webhook_url: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "smsleopard",
      display_name: "SMSLeopard",
      category: "sms",
      config_data: { api_key: "", sender_id: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "bulksms_kenya",
      display_name: "BulkSMS Kenya",
      category: "sms",
      config_data: { username: "", api_key: "", sender_id: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "nexmo",
      display_name: "Nexmo (Vonage)",
      category: "sms",
      config_data: { api_key: "", api_secret: "", sender_id: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "mailgun",
      display_name: "Mailgun",
      category: "email",
      config_data: { api_key: "", domain: "", from_email: "", from_name: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "aws_ses",
      display_name: "AWS SES",
      category: "email",
      config_data: { access_key_id: "", secret_access_key: "", region: "us-east-1", from_email: "", from_name: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "mailchimp",
      display_name: "Mailchimp",
      category: "email",
      config_data: { api_key: "", list_id: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "telegram",
      display_name: "Telegram Bot",
      category: "communication",
      config_data: { bot_token: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      service_name: "google_cloud_storage",
      display_name: "Google Cloud Storage",
      category: "storage",
      config_data: { project_id: "", key_filename: "", bucket_name: "" },
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
};

seedIntegrations();

// Helper to parse SQL SET clause and return an object of updates mapped to parameter values
function parseSetClause(sql, params) {
  const setPart = sql.match(/set\s+([\s\S]+?)\s+where/i);
  if (!setPart) return {};
  // Split by comma but not inside parentheses (e.g. COALESCE(a, b))
  const clauses = setPart[1].split(/,(?![^(]*\))/);
  const updates = {};
  
  clauses.forEach(clause => {
    const parts = clause.split("=");
    if (parts.length !== 2) return;
    const col = parts[0].trim().replace(/^['"`\s]+|['"`\s]+$/g, '').toLowerCase();
    const valStr = parts[1].trim();
    
    // Check if the value contains a placeholder like $1, $2, etc.
    const placeholderMatch = valStr.match(/\$(\d+)/);
    if (placeholderMatch) {
      const idx = parseInt(placeholderMatch[1], 10) - 1;
      if (idx >= 0 && idx < params.length) {
        const val = params[idx];
        const isCoalesce = valStr.toLowerCase().includes("coalesce");
        if (isCoalesce && (val === null || val === undefined)) {
          // Skip setting this field if it is a coalesce and the parameter is null/undefined
        } else {
          updates[col] = val;
        }
      }
    } else if (valStr.toLowerCase() === "now()" || valStr.toLowerCase() === "current_timestamp") {
      updates[col] = new Date().toISOString();
    } else if (valStr.toLowerCase() === "null") {
      updates[col] = null;
    } else if (valStr.toLowerCase() === "true") {
      updates[col] = true;
    } else if (valStr.toLowerCase() === "false") {
      updates[col] = false;
    } else {
      let lit = valStr;
      if ((lit.startsWith("'") && lit.endsWith("'")) || (lit.startsWith('"') && lit.endsWith('"'))) {
        lit = lit.substring(1, lit.length - 1);
      }
      updates[col] = lit;
    }
  });
  return updates;
}

// Helper to find the ID parameter index from SQL text and return its value
function findIdParam(sql, params) {
  const whereMatch = sql.match(/where\s+id\s*=\s*\$(\d+)/i);
  if (whereMatch) {
    const idx = parseInt(whereMatch[1], 10) - 1;
    return params[idx];
  }
  // Fallback to last param if not found
  return params[params.length - 1];
}

module.exports = {
  query: async (text, params) => {
    const lowerText = text.toLowerCase();

    // SELECT projects
    if (lowerText.includes("select") && lowerText.includes("from tenants")) {
      let rows = [...store.tenants];
      if (lowerText.includes("where id =")) {
        rows = rows.filter((t) => t.id === params[0]);
      } else if (lowerText.includes("where lower(domain)")) {
        rows = rows.filter(
          (t) =>
            t.domain &&
            t.domain.toLowerCase() === String(params[0]).toLowerCase() &&
            t.is_active !== false,
        );
      } else if (lowerText.includes("where slug =")) {
        rows = rows.filter((t) => t.slug === params[0]);
      }
      return { rows };
    }

    if (lowerText.includes("update tenants")) {
      const id = findIdParam(text, params);
      const idx = store.tenants.findIndex((t) => t.id === id);
      if (idx === -1) {return { rows: [] };}

      if (lowerText.includes("settings")) {
        const incoming =
          typeof params[0] === "string" ? JSON.parse(params[0]) : params[0];
        store.tenants[idx].settings = {
          ...(store.tenants[idx].settings || {}),
          ...(incoming || {}),
        };
      } else {
        store.tenants[idx] = {
          ...store.tenants[idx],
          ...parseSetClause(text, params),
        };
      }

      store.tenants[idx].updated_at = new Date().toISOString();
      return { rows: [store.tenants[idx]] };
    }

    if (lowerText.includes("insert into tenants")) {
      const tenant = {
        id: params[0],
        name: params[1],
        slug: params[2],
        company_name: params[3] || params[1],
        email: params[4] || "",
        phone: params[5] || "",
        address: params[6] || "",
        domain: params[7] || "",
        max_customers: params[8] || 0,
        max_routers: params[9] || 0,
        settings: {},
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.tenants.push(tenant);
      return { rows: [tenant] };
    }

    // SELECT projects
    if (lowerText.includes("select") && lowerText.includes("from projects")) {
      if (lowerText.includes("where id =")) {
        const project = store.projects.find((p) => p.id === params[0]);
        return { rows: project ? [project] : [] };
      }
      return {
        rows: store.projects.sort(
          (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
        ),
      };
    }

    // INSERT projects
    if (lowerText.includes("insert into projects")) {
      const project = {
        id: params[0],
        name: params[1],
        description: params[2],
        routeros_version: params[3],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.projects.push(project);
      return { rows: [project] };
    }

    // UPDATE projects
    if (lowerText.includes("update projects")) {
      const idx = store.projects.findIndex((p) => p.id === params[4]);
      if (idx === -1) {return { rows: [] };}
      const project = {
        ...store.projects[idx],
        name: params[0] || store.projects[idx].name,
        description:
          params[1] !== null ? params[1] : store.projects[idx].description,
        routeros_version: params[2] || store.projects[idx].routeros_version,
        updated_at: new Date().toISOString(),
      };
      store.projects[idx] = project;
      return { rows: [project] };
    }

    // DELETE projects
    if (lowerText.includes("delete from projects")) {
      const idx = store.projects.findIndex((p) => p.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      const deleted = store.projects.splice(idx, 1)[0];
      // Also delete associated modules
      store.project_modules = store.project_modules.filter(
        (m) => m.project_id !== params[0],
      );
      return { rows: [deleted] };
    }

    // SELECT routers
    if (lowerText.includes("select") && lowerText.includes("from routers")) {
      if (lowerText.includes("where provision_token =")) {
        const router = store.routers.find(
          (r) => r.provision_token === params[0],
        );
        return { rows: router ? [router] : [] };
      }
      if (lowerText.includes("where id =")) {
        const router = store.routers.find((r) => r.id === params[0]);
        return { rows: router ? [router] : [] };
      }
      if (lowerText.includes("where project_id =")) {
        const routers = store.routers.filter((r) => r.project_id === params[0]);
        return { rows: routers };
      }
      return { rows: store.routers };
    }

    // INSERT routers
    if (lowerText.includes("insert into routers")) {
      const router = {
        id: params[0],
        project_id: params[1],
        name: params[2],
        identity: params[3],
        model: params[4],
        mac_address: params[5],
        ip_address: params[6],
        wan_interface: params[7],
        lan_interface: params[8],
        lan_ports: params[9],
        provision_token: params[10],
        provision_status: params[11],
        dns_servers: params[12],
        ntp_servers: params[13],
        radius_server: params[14],
        radius_secret: params[15],
        radius_port: params[16],
        hotspot_enabled: params[17],
        pppoe_enabled: params[18],
        pppoe_interface: params[19],
        pppoe_service_name: params[20],
        mgmt_port: params[21],
        mgmt_username: params[22],
        mgmt_password_encrypted: params[23],
        connection_type: params[24],
        notes: params[25],
        linked_mikrotik_connection_id: null,
        billing_activated_at: null,
        billing_activation_error: null,
        provision_attempts: 0,
        last_provisioned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.routers.push(router);
      return { rows: [router] };
    }

    // UPDATE routers
    if (lowerText.includes("update routers") && lowerText.includes("set")) {
      const idx = store.routers.findIndex(
        (r) => r.id === params[params.length - 1],
      );
      if (idx === -1) {return { rows: [] };}
      const router = {
        ...store.routers[idx],
        updated_at: new Date().toISOString(),
      };
      // Handle various SET patterns
      if (lowerText.includes("name =")) {router.name = params[0];}
      if (lowerText.includes("identity =")) {router.identity = params[1];}
      if (lowerText.includes("model =")) {router.model = params[2];}
      if (lowerText.includes("mac_address =")) {router.mac_address = params[3];}
      if (lowerText.includes("ip_address =")) {router.ip_address = params[4];}
      if (lowerText.includes("wan_interface ="))
        {router.wan_interface = params[5];}
      if (lowerText.includes("lan_interface ="))
        {router.lan_interface = params[6];}
      if (lowerText.includes("lan_ports =")) {router.lan_ports = params[7];}
      if (lowerText.includes("dns_servers =")) {router.dns_servers = params[8];}
      if (lowerText.includes("ntp_servers =")) {router.ntp_servers = params[9];}
      if (lowerText.includes("radius_server ="))
        {router.radius_server = params[10];}
      if (lowerText.includes("radius_secret ="))
        {router.radius_secret = params[11];}
      if (lowerText.includes("radius_port =")) {router.radius_port = params[12];}
      if (lowerText.includes("hotspot_enabled ="))
        {router.hotspot_enabled = params[13];}
      if (lowerText.includes("pppoe_enabled ="))
        {router.pppoe_enabled = params[14];}
      if (lowerText.includes("pppoe_interface ="))
        {router.pppoe_interface = params[15];}
      if (lowerText.includes("pppoe_service_name ="))
        {router.pppoe_service_name = params[16];}
      if (lowerText.includes("mgmt_port =")) {router.mgmt_port = params[17];}
      if (lowerText.includes("mgmt_username ="))
        {router.mgmt_username = params[18];}
      if (lowerText.includes("mgmt_password_encrypted ="))
        {router.mgmt_password_encrypted = params[19];}
      if (lowerText.includes("connection_type ="))
        {router.connection_type = params[20];}
      if (lowerText.includes("notes =")) {router.notes = params[21];}
      if (lowerText.includes("provision_token ="))
        {router.provision_token = params[0];}
      if (lowerText.includes("provision_status ="))
        {router.provision_status = params[0];}
      if (lowerText.includes("linked_mikrotik_connection_id ="))
        {router.linked_mikrotik_connection_id = params[0];}
      if (lowerText.includes("billing_activated_at = case when"))
        {router.billing_activated_at = params[0]
          ? new Date().toISOString()
          : router.billing_activated_at;}
      if (lowerText.includes("billing_activation_error ="))
        {router.billing_activation_error = params[1];}
      if (lowerText.includes("last_provisioned_at = current_timestamp"))
        {router.last_provisioned_at = new Date().toISOString();}
      if (
        lowerText.includes(
          "provision_attempts = coalesce(provision_attempts, 0) + 1",
        )
      )
        {router.provision_attempts = (router.provision_attempts || 0) + 1;}
      if (
        lowerText.includes("last_provisioned_at =") &&
        !lowerText.includes("current_timestamp")
      )
        {router.last_provisioned_at = params[0];}
      store.routers[idx] = router;
      return { rows: [router] };
    }

    // DELETE routers
    if (lowerText.includes("delete from routers")) {
      const idx = store.routers.findIndex((r) => r.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      const deleted = store.routers.splice(idx, 1)[0];
      return { rows: [deleted] };
    }

    // SELECT provision logs
    if (
      lowerText.includes("select") &&
      lowerText.includes("from provision_logs")
    ) {
      let rows = [...store.provision_logs];
      if (lowerText.includes("where router_id =")) {
        rows = rows.filter((log) => log.router_id === params[0]);
      }
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows };
    }

    // INSERT provision logs
    if (lowerText.includes("insert into provision_logs")) {
      const log = {
        id: params[0],
        token: params[1],
        router_id: params[2],
        ip_address: params[3],
        user_agent: params[4],
        action: params[5],
        status: params[6],
        details: params[7],
        created_at: new Date().toISOString(),
      };
      store.provision_logs.push(log);
      return { rows: [log] };
    }

    // INSERT provision events
    if (lowerText.includes("insert into provision_events")) {
      const event = {
        id: params[0],
        router_id: params[1],
        event_type: params[2],
        script_content: params[3],
        created_at: new Date().toISOString(),
      };
      store.provision_events.push(event);
      return { rows: [event] };
    }

    // SELECT project_modules
    if (
      lowerText.includes("select") &&
      lowerText.includes("from project_modules")
    ) {
      if (lowerText.includes("where project_id =")) {
        const modules = store.project_modules.filter(
          (m) => m.project_id === params[0],
        );
        return { rows: modules };
      }
      return { rows: store.project_modules };
    }

    // SELECT modules by project_id and module_type (check existing)
    if (lowerText.includes("select id from project_modules")) {
      const modules = store.project_modules.filter(
        (m) => m.project_id === params[0] && m.module_type === params[1],
      );
      return { rows: modules };
    }

    // INSERT/UPDATE project_modules
    if (lowerText.includes("update project_modules")) {
      const module = store.project_modules.find(
        (m) => m.project_id === params[2] && m.module_type === params[3],
      );
      if (!module) {return { rows: [] };}
      module.config_data = params[0];
      module.generated_script = params[1] || module.generated_script;
      module.updated_at = new Date().toISOString();
      return { rows: [module] };
    }

    if (lowerText.includes("insert into project_modules")) {
      const mod = {
        id: params[0],
        project_id: params[1],
        module_type: params[2],
        config_data: params[3],
        generated_script: params[4],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.project_modules.push(mod);
      return { rows: [mod] };
    }

    // DELETE project_modules
    if (lowerText.includes("delete from project_modules")) {
      const idx = store.project_modules.findIndex((m) => m.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.project_modules.splice(idx, 1) };
    }

    // SELECT templates
    if (lowerText.includes("select") && lowerText.includes("from templates")) {
      let results = [...store.templates];
      if (lowerText.includes("where")) {
        if (lowerText.includes("category =")) {
          results = results.filter((t) => t.category === params[0]);
        } else if (lowerText.includes("id =")) {
          results = results.filter((t) => t.id === params[0]);
        }
      }
      return { rows: results.sort((a, b) => a.name.localeCompare(b.name)) };
    }

    // INSERT templates
    if (lowerText.includes("insert into templates")) {
      const template = {
        id: params[0],
        name: params[1],
        description: params[2],
        category: params[3],
        content: params[4],
        is_public: params[5],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.templates.push(template);
      return { rows: [template] };
    }

    // UPDATE templates
    if (lowerText.includes("update templates")) {
      const idx = store.templates.findIndex((t) => t.id === params[5]);
      if (idx === -1) {return { rows: [] };}
      const template = {
        ...store.templates[idx],
        name: params[0] || store.templates[idx].name,
        description:
          params[1] !== null ? params[1] : store.templates[idx].description,
        category: params[2] || store.templates[idx].category,
        content: params[3] || store.templates[idx].content,
        is_public:
          params[4] !== undefined ? params[4] : store.templates[idx].is_public,
        updated_at: new Date().toISOString(),
      };
      store.templates[idx] = template;
      return { rows: [template] };
    }

    // DELETE templates
    if (lowerText.includes("delete from templates")) {
      const idx = store.templates.findIndex((t) => t.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.templates.splice(idx, 1) };
    }

    // SELECT mikrotik_connections
    if (
      lowerText.includes("select") &&
      lowerText.includes("mikrotik_connections")
    ) {
      if (lowerText.includes("where id =")) {
        const conn = store.mikrotik_connections.find((c) => c.id === params[0]);
        return { rows: conn ? [conn] : [] };
      }
      // Return without password
      const conns = store.mikrotik_connections.map((c) => ({
        id: c.id,
        name: c.name,
        ip_address: c.ip_address,
        api_port: c.api_port,
        ssh_port: c.ssh_port,
        username: c.username,
        connection_type: c.connection_type,
        use_tunnel: c.use_tunnel,
        tunnel_host: c.tunnel_host,
        tunnel_port: c.tunnel_port,
        tunnel_username: c.tunnel_username,
        is_online: c.is_online || false,
        last_seen: c.last_seen || null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));
      return { rows: conns };
    }

    // INSERT mikrotik_connections
    if (lowerText.includes("insert into mikrotik_connections")) {
      const hasTenantId = lowerText.includes("tenant_id");
      const conn = {
        id: params[0],
        name: params[1],
        ip_address: params[2],
        api_port: params[3],
        ssh_port: params[4],
        username: params[5],
        password_encrypted: params[6],
        connection_type: params[7],
        use_tunnel: params[8],
        tunnel_host: params[9],
        tunnel_port: params[10],
        tunnel_username: params[11],
        tunnel_password_encrypted: params[12],
        tenant_id: hasTenantId ? params[13] : null,
        is_online: hasTenantId ? true : false,
        last_seen: hasTenantId ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.mikrotik_connections.push(conn);
      const safeConn = {
        id: conn.id,
        name: conn.name,
        ip_address: conn.ip_address,
        api_port: conn.api_port,
        ssh_port: conn.ssh_port,
        username: conn.username,
        connection_type: conn.connection_type,
        use_tunnel: conn.use_tunnel,
        tunnel_host: conn.tunnel_host,
        tunnel_port: conn.tunnel_port,
        tunnel_username: conn.tunnel_username,
        created_at: conn.created_at,
      };
      return { rows: [safeConn] };
    }

    // UPDATE mikrotik_connections
    if (lowerText.includes("update mikrotik_connections")) {
      if (lowerText.includes("set tenant_id = $1") && params.length === 2) {
        const conn = store.mikrotik_connections.find((c) => c.id === params[1]);
        if (!conn) {return { rows: [] };}
        conn.tenant_id = params[0];
        conn.updated_at = new Date().toISOString();
        return { rows: [conn] };
      }
      if (lowerText.includes("set ip_address = $1") && params.length === 2) {
        const conn = store.mikrotik_connections.find((c) => c.id === params[1]);
        if (!conn) {return { rows: [] };}
        conn.ip_address = params[0];
        conn.updated_at = new Date().toISOString();
        return { rows: [conn] };
      }
      const hasTenantId = lowerText.includes("tenant_id = coalesce");
      const id = hasTenantId ? params[13] : params[12];
      const conn = store.mikrotik_connections.find((c) => c.id === id);
      if (!conn) {return { rows: [] };}
      conn.name = params[0];
      conn.ip_address = params[1];
      conn.api_port = params[2];
      conn.ssh_port = params[3];
      conn.username = params[4];
      conn.password_encrypted = params[5];
      conn.connection_type = params[6];
      conn.use_tunnel = params[7];
      conn.tunnel_host = params[8];
      conn.tunnel_port = params[9];
      conn.tunnel_username = params[10];
      conn.tunnel_password_encrypted = params[11];
      if (hasTenantId && params[12]) {conn.tenant_id = params[12];}
      conn.updated_at = new Date().toISOString();

      return {
        rows: [
          {
            id: conn.id,
            name: conn.name,
            ip_address: conn.ip_address,
            api_port: conn.api_port,
            ssh_port: conn.ssh_port,
            username: conn.username,
            connection_type: conn.connection_type,
            use_tunnel: conn.use_tunnel,
            tunnel_host: conn.tunnel_host,
            tunnel_port: conn.tunnel_port,
            tunnel_username: conn.tunnel_username,
            is_online: conn.is_online || false,
            last_seen: conn.last_seen || null,
            created_at: conn.created_at,
            updated_at: conn.updated_at,
          },
        ],
      };
    }

    // DELETE mikrotik_connections
    if (lowerText.includes("delete from mikrotik_connections")) {
      const idx = store.mikrotik_connections.findIndex(
        (c) => c.id === params[0],
      );
      if (idx === -1) {return { rows: [] };}
      return { rows: store.mikrotik_connections.splice(idx, 1) };
    }

    // INSERT script_history
    if (lowerText.includes("insert into script_history")) {
      return { rows: [] };
    }

    // SELECT resellers
    if (lowerText.includes("select") && lowerText.includes("from resellers")) {
      if (lowerText.includes("where id =")) {
        const reseller = store.resellers.find((r) => r.id === params[0]);
        return { rows: reseller ? [reseller] : [] };
      }
      // Handle COUNT and COALESCE subqueries for customer_count and total_revenue
      const resellersWithStats = store.resellers.map((r) => {
        const customers = store.customers.filter((c) => c.reseller_id === r.id);
        const customerCount = customers.length;
        const totalRevenue = store.payments
          .filter((p) => customers.some((c) => c.id === p.customer_id))
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        return {
          ...r,
          customer_count: customerCount,
          total_revenue: totalRevenue,
        };
      });
      return {
        rows: resellersWithStats.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT resellers
    if (lowerText.includes("insert into resellers")) {
      const reseller = {
        id: params[0],
        name: params[1],
        company: params[2],
        email: params[3],
        phone: params[4],
        commission_rate: params[5] || 10,
        credit_limit: params[6] || 0,
        status: params[7] || "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.resellers.push(reseller);
      return { rows: [reseller] };
    }

    // UPDATE resellers
    if (lowerText.includes("update resellers")) {
      const idx = store.resellers.findIndex((r) => r.id === params[7]);
      if (idx === -1) {return { rows: [] };}
      const reseller = {
        ...store.resellers[idx],
        name: params[0] || store.resellers[idx].name,
        company:
          params[1] !== undefined ? params[1] : store.resellers[idx].company,
        email: params[2] !== undefined ? params[2] : store.resellers[idx].email,
        phone: params[3] !== undefined ? params[3] : store.resellers[idx].phone,
        commission_rate:
          params[4] !== undefined
            ? params[4]
            : store.resellers[idx].commission_rate,
        credit_limit:
          params[5] !== undefined
            ? params[5]
            : store.resellers[idx].credit_limit,
        status:
          params[6] !== undefined ? params[6] : store.resellers[idx].status,
        updated_at: new Date().toISOString(),
      };
      store.resellers[idx] = reseller;
      return { rows: [reseller] };
    }

    // DELETE resellers
    if (lowerText.includes("delete from resellers")) {
      const idx = store.resellers.findIndex((r) => r.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      const deleted = store.resellers.splice(idx, 1)[0];
      // Set reseller_id to null for associated customers
      store.customers.forEach((c) => {
        if (c.reseller_id === params[0]) {c.reseller_id = null;}
      });
      return { rows: [deleted] };
    }

    // SELECT customers (for customer routes)
    if (lowerText.includes("select") && lowerText.includes("from customers")) {
      if (lowerText.includes("where id =")) {
        const customer = store.customers.find((c) => c.id === params[0]);
        return { rows: customer ? [customer] : [] };
      }
      return {
        rows: store.customers.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT customers
    if (lowerText.includes("insert into customers")) {
      const customer = {
        id: params[0],
        name: params[1] || "",
        email: params[2] || "",
        phone: params[3] || "",
        address: params[4] || "",
        status: params[5] || "active",
        service_plan_id: params[6],
        reseller_id: params[7],
        fup_profile_id: params[8] || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.customers.push(customer);
      return { rows: [customer] };
    }

    // UPDATE customers
    if (
      lowerText.includes("update customers") &&
      lowerText.includes("where id =")
    ) {
      const id = findIdParam(text, params);
      const idx = store.customers.findIndex((c) => c.id === id);
      if (idx === -1) {return { rows: [] };}
      
      let updates = {};
      if (params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
        updates = params[0];
      } else {
        updates = parseSetClause(text, params);
      }
      
      store.customers[idx] = {
        ...store.customers[idx],
        ...updates,
        fup_profile_id:
          updates.fup_profile_id !== undefined
            ? updates.fup_profile_id
            : store.customers[idx].fup_profile_id,
        updated_at: new Date().toISOString(),
      };
      return { rows: [store.customers[idx]] };
    }

    // DELETE customers
    if (lowerText.includes("delete from customers")) {
      const idx = store.customers.findIndex((c) => c.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.customers.splice(idx, 1) };
    }

    // SELECT payments
    if (lowerText.includes("select") && lowerText.includes("from payments")) {
      if (lowerText.includes("where id =")) {
        const payment = store.payments.find((p) => p.id === params[0]);
        return { rows: payment ? [payment] : [] };
      }
      return {
        rows: store.payments.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT payments
    if (lowerText.includes("insert into payments")) {
      const payment = {
        id: params[0],
        customer_id: params[1],
        amount: params[2],
        method: params[3],
        reference: params[4],
        notes: params[5],
        created_at: new Date().toISOString(),
      };
      store.payments.push(payment);
      return { rows: [payment] };
    }

    // DELETE payments
    if (lowerText.includes("delete from payments")) {
      const idx = store.payments.findIndex((p) => p.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.payments.splice(idx, 1) };
    }

    // SELECT olt_connections
    if (
      lowerText.includes("select") &&
      lowerText.includes("from olt_connections")
    ) {
      if (lowerText.includes("where id =")) {
        const olt = store.olt_connections.find((o) => o.id === params[0]);
        return { rows: olt ? [olt] : [] };
      }
      return {
        rows: store.olt_connections.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT olt_connections
    if (lowerText.includes("insert into olt_connections")) {
      const olt = {
        id: params[0],
        name: params[1],
        vendor: params[2],
        model: params[3],
        ip_address: params[4],
        telnet_port: params[5] || 23,
        snmp_port: params[6] || 161,
        username: params[7],
        password_encrypted: params[8],
        snmp_community_encrypted: params[9],
        location: params[10],
        status: params[11] || "active",
        custom_oids: params[12],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.olt_connections.push(olt);
      return { rows: [olt] };
    }

    // UPDATE olt_connections
    if (
      lowerText.includes("update olt_connections") &&
      lowerText.includes("where id =")
    ) {
      const idx = store.olt_connections.findIndex((o) => o.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      store.olt_connections[idx] = {
        ...store.olt_connections[idx],
        name: params[1] || store.olt_connections[idx].name,
        vendor: params[2] || store.olt_connections[idx].vendor,
        model: params[3] || store.olt_connections[idx].model,
        ip_address: params[4] || store.olt_connections[idx].ip_address,
        telnet_port: params[5] || store.olt_connections[idx].telnet_port,
        snmp_port: params[6] || store.olt_connections[idx].snmp_port,
        username: params[7] || store.olt_connections[idx].username,
        password_encrypted:
          params[8] || store.olt_connections[idx].password_encrypted,
        snmp_community_encrypted:
          params[9] || store.olt_connections[idx].snmp_community_encrypted,
        location:
          params[10] !== undefined
            ? params[10]
            : store.olt_connections[idx].location,
        status: params[11] || store.olt_connections[idx].status,
        custom_oids:
          params[12] !== undefined
            ? params[12]
            : store.olt_connections[idx].custom_oids,
        updated_at: new Date().toISOString(),
      };
      return { rows: [store.olt_connections[idx]] };
    }

    // DELETE olt_connections
    if (lowerText.includes("delete from olt_connections")) {
      const idx = store.olt_connections.findIndex((o) => o.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.olt_connections.splice(idx, 1) };
    }

    // SELECT integrations
    if (
      lowerText.includes("select") &&
      lowerText.includes("from integrations")
    ) {
      const parseConfig = (integration) => {
        if (!integration) return integration;
        let config = integration.config_data;
        if (typeof config === 'string') {
          try {
            config = JSON.parse(config);
          } catch (e) {
            // ignore
          }
        }
        return { ...integration, config_data: config };
      };

      if (lowerText.includes("where id =")) {
        const integration = store.integrations.find((i) => i.id === params[0]);
        return { rows: integration ? [parseConfig(integration)] : [] };
      }
      if (lowerText.includes("where service_name =")) {
        let results = store.integrations.filter((i) => i.service_name === params[0]);
        if (lowerText.includes("is_active = true")) {
          results = results.filter((i) => i.is_active === true);
        }
        return { rows: results.map(parseConfig) };
      }
      return {
        rows: store.integrations.map(parseConfig).sort((a, b) =>
          a.category.localeCompare(b.category),
        ),
      };
    }

    // UPDATE integrations
    if (lowerText.includes("update integrations")) {
      const id = findIdParam(text, params);
      const idx = store.integrations.findIndex((i) => i.id === id);
      if (idx === -1) {return { rows: [] };}
      
      const updates = parseSetClause(text, params);
      
      const updatedRow = {
        ...store.integrations[idx],
        updated_at: new Date().toISOString(),
      };
      
      if (updates.config_data !== undefined) {
        updatedRow.config_data = typeof updates.config_data === 'string'
          ? JSON.parse(updates.config_data)
          : updates.config_data;
      }
      if (updates.is_active !== undefined) {
        updatedRow.is_active = updates.is_active !== null ? updates.is_active : store.integrations[idx].is_active;
      }
      if (updates.last_tested !== undefined) {
        updatedRow.last_tested = updates.last_tested;
      }
      if (updates.last_test_status !== undefined) {
        updatedRow.last_test_status = updates.last_test_status;
      }
      if (updates.last_test_message !== undefined) {
        updatedRow.last_test_message = updates.last_test_message;
      }
      
      store.integrations[idx] = updatedRow;
      return { rows: [updatedRow] };
    }

    // SELECT hotspot_vouchers
    if (
      lowerText.includes("select") &&
      lowerText.includes("from hotspot_vouchers")
    ) {
      return {
        rows: store.hotspot_vouchers.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT hotspot_vouchers
    if (lowerText.includes("insert into hotspot_vouchers")) {
      const voucher = {
        id: params[0],
        username: params[1],
        password: params[2],
        profile: params[3],
        valid_for: params[4],
        rate_limit: params[5],
        data_limit: params[6],
        price: params[7],
        company_name: params[8],
        connection_id: params[9],
        created_at: params[10] || new Date().toISOString(),
      };
      store.hotspot_vouchers.push(voucher);
      return { rows: [voucher] };
    }

    // DELETE hotspot_vouchers
    if (lowerText.includes("delete from hotspot_vouchers")) {
      const idx = store.hotspot_vouchers.findIndex((v) => v.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.hotspot_vouchers.splice(idx, 1) };
    }

    // SELECT fup_profiles
    if (
      lowerText.includes("select") &&
      lowerText.includes("from fup_profiles")
    ) {
      if (params[0] && params.length === 1) {
        const fup = store.fup_profiles.find((f) => f.id === params[0]);
        return fup ? { rows: [fup] } : { rows: [] };
      }
      return {
        rows: store.fup_profiles.sort(
          (a, b) => (a.priority || 100) - (b.priority || 100),
        ),
      };
    }

    // INSERT fup_profiles
    if (lowerText.includes("insert into fup_profiles")) {
      const fup = {
        id: params[0],
        name: params[1],
        description: params[2],
        data_limit: params[3],
        data_limit_unit: params[4],
        reset_period: params[5],
        throttle_speed: params[6],
        priority: params[7],
        is_active: params[8],
        created_at: params[9] || new Date().toISOString(),
        updated_at: params[10] || new Date().toISOString(),
      };
      store.fup_profiles.push(fup);
      return { rows: [fup] };
    }

    // UPDATE fup_profiles
    if (
      lowerText.includes("update fup_profiles") &&
      lowerText.includes("where id =")
    ) {
      const idx = store.fup_profiles.findIndex((f) => f.id === params[8]);
      if (idx === -1) {return { rows: [] };}
      store.fup_profiles[idx] = {
        ...store.fup_profiles[idx],
        name: params[0],
        description: params[1],
        data_limit: params[2],
        data_limit_unit: params[3],
        reset_period: params[4],
        throttle_speed: params[5],
        priority: params[6],
        is_active: params[7],
        updated_at: new Date().toISOString(),
      };
      return { rows: [store.fup_profiles[idx]] };
    }

    // DELETE fup_profiles
    if (lowerText.includes("delete from fup_profiles")) {
      const idx = store.fup_profiles.findIndex((f) => f.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.fup_profiles.splice(idx, 1) };
    }

    // SELECT tr069_devices
    if (
      lowerText.includes("select") &&
      lowerText.includes("from tr069_devices")
    ) {
      if (params[0] && params.length === 1) {
        const device = store.tr069_devices.find((d) => d.id === params[0]);
        return device ? { rows: [device] } : { rows: [] };
      }
      if (lowerText.includes("serial_number =")) {
        const device = store.tr069_devices.find(
          (d) => d.serial_number === params[0],
        );
        return device ? { rows: [device] } : { rows: [] };
      }
      return {
        rows: store.tr069_devices.sort(
          (a, b) => new Date(b.last_inform || 0) - new Date(a.last_inform || 0),
        ),
      };
    }

    // INSERT tr069_devices
    if (lowerText.includes("insert into tr069_devices")) {
      const device = {
        id: params[0],
        serial_number: params[1],
        manufacturer: params[2],
        model: params[3],
        firmware_version: params[4],
        connection_id: params[5],
        ip_address: params[6],
        status: params[7],
        last_inform: params[8] || new Date().toISOString(),
        parameters: params[9],
        created_at: params[10] || new Date().toISOString(),
        updated_at: params[11] || new Date().toISOString(),
      };
      const existingIdx = store.tr069_devices.findIndex(
        (d) => d.serial_number === device.serial_number,
      );
      if (existingIdx !== -1) {
        store.tr069_devices[existingIdx] = {
          ...store.tr069_devices[existingIdx],
          ...device,
          updated_at: new Date().toISOString(),
        };
        return { rows: [store.tr069_devices[existingIdx]] };
      }
      store.tr069_devices.push(device);
      return { rows: [device] };
    }

    // UPDATE tr069_devices
    if (
      lowerText.includes("update tr069_devices") &&
      lowerText.includes("where id =")
    ) {
      const idx = store.tr069_devices.findIndex((d) => d.id === params[7]);
      if (idx === -1) {return { rows: [] };}
      store.tr069_devices[idx] = {
        ...store.tr069_devices[idx],
        manufacturer: params[0],
        model: params[1],
        firmware_version: params[2],
        connection_id: params[3],
        ip_address: params[4],
        status: params[5],
        parameters: params[6],
        updated_at: new Date().toISOString(),
      };
      return { rows: [store.tr069_devices[idx]] };
    }

    // DELETE tr069_devices
    if (lowerText.includes("delete from tr069_devices")) {
      const idx = store.tr069_devices.findIndex((d) => d.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      return { rows: store.tr069_devices.splice(idx, 1) };
    }

    // ═══════════════════════════════════════
    // RADIUS TABLES
    // ═══════════════════════════════════════

    // SELECT tickets
    if (lowerText.includes("select") && lowerText.includes("from tickets")) {
      return { rows: store.tickets };
    }

    // SELECT provisioning_queue
    if (lowerText.includes("select") && lowerText.includes("from provisioning_queue")) {
      return { rows: store.provisioning_queue };
    }

    // SELECT nas
    if (lowerText.includes("select") && lowerText.includes("from nas")) {
      return {
        rows: store.nas.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
      };
    }

    // INSERT nas
    if (lowerText.includes("insert into nas")) {
      const nas = {
        id: params[0] || uuidv4(),
        nasname: params[1],
        shortname: params[2],
        secret: params[3],
        description: params[4],
        type: params[5] || "other",
        connection_id: params[6] || null,
        created_at: new Date().toISOString(),
      };
      store.nas.push(nas);
      return { rows: [nas] };
    }

    // UPDATE nas
    if (lowerText.includes("update nas")) {
      const idx = store.nas.findIndex((n) => n.id === params[5]);
      if (idx === -1) {return { rows: [] };}
      store.nas[idx] = {
        ...store.nas[idx],
        nasname: params[0] || store.nas[idx].nasname,
        shortname: params[1] || store.nas[idx].shortname,
        secret: params[2] || store.nas[idx].secret,
        description: params[3] || store.nas[idx].description,
        type: params[4] || store.nas[idx].type,
        updated_at: new Date().toISOString(),
      };
      return { rows: [store.nas[idx]] };
    }

    // DELETE nas
    if (lowerText.includes("delete from nas")) {
      const idx = store.nas.findIndex((n) => n.id === params[0]);
      if (idx === -1) {return { rows: [] };}
      store.nas.splice(idx, 1);
      return { rows: [] };
    }

    // SELECT radcheck
    if (lowerText.includes("from radcheck")) {
      if (lowerText.includes("select id from radcheck")) {
        if (
          lowerText.includes("where username") &&
          lowerText.includes("and attribute")
        ) {
          const rows = store.radcheck.filter(
            (r) => r.username === params[0] && r.attribute === params[1],
          );
          return { rows };
        }
        if (lowerText.includes("where username")) {
          const rows = store.radcheck.filter((r) => r.username === params[0]);
          return { rows };
        }
        if (
          lowerText.includes("where username") &&
          lowerText.includes("and value")
        ) {
          const rows = store.radcheck.filter(
            (r) =>
              r.username === params[0] &&
              r.attribute === params[1] &&
              r.value === params[2],
          );
          return { rows };
        }
      }
      if (lowerText.includes("select count(*) from radcheck")) {
        return { rows: [{ count: String(store.radcheck.length) }] };
      }
      if (lowerText.includes("distinct")) {
        // SELECT DISTINCT rc.username, ... FROM radcheck rc
        const distinctUsers = [
          ...new Map(store.radcheck.map((r) => [r.username, r])).values(),
        ];
        const result = distinctUsers.map((r) => {
          const password = store.radcheck.find(
            (x) =>
              x.username === r.username && x.attribute === "Cleartext-Password",
          );
          const expiration = store.radcheck.find(
            (x) => x.username === r.username && x.attribute === "Expiration",
          );
          const framedIp = store.radreply.find(
            (x) =>
              x.username === r.username && x.attribute === "Framed-IP-Address",
          );
          const rateLimit = store.radreply.find(
            (x) =>
              x.username === r.username &&
              x.attribute === "Mikrotik-Rate-Limit",
          );
          const groups = store.radusergroup
            .filter((x) => x.username === r.username)
            .map((x) => x.groupname)
            .join(", ");
          const activeSessions = store.radacct.filter(
            (x) => x.username === r.username && x.acctstoptime === null,
          ).length;
          const customer = r.customer_id
            ? store.customers.find((c) => c.id === r.customer_id)
            : null;
          return {
            username: r.username,
            customer_id: r.customer_id || null,
            customer_name: customer ? customer.name : null,
            password: password ? password.value : null,
            expiration: expiration ? expiration.value : null,
            framed_ip: framedIp ? framedIp.value : null,
            rate_limit: rateLimit ? rateLimit.value : null,
            groups: groups || null,
            active_sessions: activeSessions,
            created_at: r.created_at,
          };
        });
        return {
          rows: result.sort(
            (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
          ),
        };
      }
      return { rows: store.radcheck };
    }

    // INSERT radcheck
    if (lowerText.includes("insert into radcheck")) {
      const check = {
        id: uuidv4(),
        username: params[0],
        attribute: params[1],
        op: params[2] || ":=",
        value: params[3],
        customer_id: params[4] || null,
        subscription_id: params[5] || null,
        created_at: new Date().toISOString(),
      };
      store.radcheck.push(check);
      return { rows: [check] };
    }

    // UPDATE radcheck
    if (lowerText.includes("update radcheck")) {
      const idx = store.radcheck.findIndex(
        (r) => r.username === params[1] && r.attribute === params[2],
      );
      if (idx !== -1) {
        store.radcheck[idx].value = params[0];
        return { rows: [store.radcheck[idx]] };
      }
      return { rows: [] };
    }

    // DELETE radcheck
    if (lowerText.includes("delete from radcheck")) {
      if (lowerText.includes("and attribute =")) {
        store.radcheck = store.radcheck.filter(
          (r) => !(r.username === params[0] && r.attribute === params[1]),
        );
      } else {
        store.radcheck = store.radcheck.filter((r) => r.username !== params[0]);
      }
      return { rows: [] };
    }

    // SELECT radreply
    if (lowerText.includes("from radreply")) {
      if (lowerText.includes("where username")) {
        const rows = store.radreply.filter((r) => r.username === params[0]);
        return { rows };
      }
      if (lowerText.includes("where groupname")) {
        const rows = store.radgroupreply.filter(
          (r) => r.groupname === params[0],
        );
        return { rows };
      }
      return { rows: store.radreply };
    }

    // INSERT radreply
    if (lowerText.includes("insert into radreply")) {
      const reply = {
        id: uuidv4(),
        username: params[0],
        attribute: params[1],
        op: params[2] || "=",
        value: params[3],
        created_at: new Date().toISOString(),
      };
      // ON CONFLICT DO NOTHING - skip if exists
      const exists = store.radreply.find(
        (r) =>
          r.username === reply.username &&
          r.attribute === reply.attribute &&
          r.value === reply.value,
      );
      if (!exists) {
        store.radreply.push(reply);
      }
      return { rows: [reply] };
    }

    // DELETE radreply
    if (lowerText.includes("delete from radreply")) {
      store.radreply = store.radreply.filter((r) => r.username !== params[0]);
      return { rows: [] };
    }

    // SELECT radusergroup
    if (lowerText.includes("from radusergroup")) {
      if (lowerText.includes("where groupname")) {
        const rows = store.radusergroup.filter(
          (r) => r.groupname === params[0],
        );
        return { rows };
      }
      if (lowerText.includes("where username")) {
        const rows = store.radusergroup.filter((r) => r.username === params[0]);
        return { rows };
      }
      return { rows: store.radusergroup };
    }

    // INSERT radusergroup
    if (lowerText.includes("insert into radusergroup")) {
      const entry = {
        id: uuidv4(),
        username: params[0],
        groupname: params[1],
        priority: params[2] || 1,
        created_at: new Date().toISOString(),
      };
      store.radusergroup.push(entry);
      return { rows: [entry] };
    }

    // DELETE radusergroup
    if (lowerText.includes("delete from radusergroup")) {
      store.radusergroup = store.radusergroup.filter(
        (r) => r.username !== params[0],
      );
      return { rows: [] };
    }

    // SELECT radgroupcheck
    if (lowerText.includes("from radgroupcheck")) {
      if (lowerText.includes("distinct")) {
        const groups = [
          ...new Set(store.radgroupcheck.map((r) => r.groupname)),
        ];
        return { rows: groups.map((g) => ({ groupname: g })) };
      }
      if (lowerText.includes("where groupname")) {
        const rows = store.radgroupcheck.filter(
          (r) => r.groupname === params[0],
        );
        return { rows };
      }
      return { rows: store.radgroupcheck };
    }

    // INSERT radgroupcheck
    if (lowerText.includes("insert into radgroupcheck")) {
      const entry = {
        id: uuidv4(),
        groupname: params[0],
        attribute: params[1],
        op: params[2] || "==",
        value: params[3],
        created_at: new Date().toISOString(),
      };
      store.radgroupcheck.push(entry);
      return { rows: [entry] };
    }

    // DELETE radgroupcheck
    if (lowerText.includes("delete from radgroupcheck")) {
      store.radgroupcheck = store.radgroupcheck.filter(
        (r) => r.groupname !== params[0],
      );
      return { rows: [] };
    }

    // SELECT radgroupreply
    if (lowerText.includes("from radgroupreply")) {
      if (lowerText.includes("where groupname")) {
        const rows = store.radgroupreply.filter(
          (r) => r.groupname === params[0],
        );
        return { rows };
      }
      return { rows: store.radgroupreply };
    }

    // INSERT radgroupreply
    if (lowerText.includes("insert into radgroupreply")) {
      const entry = {
        id: uuidv4(),
        groupname: params[0],
        attribute: params[1],
        op: params[2] || "=",
        value: params[3],
        created_at: new Date().toISOString(),
      };
      store.radgroupreply.push(entry);
      return { rows: [entry] };
    }

    // DELETE radgroupreply
    if (lowerText.includes("delete from radgroupreply")) {
      store.radgroupreply = store.radgroupreply.filter(
        (r) => r.groupname !== params[0],
      );
      return { rows: [] };
    }

    // SELECT radacct
    if (lowerText.includes("from radacct")) {
      if (lowerText.includes("where acctstoptime is null")) {
        const activeSessions = store.radacct.filter(
          (a) => a.acctstoptime === null,
        );
        return { rows: activeSessions };
      }
      if (lowerText.includes("where customer_id")) {
        const rows = store.radacct.filter((a) => a.customer_id === params[0]);
        return {
          rows: rows.sort(
            (a, b) =>
              new Date(b.acctstarttime || 0) - new Date(a.acctstarttime || 0),
          ),
        };
      }
      if (lowerText.includes("select count(*) from radacct")) {
        return { rows: [{ count: String(store.radacct.length) }] };
      }
      const rows = store.radacct.sort(
        (a, b) =>
          new Date(b.acctstarttime || 0) - new Date(a.acctstarttime || 0),
      );
      return { rows, total: rows.length };
    }

    // SELECT radpostauth
    if (lowerText.includes("from radpostauth")) {
      if (lowerText.includes("select count(*) from radpostauth")) {
        return { rows: [{ count: String(store.radpostauth.length) }] };
      }
      const rows = store.radpostauth.sort(
        (a, b) => new Date(b.authdate || 0) - new Date(a.authdate || 0),
      );
      return { rows, total: rows.length };
    }

    // ═══════════════════════════════════════
    // IPAM TABLES
    // ═══════════════════════════════════════

    // SELECT ipam_subnets
    if (lowerText.includes("from ipam_subnets")) {
      if (lowerText.includes("select count(*)")) {
        return { rows: [{ count: String(store.ipam_subnets.length) }] };
      }
      return {
        rows: store.ipam_subnets.sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
        ),
      };
    }

    // INSERT ipam_subnets
    if (lowerText.includes("insert into ipam_subnets")) {
      const subnet = {
        id: params[0],
        name: params[1],
        network: params[2],
        mask: params[3],
        gateway: params[4],
        description: params[5] || "",
        vlan_id: params[6] || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.ipam_subnets.push(subnet);
      return { rows: [subnet] };
    }

    // DELETE ipam_subnets
    if (lowerText.includes("delete from ipam_subnets")) {
      const idx = store.ipam_subnets.findIndex((s) => s.id === params[0]);
      if (idx !== -1) {store.ipam_subnets.splice(idx, 1);}
      return { rows: [] };
    }

    // SELECT ipam_ips
    if (lowerText.includes("from ipam_ips")) {
      if (
        lowerText.includes("select count(*)") &&
        lowerText.includes("status")
      ) {
        // SELECT status, COUNT(*) ... GROUP BY status
        const statusCounts = {};
        store.ipam_ips.forEach((ip) => {
          statusCounts[ip.status] = (statusCounts[ip.status] || 0) + 1;
        });
        const rows = Object.entries(statusCounts).map(([status, count]) => ({
          status,
          count: String(count),
        }));
        return { rows };
      }
      if (lowerText.includes("select count(*)")) {
        if (lowerText.includes("and status =")) {
          const count = store.ipam_ips.filter(
            (ip) => ip.subnet_id === params[0] && ip.status === params[1],
          ).length;
          return { rows: [{ count: String(count) }] };
        }
        // COUNT for specific subnet
        if (lowerText.includes("where subnet_id")) {
          const count = store.ipam_ips.filter(
            (ip) => ip.subnet_id === params[0],
          ).length;
          return { rows: [{ count: String(count) }] };
        }
      }
      if (lowerText.includes("where subnet_id")) {
        const rows = store.ipam_ips
          .filter((ip) => ip.subnet_id === params[0])
          .sort((a, b) => {
            const aParts = a.ip_address.split(".").map(Number);
            const bParts = b.ip_address.split(".").map(Number);
            for (let i = 0; i < 4; i++) {
              if (aParts[i] !== bParts[i]) {return aParts[i] - bParts[i];}
            }
            return 0;
          });
        return { rows };
      }
      return { rows: store.ipam_ips };
    }

    // INSERT ipam_ips
    if (lowerText.includes("insert into ipam_ips")) {
      const ip = {
        id: params[0],
        subnet_id: params[1],
        ip_address: params[2],
        status: params[3] || "free",
        description: "",
        assigned_to: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.ipam_ips.push(ip);
      return { rows: [ip] };
    }

    // UPDATE ipam_ips
    if (
      lowerText.includes("update ipam_ips") &&
      lowerText.includes("where subnet_id") &&
      lowerText.includes("and ip_address")
    ) {
      // Used for marking gateway
      const subnet_id = params[0];
      const ip_address = params[1];
      const ip = store.ipam_ips.find(
        (i) => i.subnet_id === subnet_id && i.ip_address === ip_address,
      );
      if (ip) {
        if (lowerText.includes("status") && lowerText.includes("description")) {
          ip.status = "reserved";
          ip.description = "Gateway";
        }
        ip.updated_at = new Date().toISOString();
      }
      return { rows: ip ? [ip] : [] };
    }
    if (
      lowerText.includes("update ipam_ips") &&
      lowerText.includes("where id")
    ) {
      const idx = store.ipam_ips.findIndex((i) => i.id === params[3]);
      if (idx === -1) {return { rows: [] };}
      if (params[0] !== undefined && params[0] !== null)
        {store.ipam_ips[idx].status = params[0];}
      if (params[1] !== undefined && params[1] !== null)
        {store.ipam_ips[idx].description = params[1];}
      if (params[2] !== undefined && params[2] !== null)
        {store.ipam_ips[idx].assigned_to = params[2];}
      store.ipam_ips[idx].updated_at = new Date().toISOString();
      return { rows: [store.ipam_ips[idx]] };
    }

    // DELETE ipam_ips
    if (lowerText.includes("delete from ipam_ips")) {
      if (lowerText.includes("where subnet_id")) {
        store.ipam_ips = store.ipam_ips.filter(
          (i) => i.subnet_id !== params[0],
        );
      }
      return { rows: [] };
    }

    // ═══════════════════════════════════════
    // BILLING & MISC TABLES
    // ═══════════════════════════════════════

    // SELECT subscriptions
    if (lowerText.includes("from subscriptions")) {
      if (lowerText.includes("select count(*)")) {
        return { rows: [{ count: String(store.subscriptions.length) }] };
      }
      let rows = [...store.subscriptions];
      if (lowerText.includes("where customer_id")) {
        rows = rows.filter((r) => r.customer_id === params[0]);
        if (lowerText.includes("status")) {
          rows = rows.filter((r) => r.status === params[1]);
        }
      }
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      return { rows: rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) };
    }

    // INSERT subscriptions
    if (lowerText.includes("insert into subscriptions")) {
      const sub = {
        id: params[0],
        customer_id: params[1],
        plan_id: params[2],
        pppoe_username: params[3] || "",
        pppoe_password: params[4] || "",
        mac_address: params[5] || "",
        pppoe_profile: params[6] || null,
        start_date: params[7] || new Date().toISOString(),
        end_date: params[8] || null,
        billing_cycle: params[9] || "monthly",
        status: params[10] || "active",
        router_id: params[11] || null,
        auto_provision: params[12] !== false,
        created_at: new Date().toISOString(),
      };
      store.subscriptions.push(sub);
      return { rows: [sub] };
    }

    // UPDATE subscriptions
    if (lowerText.includes("update subscriptions")) {
      const id = findIdParam(text, params);
      const idx = store.subscriptions.findIndex((s) => s.id === id);
      if (idx === -1) {return { rows: [] };}
      
      let updates = {};
      if (params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
        updates = params[0];
      } else {
        updates = parseSetClause(text, params);
      }
      
      const sub = {
        ...store.subscriptions[idx],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      
      store.subscriptions[idx] = sub;
      return { rows: [sub] };
    }

    // SELECT service_plans
    if (lowerText.includes("from service_plans")) {
      let rows = [...store.service_plans];
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      if (lowerText.includes("is_active")) {
        rows = rows.filter((r) => r.is_active !== false);
      }
      return { rows };
    }

    // INSERT service_plans
    if (lowerText.includes("insert into service_plans")) {
      const plan = {
        id: params[0],
        name: params[1],
        speed_up: params[2] || "1M",
        speed_down: params[3] || "1M",
        price: params[4] || 0,
        quota_gb: params[5] || null,
        created_at: new Date().toISOString(),
      };
      store.service_plans.push(plan);
      return { rows: [plan] };
    }

    // SELECT invoices
    if (lowerText.includes("from invoices")) {
      let rows = [...store.invoices];
      if (lowerText.includes("select count(*)")) {
        return { rows: [{ count: String(store.invoices.length) }] };
      }
      if (lowerText.includes("where customer_id")) {
        rows = rows.filter((r) => r.customer_id === params[0]);
      }
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      return { rows: rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) };
    }

    // INSERT invoices
    if (lowerText.includes("insert into invoices")) {
      const invoice = {
        id: params[0],
        invoice_number: params[1],
        customer_id: params[2],
        subscription_id: params[3] || null,
        amount: params[4] || 0,
        tax: params[5] || 0,
        total: (params[4] || 0) + (params[5] || 0),
        due_date: params[6] || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: params[7] || "pending",
        created_at: new Date().toISOString(),
      };
      store.invoices.push(invoice);
      return { rows: [invoice] };
    }

    // INSERT payments (general)
    if (lowerText.includes("insert into payments")) {
      const payment = {
        id: params[0],
        customer_id: params[1],
        invoice_id: params[2] || null,
        phone: params[3] || "",
        amount: params[4] || 0,
        method: params[5] || "cash",
        status: params[6] || "pending",
        reference: params[7] || "",
        received_at: params[8] || new Date().toISOString(),
        receipt_number: "RCP-" + Date.now(),
        created_at: new Date().toISOString(),
      };
      store.payments.push(payment);
      return { rows: [payment] };
    }

    // SELECT tickets
    if (lowerText.includes("from tickets")) {
      let rows = [...store.tickets];
      if (lowerText.includes("select count(*)")) {
        return { rows: [{ count: String(store.tickets.length) }] };
      }
      if (lowerText.includes("where t.customer_id") || lowerText.includes("where tickets.customer_id")) {
        rows = rows.filter((r) => r.customer_id === params[0]);
      }
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      // Enrich with category
      rows = rows.map((t) => {
        const cat = store.ticket_categories.find((c) => c.id === t.category_id);
        return {
          ...t,
          category_name: cat?.name || null,
          category_color: cat?.color || null,
          reply_count: store.ticket_messages.filter((m) => m.ticket_id === t.id).length,
          last_reply_at: store.ticket_messages
            .filter((m) => m.ticket_id === t.id)
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
            ?.created_at || null,
        };
      });
      return { rows: rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) };
    }

    // INSERT tickets
    if (lowerText.includes("insert into tickets")) {
      const ticket = {
        id: params[0],
        ticket_number: params[1],
        customer_id: params[2],
        category_id: params[3] || null,
        subject: params[4],
        description: params[5],
        priority: params[6] || "medium",
        status: params[7] || "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.tickets.push(ticket);
      return { rows: [ticket] };
    }

    // SELECT ticket_categories
    if (lowerText.includes("from ticket_categories")) {
      let rows = [...store.ticket_categories];
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      if (lowerText.includes("where name ilike") || lowerText.includes("where name like")) {
        rows = rows.filter((r) => r.name.toLowerCase() === String(params[0]).toLowerCase());
      }
      return { rows };
    }

    // INSERT ticket_categories
    if (lowerText.includes("insert into ticket_categories")) {
      const cat = {
        id: params[0],
        name: params[1],
        color: params[2] || "#6366f1",
        created_at: new Date().toISOString(),
      };
      store.ticket_categories.push(cat);
      return { rows: [cat] };
    }

    // INSERT ticket_messages
    if (lowerText.includes("insert into ticket_messages")) {
      const msg = {
        id: params[0] || uuidv4(),
        ticket_id: params[1],
        user_id: params[2] || null,
        message: params[3],
        is_internal: params[4] || false,
        created_at: new Date().toISOString(),
      };
      store.ticket_messages.push(msg);
      return { rows: [msg] };
    }

    // SELECT reviews
    if (lowerText.includes("from reviews")) {
      let rows = [...store.reviews];
      if (lowerText.includes("select count(*)")) {
        return { rows: [{ count: String(store.reviews.length) }] };
      }
      if (lowerText.includes("where customer_id")) {
        rows = rows.filter((r) => r.customer_id === params[0]);
      }
      if (lowerText.includes("where id =")) {
        rows = rows.filter((r) => r.id === params[0]);
      }
      return { rows: rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) };
    }

    // INSERT reviews
    if (lowerText.includes("insert into reviews")) {
      const review = {
        id: params[0],
        customer_id: params[1],
        rating: params[2],
        service_quality: params[3],
        comment: params[4] || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.reviews.push(review);
      return { rows: [review] };
    }

    // UPDATE reviews
    if (lowerText.includes("update reviews")) {
      const idx = store.reviews.findIndex((r) => r.customer_id === params[3]);
      if (idx === -1) {return { rows: [] };}
      store.reviews[idx].rating = params[0];
      store.reviews[idx].service_quality = params[1];
      store.reviews[idx].comment = params[2];
      store.reviews[idx].updated_at = new Date().toISOString();
      return { rows: [store.reviews[idx]] };
    }

    // INSERT staff_points
    if (lowerText.includes("insert into staff_points")) {
      const sp = {
        id: params[0] || uuidv4(),
        user_id: params[1],
        points: params[2],
        review_id: params[3] || null,
        reason: params[4] || "",
        created_at: new Date().toISOString(),
      };
      store.staff_points.push(sp);
      return { rows: [sp] };
    }

    // SELECT staff_points
    if (lowerText.includes("from staff_points")) {
      let rows = [...store.staff_points];
      if (lowerText.includes("where sp.user_id") || lowerText.includes("where staff_points.user_id")) {
        rows = rows.filter((r) => r.user_id === params[0]);
      }
      return { rows: rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) };
    }

    // SELECT FROM settings
    if (lowerText.includes("from settings")) {
      let rows = [...store.settings];
      if (lowerText.includes("where key =")) {
        rows = rows.filter((r) => r.key === params[0]);
      }
      if (lowerText.includes("where key in")) {
        const keys = lowerText.match(/key in \(([^)]+)\)/);
        if (keys) {
          const keyList = keys[1].split(",").map((k) => k.trim().replace(/['"]/g, ""));
          rows = rows.filter((r) => keyList.includes(r.key));
        }
      }
      return { rows };
    }

    // INSERT/UPDATE settings
    if (lowerText.includes("insert into settings")) {
      const setting = {
        id: params[0] || uuidv4(),
        key: params[1],
        value: params[2],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const existing = store.settings.findIndex((s) => s.key === setting.key);
      if (existing !== -1) {
        store.settings[existing].value = setting.value;
        store.settings[existing].updated_at = new Date().toISOString();
        return { rows: [store.settings[existing]] };
      }
      store.settings.push(setting);
      return { rows: [setting] };
    }

    // SELECT FROM usage_records
    if (lowerText.includes("from usage_records")) {
      let rows = [...store.usage_records];
      if (lowerText.includes("where customer_id")) {
        rows = rows.filter((r) => r.customer_id === params[0]);
      }
      return { rows: rows.sort((a, b) => new Date(b.recorded_at || 0) - new Date(a.recorded_at || 0)) };
    }

    // INSERT usage_records
    if (lowerText.includes("insert into usage_records")) {
      const record = {
        id: params[0] || uuidv4(),
        customer_id: params[1],
        bytes_in: params[2] || 0,
        bytes_out: params[3] || 0,
        session_time: params[4] || 0,
        recorded_at: params[5] || new Date().toISOString(),
      };
      store.usage_records.push(record);
      return { rows: [record] };
    }

    // INSERT audit_logs
    if (lowerText.includes("insert into audit_logs")) {
      const log = {
        id: params[0],
        action: params[1],
        entity_type: params[2],
        entity_id: params[3],
        user_id: params[4],
        user_name: params[5],
        user_role: params[6],
        ip_address: params[7],
        user_agent: params[8],
        details: params[9],
        before_data: params[10],
        after_data: params[11],
        created_at: new Date().toISOString(),
      };
      store.audit_logs.push(log);
      return { rows: [log] };
    }

    // INSERT/UPDATE anything else (generic fallback)
    return { rows: [] };
  },

  pool: { on: () => {} },
  _getStore: () => store,
};

// Wrap query to check users first
const _origQ = module.exports.query;
module.exports.query = async function (text, params) {
  // Users handler
  const lower = text.toLowerCase();
  if (lower.includes("users")) {
    if (lower.includes("select count(*) from users")) {
      return { rows: [{ count: String(store.users.length) }] };
    }
    if (lower.includes("from users") && lower.includes("where email")) {
      const user = store.users.find((u) => u.email === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (lower.includes("from users") && lower.includes("where id")) {
      const user = store.users.find((u) => u.id === params[params.length - 1]);
      if (lower.includes("select *")) {
        return { rows: user ? [user] : [] };
      }
      return {
        rows: user
          ? [
              {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar_url: user.avatar_url,
                created_at: user.created_at,
              },
            ]
          : [],
      };
    }
    if (lower.includes("select id from users")) {
      return {
        rows: store.users.length > 0 ? [{ id: store.users[0].id }] : [],
      };
    }
    if (lower.includes("insert into users")) {
      const isGoogleOauth = lower.includes("google_id");
      const user = {
        id: params[0],
        email: params[1],
        password_hash: isGoogleOauth ? "" : params[2],
        name: isGoogleOauth ? params[2] : params[3],
        role: isGoogleOauth ? "staff" : params[4],
        google_id: isGoogleOauth ? params[3] : null,
        avatar_url: isGoogleOauth ? params[4] : null,
        two_factor_secret: null,
        two_factor_enabled: false,
        created_at: new Date().toISOString(),
      };
      store.users.push(user);
      return {
        rows: [
          { id: user.id, email: user.email, name: user.name, role: user.role },
        ],
      };
    }
    if (lower.includes("update users")) {
      const user = store.users.find((u) => u.id === params[params.length - 1]);
      if (user) {
        if (lower.includes("last_login_at")) {
          user.last_login_at = new Date().toISOString();
        }
        if (lower.includes("is_online")) {
          user.is_online = lower.includes("is_online = true");
        }
        if (lower.includes("last_seen")) {
          user.last_seen = params[0];
          user.is_online = true;
        }
        if (lower.includes("two_factor_secret")) {
          if (lower.includes("two_factor_secret = null")) {
            user.two_factor_secret = null;
          } else {
            user.two_factor_secret = params[0];
          }
        }
        if (lower.includes("two_factor_enabled")) {
          user.two_factor_enabled = lower.includes("two_factor_enabled = true");
        }
        if (lower.includes("google_id")) {
          user.google_id = params[0];
          user.avatar_url = params[1];
        }
        return { rows: [] };
      }
    }
  }
  return _origQ(text, params);
};
