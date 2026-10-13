import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  MessageSquare, CreditCard, Smartphone, Mail, Cloud, Activity, 
  Save, TestTube2, Eye, EyeOff, CheckCircle, XCircle, Loader2,
  Settings, Key, Globe, Search, ChevronDown, ChevronUp, Info, 
  ExternalLink, Lock, Settings2, ShieldCheck, HelpCircle, Layers,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../hooks/useToast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const categoryIcons = {
  sms: MessageSquare,
  payment: CreditCard,
  messaging: Smartphone,
  email: Mail,
  storage: Cloud,
  monitoring: Activity,
  communication: MessageSquare,
};

const categoryColors = {
  sms: 'from-blue-500/20 to-cyan-500/20 border-cyan-500/30 text-cyan-400',
  payment: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400',
  messaging: 'from-violet-500/20 to-purple-500/20 border-purple-500/30 text-purple-400',
  communication: 'from-indigo-500/20 to-blue-500/20 border-blue-500/30 text-blue-400',
  email: 'from-orange-500/20 to-amber-500/20 border-amber-500/30 text-amber-400',
  storage: 'from-pink-500/20 to-rose-500/20 border-rose-500/30 text-rose-400',
  monitoring: 'from-fuchsia-500/20 to-pink-500/20 border-pink-500/30 text-pink-400',
};

const categoryGlows = {
  sms: 'shadow-cyan-500/5',
  payment: 'shadow-emerald-500/5',
  messaging: 'shadow-purple-500/5',
  communication: 'shadow-blue-500/5',
  email: 'shadow-amber-500/5',
  storage: 'shadow-rose-500/5',
  monitoring: 'shadow-pink-500/5',
};

const TABS = [
  { id: 'all', label: 'All Services', categories: ['sms', 'payment', 'messaging', 'email', 'storage', 'monitoring', 'communication'] },
  { id: 'payment', label: 'Payments', categories: ['payment'] },
  { id: 'sms', label: 'SMS Gateways', categories: ['sms'] },
  { id: 'email', label: 'Email', categories: ['email'] },
  { id: 'messaging', label: 'Messaging & Bots', categories: ['messaging', 'communication'] },
  { id: 'monitoring', label: 'Alerts & Webhooks', categories: ['monitoring'] },
  { id: 'storage', label: 'Storage', categories: ['storage'] },
];

const serviceDocs = {
  africas_talking: {
    desc: "Integrate SMS sending and USSD utilities using Africa's Talking API.",
    link: "https://developers.africastalking.com",
    tip: "Retrieve your API Key under Settings > API Key in the Africa's Talking Sandbox/Production developer dashboard."
  },
  mpesa: {
    desc: "Accept mobile money payments via Safaricom Lipa Na M-Pesa (Daraja API).",
    link: "https://developer.safaricom.co.ke",
    tip: "Create a Lipa Na M-Pesa sandbox/production application on Safaricom Daraja Portal to get keys, passkey, and shortcode."
  },
  whatsapp: {
    desc: "Send automated billing reminders and client notifications via Meta Cloud API.",
    link: "https://developers.facebook.com",
    tip: "Setup a Meta Developer App, configure the WhatsApp product, and copy the Access Token and Phone Number ID."
  },
  sendgrid: {
    desc: "Send high-deliverability billing statement emails via Twilio SendGrid.",
    link: "https://sendgrid.com/docs",
    tip: "Create an API Key with 'Mail Send' scopes in the SendGrid console under Settings > API Keys."
  },
  twilio: {
    desc: "Send global transactional messages using Twilio's SMS APIs.",
    link: "https://console.twilio.com",
    tip: "Obtain your Account SID and Auth Token on the primary Twilio Console landing page. Assign a Twilio phone number."
  },
  stripe: {
    desc: "Accept international card payments and setup recurring billing.",
    link: "https://stripe.com/docs",
    tip: "Find API keys in Developers > API Keys. Generate a webhook signing secret under Webhooks to automate payment logs."
  },
  slack: {
    desc: "Post system alerts, status warnings, and notification cards directly to Slack.",
    link: "https://api.slack.com/messaging/webhooks",
    tip: "Activate Incoming Webhooks within your Slack Workspace App settings and copy the generated Webhook URL."
  },
  discord: {
    desc: "Forward backup updates, alerts, and system notifications to Discord.",
    link: "https://support.discord.com/hc/en-us/articles/228383668",
    tip: "Open target channel settings in Discord, select Integrations > Webhooks, create a webhook, and copy the URL."
  },
  smsleopard: {
    desc: "Send bulk notifications and SMS campaigns in East Africa.",
    link: "https://smsleopard.com",
    tip: "Generate your API key and sender signature from your SMSLeopard profile settings."
  },
  bulksms_kenya: {
    desc: "Send transactional alerts using BulkSMS Kenya gateways.",
    link: "https://www.bulksmskenya.co.ke",
    tip: "Access your API Key from the developer settings tab in your BulkSMS Kenya client portal."
  },
  nexmo: {
    desc: "Send international SMS notifications via Vonage API platform.",
    link: "https://dashboard.nexmo.com",
    tip: "Copy the API Key and API Secret from the top banner of your Vonage API dashboard."
  },
  mailgun: {
    desc: "Configure transactional email delivery and tracking via Mailgun.",
    link: "https://documentation.mailgun.com",
    tip: "Obtain your API key under API Keys in Settings. Verify your custom domain in the Sending section."
  },
  aws_ses: {
    desc: "Deploy email delivery using Amazon Simple Email Service.",
    link: "https://docs.aws.amazon.com/ses",
    tip: "Create an IAM User in AWS, grant 'AmazonSESFullAccess' privileges, and generate your API Access Keys."
  },
  mailchimp: {
    desc: "Sync payment subscribers to Mailchimp marketing lists.",
    link: "https://mailchimp.com/developer",
    tip: "Generate an API Key under Account > Extras > API Keys. Retrieve list IDs under Audience > Settings > Audience name."
  },
  telegram: {
    desc: "Send notifications and run system actions via a custom Telegram Bot.",
    link: "https://core.telegram.org/bots",
    tip: "Talk to BotFather on Telegram and send '/newbot' to register a bot and obtain your Bot Token."
  },
  google_cloud_storage: {
    desc: "Configure automated database and configuration backup storage to Google Cloud.",
    link: "https://cloud.google.com/storage/docs",
    tip: "Generate a Service Account key (JSON format) in GCP. Enter the project ID, bucket, and absolute key file path."
  },
  paypal: {
    desc: "Accept global payments via PayPal Checkout and recurring billing integrations.",
    link: "https://developer.paypal.com",
    tip: "Create a REST API app in the PayPal Developer Dashboard to get Client ID and Secret. Copy Webhook ID from the Webhooks section."
  },
  flutterwave: {
    desc: "Accept card and mobile money payments across Africa using Flutterwave.",
    link: "https://developer.flutterwave.com",
    tip: "Retrieve your Secret Key, Public Key, and Encryption Key from the API Settings section of the Flutterwave merchant dashboard."
  },
  airtel_money: {
    desc: "Accept Airtel Money STK push payments in Kenya, Uganda, Tanzania, Rwanda, and Zambia.",
    link: "https://developers.airtel.africa",
    tip: "Register at developers.airtel.africa → Create an App → Get Client ID and Client Secret. Set Country to your operating country (KE, UG, TZ, RW). Use 'sandbox' environment for testing.",
    icon: "📲",
    country_options: ["KE", "UG", "TZ", "RW", "ZM", "MW", "NG", "GH", "CD"],
    webhook: "/api/payments/airtel/callback"
  },
  mtn_momo: {
    desc: "Accept MTN Mobile Money payments in Uganda, Rwanda, Ghana, Cameroon, and Ivory Coast.",
    link: "https://momodeveloper.mtn.com",
    tip: "1. Sign up at momodeveloper.mtn.com\n2. Subscribe to 'Collection' product → get Subscription Key\n3. In sandbox: create API User via the portal UI, then generate API Key\n4. For production: submit a go-live request to MTN",
    icon: "📳",
    country_options: ["UG", "RW", "GH", "CM", "CI", "ZM"],
    webhook: "/api/payments/mtn/callback"
  },
  paystack: {
    desc: "Accept card payments, bank transfers, mobile money, and USSD across Africa via Paystack.",
    link: "https://dashboard.paystack.com",
    tip: "Get your Secret Key from dashboard.paystack.com → Settings → API Keys & Webhooks. Add Webhook URL: your-app.onrender.com/api/payments/paystack/webhook. Use 'sk_test_' keys for sandbox, 'sk_live_' for production.",
    icon: "💳",
    webhook: "/api/payments/paystack/webhook"
  },
  pesalink: {
    desc: "Receive Kenya bank-to-bank PesaLink transfers. Customers pay from their banking app to your account.",
    link: "https://www.pesalink.co.ke",
    tip: "Enter your ISP company bank account details. When a customer pays via PesaLink, they provide the transaction reference. An admin then confirms the payment manually in the billing system.",
    icon: "🏛️",
    note: "PesaLink is an interbank transfer rail — there is no STK push. Customers initiate from their own bank app."
  }
};

const formatFieldLabel = (key) => {
  const customLabels = {
    api_key: 'API Key',
    api_secret: 'API Secret',
    consumer_key: 'Consumer Key',
    consumer_secret: 'Consumer Secret',
    access_token: 'Access Token',
    verify_token: 'Verify Token',
    auth_token: 'Auth Token',
    passkey: 'Lipa Na M-Pesa Passkey',
    shortcode: 'Shortcode / Till Number',
    environment: 'Gateway Environment',
    webhook_url: 'Webhook URL',
    webhook_secret: 'Webhook Signing Secret',
    webhook_id: 'PayPal Webhook ID',
    secret_key: 'Secret Key',
    publishable_key: 'Publishable Key',
    public_key: 'Public Key',
    encryption_key: 'Encryption Key',
    client_id: 'Client ID',
    client_secret: 'Client Secret',
    currency: 'Billing Currency',
    channel: 'Slack Channel Name',
    phone_number_id: 'WhatsApp Phone Number ID',
    phone_number: 'Sender Phone Number',
    account_sid: 'Twilio Account SID',
    from_email: 'Sender Email Address',
    from_name: 'Sender Display Name',
    domain: 'Mailgun Sending Domain',
    access_key_id: 'AWS Access Key ID',
    secret_access_key: 'AWS Secret Access Key',
    region: 'AWS Region',
    list_id: 'Audience List ID',
    bot_token: 'Telegram Bot Token',
    project_id: 'Google Cloud Project ID',
    key_filename: 'Service Account JSON Key File Path',
    bucket_name: 'GCS Bucket Name',
    sender_id: 'Sender ID / Header Name',
    username: 'Account Username'
  };

  return customLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getFieldPlaceholder = (key) => {
  const placeholders = {
    api_key: 'e.g. atkey_b521...',
    api_secret: 'e.g. wj839dfj...',
    consumer_key: 'Enter consumer key',
    consumer_secret: 'Enter consumer secret',
    access_token: 'Enter access token',
    verify_token: 'Enter webhook verification token',
    auth_token: 'Enter Auth Token',
    account_sid: 'e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    passkey: 'e.g. bfb27a7bfb26a...',
    shortcode: 'Your assigned business shortcode',
    webhook_url: 'https://hooks.slack.com/services/...',
    webhook_secret: 'whsec_...',
    webhook_id: 'e.g. 8PT07EZVLHY5V',
    secret_key: 'e.g. sk_live_...',
    publishable_key: 'e.g. pk_live_...',
    public_key: 'e.g. FLWPUBK_TEST-...',
    encryption_key: 'Enter encryption key',
    client_id: 'e.g. AeA2eKD6...',
    client_secret: 'Enter client secret',
    channel: 'e.g. #alerts',
    phone_number_id: 'e.g. 10839459302194',
    phone_number: 'e.g. +14155552671',
    from_email: 'e.g. billing@myisp.com',
    from_name: 'e.g. Horizon ISP Support',
    domain: 'e.g. mail.myisp.com',
    access_key_id: 'e.g. AKIAIOSFODNN7EXAMPLE',
    secret_access_key: 'Enter AWS Secret Access Key',
    list_id: 'e.g. 9e67a05b32',
    bot_token: 'e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
    project_id: 'e.g. billing-gcs-backup',
    key_filename: 'e.g. /etc/gcs-credentials.json',
    bucket_name: 'e.g. isp-billing-backups',
    sender_id: 'e.g. BRANDNAME',
    username: 'e.g. sandbox or admin'
  };

  return placeholders[key] || `Enter ${key.replace(/_/g, ' ')}`;
};

export default function IntegrationsSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [showKeys, setShowKeys] = useState({});
  const [editingId, setEditingId] = useState(null);
  
  // Custom interface states
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [dirtyIds, setDirtyIds] = useState(new Set()); // track which integrations have unsaved changes
  
  const toast = useToast();

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/integrations`);
      setIntegrations(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      toast.error('Failed to load integrations');
      setLoading(false);
    }
  };

  const handleSave = async (integration) => {
    try {
      setSaving(true);
      const { data } = await axios.put(`${API_URL}/integrations/${integration.id}`, {
        config_data: integration.config_data,
        is_active: integration.is_active,
      });
      
      setIntegrations(prev => prev.map(i => i.id === integration.id ? data.integration : i));
      setEditingId(null);
      // Clear dirty flag for this integration
      setDirtyIds(prev => { const next = new Set(prev); next.delete(integration.id); return next; });
      toast.success(`${integration.display_name} saved successfully`);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save integration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (integration) => {
    try {
      setTesting(prev => ({ ...prev, [integration.id]: true }));
      const { data } = await axios.post(`${API_URL}/integrations/${integration.id}/test`);
      
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }

      fetchIntegrations(); // Refresh to get updated test status
    } catch (error) {
      console.error('Test error:', error);
      toast.error('Test connection failed');
    } finally {
      setTesting(prev => ({ ...prev, [integration.id]: false }));
    }
  };

  const toggleKey = (integrationId, key) => {
    setShowKeys(prev => ({ ...prev, [`${integrationId}_${key}`]: !prev[`${integrationId}_${key}`] }));
  };

  const isKeyVisible = (integrationId, key) => {
    return !!showKeys[`${integrationId}_${key}`];
  };

  const updateConfig = (integration, key, value) => {
    setIntegrations(prev => prev.map(i => 
      i.id === integration.id 
        ? { ...i, config_data: { ...i.config_data, [key]: value } }
        : i
    ));
    // Mark this integration as dirty (has unsaved changes)
    setDirtyIds(prev => new Set([...prev, integration.id]));
  };

  const toggleActive = async (integration) => {
    try {
      const nextActive = !integration.is_active;
      
      // Update locally first for visual response
      setIntegrations(prev => prev.map(i => 
        i.id === integration.id ? { ...i, is_active: nextActive } : i
      ));

      const { data } = await axios.put(`${API_URL}/integrations/${integration.id}`, {
        config_data: integration.config_data,
        is_active: nextActive,
      });
      
      setIntegrations(prev => prev.map(i => i.id === integration.id ? data.integration : i));
      toast.success(`${integration.display_name} is now ${nextActive ? 'Active' : 'Inactive'}`);
    } catch (error) {
      toast.error('Failed to toggle integration');
      // Revert local state
      fetchIntegrations();
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => {
      if (prev === id) return null; // collapse
      // Clear search so typing in config fields doesn't filter the list
      setSearchQuery('');
      return id;
    });
  };

  const isSensitiveKey = (key) => {
    const lowerKey = key.toLowerCase();
    return (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('passkey') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('password')
    ) && !lowerKey.includes('publishable') && !lowerKey.includes('access_key_id') && !lowerKey.includes('public_key');
  };

  const getTabCount = (tabId) => {
    if (tabId === 'all') return integrations.length;
    const tabObj = TABS.find(t => t.id === tabId);
    if (!tabObj) return 0;
    return integrations.filter(i => tabObj.categories.includes(i.category)).length;
  };

  const renderStatusBadge = (integration) => {
    if (!integration.is_active) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          Inactive
        </span>
      );
    }
    if (integration.last_test_status === 'success') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Connected
        </span>
      );
    }
    if (integration.last_test_status === 'failed') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          Failed
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Untested
      </span>
    );
  };

  const renderConfigField = (integration, key) => {
    const value = integration.config_data[key] || '';
    const label = formatFieldLabel(key);
    const placeholder = getFieldPlaceholder(key);

    if (key === 'environment') {
      return (
        <div key={key} className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            {label}
          </label>
          <select
            value={value}
            onChange={(e) => updateConfig(integration, key, e.target.value)}
            onFocus={() => setEditingId(integration.id)}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-all hover:bg-white/[0.05]"
          >
            <option value="sandbox" className="bg-[#10121a]">Sandbox / Development</option>
            <option value="live" className="bg-[#10121a]">Live / Production</option>
          </select>
        </div>
      );
    }

    if (key === 'currency') {
      return (
        <div key={key} className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            {label}
          </label>
          <select
            value={value}
            onChange={(e) => updateConfig(integration, key, e.target.value)}
            onFocus={() => setEditingId(integration.id)}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-all hover:bg-white/[0.05]"
          >
            <option value="KES" className="bg-[#10121a]">KES (KSh) - Kenyan Shilling</option>
            <option value="UGX" className="bg-[#10121a]">UGX (USh) - Ugandan Shilling</option>
            <option value="TZS" className="bg-[#10121a]">TZS (TSh) - Tanzanian Shilling</option>
            <option value="RWF" className="bg-[#10121a]">RWF (RF) - Rwandan Franc</option>
            <option value="GHS" className="bg-[#10121a]">GHS (GH₵) - Ghanaian Cedi</option>
            <option value="NGN" className="bg-[#10121a]">NGN (₦) - Nigerian Naira</option>
            <option value="ZAR" className="bg-[#10121a]">ZAR (R) - South African Rand</option>
            <option value="USD" className="bg-[#10121a]">USD ($) - US Dollar</option>
            <option value="EUR" className="bg-[#10121a]">EUR (€) - Euro</option>
            <option value="GBP" className="bg-[#10121a]">GBP (£) - British Pound</option>
            <option value="usd" className="bg-[#10121a]">usd - US Dollar (legacy)</option>
            <option value="kes" className="bg-[#10121a]">kes - Kenyan Shilling (legacy)</option>
          </select>
        </div>
      );
    }

    if (key === 'country') {
      const countryOptions = [
        { code: 'KE', name: 'Kenya' }, { code: 'UG', name: 'Uganda' },
        { code: 'TZ', name: 'Tanzania' }, { code: 'RW', name: 'Rwanda' },
        { code: 'GH', name: 'Ghana' }, { code: 'ZM', name: 'Zambia' },
        { code: 'NG', name: 'Nigeria' }, { code: 'CM', name: 'Cameroon' },
        { code: 'CI', name: "Côte d'Ivoire" }, { code: 'MW', name: 'Malawi' },
        { code: 'CD', name: 'DR Congo' }, { code: 'BJ', name: 'Benin' },
        { code: 'GA', name: 'Gabon' },
      ];
      return (
        <div key={key} className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            Country of Operation
          </label>
          <select
            value={value}
            onChange={(e) => updateConfig(integration, key, e.target.value)}
            onFocus={() => setEditingId(integration.id)}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-all hover:bg-white/[0.05]"
          >
            {countryOptions.map(c => (
              <option key={c.code} value={c.code} className="bg-[#10121a]">{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
      );
    }

    if (key === 'region') {
      return (
        <div key={key} className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            {label}
          </label>
          <select
            value={value}
            onChange={(e) => updateConfig(integration, key, e.target.value)}
            onFocus={() => setEditingId(integration.id)}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-all hover:bg-white/[0.05]"
          >
            <option value="us-east-1" className="bg-[#10121a]">us-east-1 (N. Virginia)</option>
            <option value="us-west-2" className="bg-[#10121a]">us-west-2 (Oregon)</option>
            <option value="eu-west-1" className="bg-[#10121a]">eu-west-1 (Ireland)</option>
            <option value="eu-central-1" className="bg-[#10121a]">eu-central-1 (Frankfurt)</option>
            <option value="ap-southeast-1" className="bg-[#10121a]">ap-southeast-1 (Singapore)</option>
            <option value="ap-southeast-2" className="bg-[#10121a]">ap-southeast-2 (Sydney)</option>
          </select>
        </div>
      );
    }

    const isSensitive = isSensitiveKey(key);
    const isVisible = isKeyVisible(integration.id, key);

    return (
      <div key={key} className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          {isSensitive ? (
            <Lock className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Settings2 className="w-3.5 h-3.5 text-gray-400" />
          )}
          {label}
        </label>
        <div className="relative">
          <input
            type={isSensitive && !isVisible ? 'password' : 'text'}
            value={value}
            onChange={(e) => updateConfig(integration, key, e.target.value)}
            onFocus={() => setEditingId(integration.id)}
            className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder={placeholder}
          />
          {isSensitive && (
            <button
              type="button"
              onClick={() => toggleKey(integration.id, key)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              {isVisible ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-medium tracking-wide">Syncing Integrations settings...</p>
        </div>
      </div>
    );
  }

  // Filter logic
  const filteredIntegrations = integrations.filter(i => {
    const activeTabObj = TABS.find(t => t.id === activeTab);
    const matchesCategory = activeTabObj ? activeTabObj.categories.includes(i.category) : true;
    
    const matchesSearch = searchQuery === '' || 
      i.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.category.toLowerCase().includes(searchQuery.toLowerCase());
      
    return matchesCategory && matchesSearch;
  });

  const totalCount = integrations.length;
  const activeCount = integrations.filter(i => i.is_active).length;
  const connectedCount = integrations.filter(i => i.is_active && i.last_test_status === 'success').length;
  const issuesCount = integrations.filter(i => i.is_active && i.last_test_status === 'failed').length;

  return (
    <div className="bg-[#0f111a] text-white p-6 md:p-8 relative overflow-x-hidden">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-500 animate-spin-slow" />
              Integrations Settings
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Configure SMS gateways, payment platforms, webhooks, and storage services.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#151821]/30 border border-white/[0.05] rounded-2xl p-5 backdrop-blur-md flex items-center justify-between shadow-xl">
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Services</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalCount}</h3>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#151821]/30 border border-white/[0.05] rounded-2xl p-5 backdrop-blur-md flex items-center justify-between shadow-xl">
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Active Integrations</p>
              <h3 className="text-2xl font-bold text-white mt-1">{activeCount}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <div className="bg-[#151821]/30 border border-white/[0.05] rounded-2xl p-5 backdrop-blur-md flex items-center justify-between shadow-xl">
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Connected</p>
              <h3 className="text-2xl font-bold text-white mt-1">{connectedCount}</h3>
            </div>
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#151821]/30 border border-white/[0.05] rounded-2xl p-5 backdrop-blur-md flex items-center justify-between shadow-xl">
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Issues / Untested</p>
              <h3 className="text-2xl font-bold text-white mt-1">{issuesCount}</h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-[#12141d]/40 p-2.5 border border-white/[0.04] rounded-2xl backdrop-blur-md">
          {/* Scrollable Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-full">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const count = getTabCount(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setExpandedId(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                    isActive 
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.02] border border-transparent'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-md text-3xs font-bold ${
                    isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-gray-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search box - locked while a card is expanded to prevent accidental filtering */}
          <div className="relative flex-grow lg:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder={expandedId ? 'Close card to search...' : 'Search integration services...'}
              value={searchQuery}
              onChange={(e) => { if (!expandedId) setSearchQuery(e.target.value); }}
              readOnly={!!expandedId}
              className={`w-full pl-10 pr-4 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl text-white placeholder-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                expandedId ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>

        {/* Grid-based integrations lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredIntegrations.map(integration => {
            const Icon = categoryIcons[integration.category] || Settings;
            const isExpanded = expandedId === integration.id;
            const isEditing = editingId === integration.id;
            const isTesting = testing[integration.id];
            const configKeys = Object.keys(integration.config_data || {});
            const docs = serviceDocs[integration.service_name] || { desc: `Configure settings for ${integration.display_name}.`, link: '#', tip: '' };

            return (
              <div 
                key={integration.id}
                className={`bg-[#151821]/30 border border-white/[0.05] rounded-2xl overflow-hidden transition-all duration-300 backdrop-blur-lg flex flex-col ${
                  isExpanded 
                    ? 'ring-1 ring-blue-500/30 border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.05)] md:col-span-2 xl:col-span-3' 
                    : 'hover:border-white/[0.1] hover:bg-[#151821]/50'
                }`}
              >
                {/* Card Header Info */}
                <div className="p-5 flex items-start justify-between gap-4 border-b border-white/[0.04]">
                  <div className="flex items-center gap-4">
                    {/* Glow icon */}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${categoryColors[integration.category] || 'from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400'} border flex items-center justify-center shadow-lg ${categoryGlows[integration.category] || ''}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                        {integration.display_name}
                      </h3>
                      <p className="text-2xs text-gray-500 uppercase tracking-wider font-semibold mt-0.5">
                        {integration.category}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleActive(integration)}
                      title={integration.is_active ? 'Deactivate service' : 'Activate service'}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        integration.is_active ? 'bg-emerald-500' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          integration.is_active ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                {/* Card Summary Panel */}
                <div className="px-5 py-4 flex-grow flex flex-col justify-between gap-4 font-medium">
                  <div>
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {docs.desc}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    {/* Connection Status Indicator */}
                    {renderStatusBadge(integration)}

                    {/* Configure Toggle Trigger */}
                    <button
                      onClick={() => toggleExpand(integration.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.1] rounded-xl text-xs font-semibold text-gray-300 transition-all ${
                        isExpanded ? 'text-blue-400 border-blue-500/20 bg-blue-500/5' : ''
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configure
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>
                {/* Card Configuration Panel */}
                {isExpanded && (
                  <div className="border-t border-white/[0.04] bg-white/[0.01] p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">
                    
                    {/* Config Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {configKeys.map(key => renderConfigField(integration, key))}
                    </div>

                    {/* Connection Message Banner */}
                    {integration.last_test_message && (
                      <div className={`p-3.5 rounded-xl flex items-start gap-2.5 text-xs ${
                        integration.last_test_status === 'success'
                          ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-300'
                          : 'bg-rose-500/5 border border-rose-500/10 text-rose-300'
                      }`}>
                        {integration.last_test_status === 'success' ? (
                          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
                        )}
                        <div className="leading-normal">
                          <span className="font-semibold">{integration.last_test_status === 'success' ? 'Connected: ' : 'Configuration Issue: '}</span>
                          {integration.last_test_message}
                        </div>
                      </div>
                    )}

                    {/* Help Tip */}
                    {docs.tip && (
                      <div className="p-3.5 bg-blue-500/5 border border-blue-500/10 text-blue-200 rounded-xl flex items-start gap-2.5 text-xs leading-normal">
                        <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                        <div>
                          <span className="font-semibold text-blue-300">Integration Tip: </span>
                          {docs.tip}
                          {docs.link !== '#' && (
                            <a 
                              href={docs.link} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 hover:underline font-semibold ml-1.5"
                            >
                              Official Docs <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action panel */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
                      {/* Test Connection Button */}
                      <button
                        onClick={() => handleTest(integration)}
                        disabled={isTesting}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <TestTube2 className="w-3.5 h-3.5" />
                        )}
                        Test Connection
                      </button>

                      {/* Save Settings Button - enabled whenever the card has been edited */}
                      <button
                        onClick={() => handleSave(integration)}
                        disabled={saving}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/15 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save Configuration
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty Search/Tab State */}
        {filteredIntegrations.length === 0 && (
          <div className="text-center py-20 bg-[#151821]/20 border border-white/[0.04] rounded-2xl backdrop-blur-md">
            <Settings className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-1">No Integrations Found</h3>
            <p className="text-sm text-gray-400">
              {searchQuery ? `No matches found for "${searchQuery}"` : 'No services configured in this category.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
