import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Activity, AlertTriangle, Check, CheckCircle2, Clock3, Globe, Plus, RefreshCw, Router, Shield, Trash2, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/useToast";

const API = import.meta.env.VITE_API_URL || "/api";
const tabs = ["Overview", "Blocklists", "Routers", "Customer policies", "Exceptions", "Logs"];
const shortDate = (value) => value ? new Date(value).toLocaleString() : "Never";

function Metric({ icon: Icon, label, value, detail, tone = "blue" }) {
  return <div className="dns-metric"><span className={`dns-metric-icon tone-${tone}`}><Icon size={17} /></span><div><span className="dns-label">{label}</span><strong>{Number(value || 0).toLocaleString()}</strong><small>{detail}</small></div></div>;
}
function Status({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  const tone = ["synced", "success", "active", "compatible"].includes(normalized) ? "success" : ["failed", "unreachable", "unsupported"].includes(normalized) ? "danger" : "muted";
  return <span className={`dns-status ${tone}`}>{normalized}</span>;
}

export function DNSAdblockPage() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [sources, setSources] = useState([]);
  const [routers, setRouters] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [domains, setDomains] = useState([]);
  const [groups, setGroups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState(null);
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", domain_limit: "100000" });
  const [domainForm, setDomainForm] = useState({ domain: "", list_type: "allow", note: "" });
  const [policyForm, setPolicyForm] = useState({ customer_id: "", router_config_id: "", access_type: "pppoe", username: "", self_service_allowed: false, group_id: "" });
  const [groupForm, setGroupForm] = useState({ name: "", default_blocking: true, self_service_allowed: false });
  const [routerSettings, setRouterSettings] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, sourceRows, routerRows, policyRows, customerRows, domainRows, groupRows, logRows] = await Promise.all([
        axios.get(`${API}/dns-adblock/overview`), axios.get(`${API}/dns-adblock/sources`), axios.get(`${API}/dns-adblock/routers`),
        axios.get(`${API}/dns-adblock/policies`), axios.get(`${API}/dns-adblock/customers`), axios.get(`${API}/dns-adblock/domains`),
        axios.get(`${API}/dns-adblock/groups`), axios.get(`${API}/dns-adblock/logs?limit=100`),
      ]);
      setDashboard(overview.data || {}); setSources(sourceRows.data || []); setRouters(routerRows.data || []);
      setPolicies(policyRows.data || []); setCustomers(customerRows.data || []); setDomains(domainRows.data || []);
      setGroups(groupRows.data || []); setLogs(logRows.data || []);
      setRouterSettings(Object.fromEntries((routerRows.data || []).map(r => [r.config_id || r.connection_id, r])));
      setPolicyForm(v => ({ ...v, router_config_id: v.router_config_id || routerRows.data?.find(r => r.enabled)?.id || "" }));
    } catch (error) { toastRef.current.error("Could not load DNS Ad-Blocker", error.response?.data?.error || error.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function action(key, fn, message) {
    setBusy(key);
    try { const result = await fn(); if (message) toast.success(message); await load(); return result; }
    catch (error) { toast.error("DNS Ad-Blocker action failed", error.response?.data?.error || error.message); return null; }
    finally { setBusy(""); }
  }
  async function addSource(event) {
    event.preventDefault();
    const result = await action("source", () => axios.post(`${API}/dns-adblock/sources`, { ...sourceForm, domain_limit: Number(sourceForm.domain_limit) }), "Blocklist source added");
    if (result) setSourceForm({ name: "", url: "", domain_limit: "100000" });
  }
  async function addDomain(event) {
    event.preventDefault();
    const result = await action("domain", () => axios.post(`${API}/dns-adblock/domains`, domainForm), "Domain exception saved");
    if (result) setDomainForm({ domain: "", list_type: "allow", note: "" });
  }
  async function addPolicy(event) {
    event.preventDefault();
    const result = await action("policy", () => axios.post(`${API}/dns-adblock/policies`, { ...policyForm, enabled: true, group_id: policyForm.group_id || null }), "Customer policy assigned");
    if (result) setPolicyForm(v => ({ ...v, username: "", customer_id: "", self_service_allowed: false }));
  }
  async function addGroup(event) {
    event.preventDefault();
    const result = await action("group", () => axios.post(`${API}/dns-adblock/groups`, groupForm), "Policy group created");
    if (result) setGroupForm({ name: "", default_blocking: true, self_service_allowed: false });
  }
  async function discoverRouter(connectionId){const result=await action(`discover-${connectionId}`,()=>axios.post(`${API}/dns-adblock/routers/${connectionId}/discover`),"Router capabilities checked");if(result&&!result.data?.config_id)await action(`router-${connectionId}`,()=>axios.put(`${API}/dns-adblock/routers/${connectionId}`,{enabled:false,network_wide:true,enforce_dns:true,block_dot:false,enforce_ipv6:false,lan_interface_list:"LAN",wan_interface_list:"WAN",protected_ipv4_subnets:"",protected_ipv6_prefixes:"",domain_limit:200000}),"Router DNS profile created; configure its protected subnets before enabling");}
  async function syncRouter(id) { await action(`sync-${id}`, () => axios.post(`${API}/dns-adblock/routers/${id}/sync`), "Router DNS policy synchronized"); }
  async function saveRouter(connectionId, enabled, configId) {
    const current = routerSettings[configId || connectionId] || {};
    await action(`router-${connectionId}`, () => axios.put(`${API}/dns-adblock/routers/${connectionId}`, {
      enabled, network_wide: current.network_wide !== false, enforce_dns: current.enforce_dns !== false,
      block_dot: Boolean(current.block_dot), enforce_ipv6: Boolean(current.enforce_ipv6),
      lan_interface_list: current.lan_interface_list || "LAN", wan_interface_list: current.wan_interface_list || "WAN",
      protected_ipv4_subnets: current.protected_ipv4_subnets || "", protected_ipv6_prefixes: current.protected_ipv6_prefixes || "",
      domain_limit: Number(current.domain_limit || 200000),
    }), enabled ? "Router filtering enabled" : "Router settings saved");
  }
  async function togglePolicy(policy) { await action(`policy-${policy.id}`, () => axios.put(`${API}/dns-adblock/policies/${policy.id}`, { enabled: !policy.enabled }), "Customer policy updated"); }
  async function toggleSource(source) { await action(`source-${source.id}`, () => axios.put(`${API}/dns-adblock/sources/${source.id}`, { enabled: !source.enabled }), "Blocklist source updated"); }
  async function showHistory(source) { try { const { data } = await axios.get(`${API}/dns-adblock/sources/${source.id}/history`); setHistory({ source, rows: data || [] }); } catch (e) { toast.error("Could not load source history", e.response?.data?.error || e.message); } }

  const managedRouterFor = (customer) => customer.router_config_id || routers.find(r => r.connection_id === customer.connection_id)?.id || "";
  const assignCustomer = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    const configId = customer?.router_config_id && routers.find(r => r.id === customer.router_config_id)?.enabled ? customer.router_config_id : "";
    const access = customer?.pppoe_username ? "pppoe" : "hotspot";
    setPolicyForm(v => ({ ...v, customer_id: customerId, router_config_id: configId, access_type: access, username: access === "pppoe" ? customer?.pppoe_username || "" : customer?.hotspot_username || "" }));
  };

  return (
    <main className="dns-page">
      <header className="dns-header">
        <div><p className="dns-eyebrow">NETWORK SERVICES / DNS</p><h1>DNS Ad-Blocker</h1><p>Manage DNS filtering, subscriber policies, and MikroTik synchronization.</p></div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
      </header>
      <nav className="dns-tabs" aria-label="DNS Ad-Blocker sections">{tabs.map(item => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {loading ? <div className="dns-empty">Loading DNS policy data…</div> : <>
        {tab === "Overview" && <>
          <section className="dns-metrics-grid">
            <Metric icon={Globe} label="Downloaded domains" value={dashboard.source_domains} detail="Validated from enabled source lists" tone="blue" />
            <Metric icon={Shield} label="Active Adlist domains" value={dashboard.active_domains} detail={`${dashboard.active_blocklists || 0} active router Adlists`} tone="purple" />
            <Metric icon={Router} label="Managed routers" value={dashboard.managed} detail={`${dashboard.synced || 0} synchronized`} tone="cyan" />
            <Metric icon={XCircle} label="Sync issues" value={dashboard.failed} detail={`${dashboard.customers_enabled || 0} subscriber policies enabled`} tone="amber" />
          </section>
          {!dashboard.synced && <section className="dns-caution"><AlertTriangle size={15}/><span>No router Adlist is confirmed active. Downloaded blocklist domains are not currently being enforced by a router.</span></section>}
          <section className="dns-panel dns-last-update"><Clock3 size={18} /><span>Last successful source update</span><strong>{shortDate(dashboard.last_successful_update)}</strong><span className="dns-spacer"/><Status value={dashboard.failed ? "failed" : dashboard.synced ? "synced" : "not active"}/></section>
          <section className="dns-panel"><div className="dns-panel-heading"><div><h2>Recent synchronization activity</h2><p>Router deployment and recovery history</p></div><button onClick={() => setTab("Logs")}>View logs</button></div><Logs rows={dashboard.logs || []}/></section>
        </>}
        {tab === "Blocklists" && <section className="dns-two-col">
          <div className="dns-panel"><div className="dns-panel-heading"><div><h2>Sources</h2><p>StevenBlack is enabled by default; approved HTTPS hosts only.</p></div><Button variant="outline" onClick={() => action("refresh", () => axios.post(`${API}/dns-adblock/refresh`), "Blocklists refreshed and routers synchronized")} disabled={!!busy}><RefreshCw size={14}/> Refresh now</Button></div>
            <div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Source</th><th>Domains</th><th>Last success</th><th>State</th><th>Actions</th></tr></thead><tbody>{sources.map(source=><tr key={source.id}><td><strong>{source.name}</strong><small>{source.url}</small>{source.last_error&&<small className="dns-error-text">{source.last_error}</small>}</td><td>{Number(source.domain_count||0).toLocaleString()}</td><td>{shortDate(source.last_successful_at)}</td><td><Status value={source.enabled?"active":"disabled"}/></td><td><div className="dns-row-actions"><button onClick={()=>toggleSource(source)}>{source.enabled?"Disable":"Enable"}</button><button onClick={()=>showHistory(source)}>History</button><button className="danger" onClick={()=>action(`delete-source-${source.id}`,()=>axios.delete(`${API}/dns-adblock/sources/${source.id}`),"Source removed") }><Trash2 size={14}/></button></div></td></tr>)}</tbody></table></div>
            <form className="dns-inline-form" onSubmit={addSource}><Input placeholder="Source name" value={sourceForm.name} onChange={e=>setSourceForm({...sourceForm,name:e.target.value})} required/><Input placeholder="https://approved-host/path/hosts" value={sourceForm.url} onChange={e=>setSourceForm({...sourceForm,url:e.target.value})} required/><Input type="number" min="1" max="250000" value={sourceForm.domain_limit} onChange={e=>setSourceForm({...sourceForm,domain_limit:e.target.value})} aria-label="Maximum domains"/><Button type="submit" disabled={!!busy}><Plus size={15}/> Add source</Button></form>
          </div>
          <div className="dns-panel"><h2>Source rules</h2><ul className="dns-notes"><li>Downloads must use HTTPS and a host allowlist.</li><li>Hosts files are normalized, validated, de-duplicated and capped.</li><li>Failed or empty downloads leave the current active version unchanged.</li><li>Router feeds require a public HTTPS application URL and a stable feed secret.</li></ul></div>
        </section>}
        {tab === "Routers" && <section className="dns-panel"><div className="dns-panel-heading"><div><h2>MikroTik routers</h2><p>RouterOS native DNS Adlist requires the configured minimum version and space/cache capacity.</p></div></div>
          {routers.length===0?<div className="dns-empty">No routers have an active DNS filter yet. Choose a router and set its protected LAN IPv4 subnets.</div>:<div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Router</th><th>Management IP</th><th>RouterOS / model</th><th>Adlist compatibility</th><th>Status</th><th>Last sync</th><th>Controls</th></tr></thead><tbody>{routers.map(router=><tr key={router.id}><td><strong>{router.router_name}</strong><small>{router.is_online?"Reachable":"Offline/unknown"}</small></td><td>{router.router_ip}</td><td>{router.routeros_version||"Not checked"}<small>{router.hardware_model||"Model not detected"}</small></td><td><Status value={router.compatibility}/></td><td><Status value={router.last_sync_status}/>{router.last_sync_error&&<small className="dns-error-text">{router.last_sync_error}</small>}</td><td>{shortDate(router.last_successful_sync)}</td><td><div className="dns-row-actions"><button onClick={()=>router.config_id?action(`check-${router.id}`,()=>axios.post(`${API}/dns-adblock/routers/${router.config_id}/check`),"Router capabilities checked"):discoverRouter(router.connection_id)} disabled={!!busy}>Check / discover</button><button onClick={()=>syncRouter(router.config_id)} disabled={!!busy||!router.enabled||!router.config_id}>Sync</button><button onClick={()=>saveRouter(router.connection_id,true,router.config_id||router.connection_id)} disabled={!!busy}>{router.enabled?"Save":"Enable"}</button></div></td></tr>)}</tbody></table></div>}
          <h3 className="dns-subheading">Router configuration</h3>
          <div className="dns-router-configs">{routers.map(router=>{const key=router.config_id||router.connection_id;const cfg=routerSettings[key]||router;return <article className="dns-router-config" key={`settings-${router.id}`}><strong>{router.router_name}</strong><label>LAN interface list<Input value={cfg.lan_interface_list||"LAN"} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,lan_interface_list:e.target.value}})}/></label><label>WAN interface list<Input value={cfg.wan_interface_list||"WAN"} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,wan_interface_list:e.target.value}})}/></label><label>Protected IPv4 subnets (comma separated)<Input placeholder="10.10.0.0/16,192.168.0.0/16" value={cfg.protected_ipv4_subnets||""} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,protected_ipv4_subnets:e.target.value}})}/></label><label>Protected IPv6 prefixes (optional)<Input placeholder="2001:db8:1234::/48" value={cfg.protected_ipv6_prefixes||""} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,protected_ipv6_prefixes:e.target.value}})}/></label><div className="dns-config-checks"><label><input type="checkbox" checked={cfg.network_wide!==false} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,network_wide:e.target.checked}})}/> Network-wide blocking</label><label><input type="checkbox" checked={Boolean(cfg.block_dot)} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,block_dot:e.target.checked}})}/> Block DNS-over-TLS (853)</label><label><input type="checkbox" checked={Boolean(cfg.enforce_ipv6)} onChange={e=>setRouterSettings({...routerSettings,[key]:{...cfg,enforce_ipv6:e.target.checked}})}/> Enforce IPv6 (requires explicit prefixes)</label></div><Button variant="outline" onClick={()=>saveRouter(router.connection_id,true,router.config_id||router.connection_id)} disabled={!!busy}>{router.enabled?"Save router settings":"Enable & save"}</Button><Button variant="outline" onClick={()=>action(`disable-${router.id}`,()=>axios.post(`${API}/dns-adblock/routers/${router.config_id}/disable`),"Filtering disabled and managed rules removed")} disabled={!!busy||!router.enabled||!router.config_id}>Disable safely</Button></article>})}</div>
          <p className="dns-caution"><AlertTriangle size={15}/> DNS-over-HTTPS uses HTTPS and cannot be safely blocked with generic IP lists; no broad HTTPS/cloud ranges are filtered. Legacy RouterOS or public cleartext management endpoints are refused.</p>
        </section>}
        {tab === "Customer policies" && <section className="dns-panel"><div className="dns-panel-heading"><div><h2>Customer policies</h2><p>Per-subscriber control requires active PPPoE/Hotspot identities and router-provided session IPs.</p></div></div>
          <form className="dns-policy-form" onSubmit={addPolicy}><label>Subscriber<select value={policyForm.customer_id} onChange={e=>assignCustomer(e.target.value)} required><option value="">Select active subscriber</option>{customers.map((c,i)=><option value={c.id} key={`${c.id}-${c.connection_id}-${c.pppoe_username||c.hotspot_username||i}`}>{c.name} · {c.pppoe_username?`PPPoE ${c.pppoe_username}`:`Hotspot ${c.hotspot_username||"username needed"}`} · {c.router_name}</option>)}</select></label><label>Access type<select value={policyForm.access_type} onChange={e=>setPolicyForm({...policyForm,access_type:e.target.value,username:""})}><option value="pppoe">PPPoE</option><option value="hotspot">Hotspot</option></select></label><label>Subscriber username<Input value={policyForm.username} onChange={e=>setPolicyForm({...policyForm,username:e.target.value})} required/></label><label>Managed router<select value={policyForm.router_config_id} onChange={e=>setPolicyForm({...policyForm,router_config_id:e.target.value})} required><option value="">Select router</option>{routers.filter(r=>r.enabled).map(r=><option value={r.id} key={r.id}>{r.router_name}</option>)}</select></label><label>Policy group<select value={policyForm.group_id} onChange={e=>setPolicyForm({...policyForm,group_id:e.target.value})}><option value="">Default policy</option>{groups.map(g=><option value={g.id} key={g.id}>{g.name} · {g.default_blocking?"blocked":"opt-out"}</option>)}</select></label><label className="dns-checkbox"><input type="checkbox" checked={policyForm.self_service_allowed} onChange={e=>setPolicyForm({...policyForm,self_service_allowed:e.target.checked})}/> Allow customer portal self-service</label><Button type="submit" disabled={!!busy}><Plus size={15}/> Add policy</Button></form>
          <div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Customer</th><th>Access / username</th><th>Router / group</th><th>Blocking</th><th>Self-service</th><th>Actions</th></tr></thead><tbody>{policies.map(p=><tr key={p.id}><td>{p.customer_name}</td><td>{p.access_type}<small>{p.username}</small></td><td>{p.router_name}<small>{p.group_name||"Default group"}</small></td><td><Status value={p.enabled?"enabled":"disabled"}/></td><td>{p.self_service_allowed?"Allowed":"Admin only"}</td><td><button className="dns-text-action" disabled={!!busy} onClick={()=>togglePolicy(p)}>{p.enabled?"Opt out":"Enable blocking"}</button></td></tr>)}</tbody></table></div>
          <form className="dns-inline-form dns-group-form" onSubmit={addGroup}><Input placeholder="New policy group name" value={groupForm.name} onChange={e=>setGroupForm({...groupForm,name:e.target.value})} required/><label><input type="checkbox" checked={groupForm.default_blocking} onChange={e=>setGroupForm({...groupForm,default_blocking:e.target.checked})}/> Block by default</label><label><input type="checkbox" checked={groupForm.self_service_allowed} onChange={e=>setGroupForm({...groupForm,self_service_allowed:e.target.checked})}/> Portal may opt out</label><Button type="submit" variant="outline" disabled={!!busy}><Plus size={14}/> Create group</Button></form>
        </section>}
        {tab === "Exceptions" && <section className="dns-panel"><div className="dns-panel-heading"><div><h2>Allowlist and denylist</h2><p>Allow entries take precedence over block sources; explicit deny entries are added to the generated hosts feed.</p></div></div><form className="dns-inline-form" onSubmit={addDomain}><Input placeholder="ads.example.com" value={domainForm.domain} onChange={e=>setDomainForm({...domainForm,domain:e.target.value})} required/><select value={domainForm.list_type} onChange={e=>setDomainForm({...domainForm,list_type:e.target.value})}><option value="allow">Allow</option><option value="deny">Deny</option></select><Input placeholder="Optional note" value={domainForm.note} onChange={e=>setDomainForm({...domainForm,note:e.target.value})}/><Button type="submit" disabled={!!busy}><Plus size={14}/> Add domain</Button></form><div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Domain</th><th>List</th><th>Note</th><th>State</th><th></th></tr></thead><tbody>{domains.map(d=><tr key={d.id}><td><strong>{d.domain}</strong></td><td>{d.list_type}</td><td>{d.note||"—"}</td><td><Status value={d.enabled?"active":"disabled"}/></td><td><button className="dns-row-delete" onClick={()=>action(`delete-domain-${d.id}`,()=>axios.delete(`${API}/dns-adblock/domains/${d.id}`),"Domain removed")}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>}
        {tab === "Logs" && <section className="dns-panel"><div className="dns-panel-heading"><div><h2>Synchronization logs</h2><p>Last 100 configuration, update, verification, and recovery events.</p></div></div><Logs rows={logs}/></section>}
      </>}
      {history&&<div className="dns-modal-backdrop" onClick={()=>setHistory(null)}><section className="dns-panel dns-history-modal" onClick={e=>e.stopPropagation()}><div className="dns-panel-heading"><div><h2>{history.source.name} history</h2><p>Last 100 source validation attempts.</p></div><button onClick={()=>setHistory(null)} aria-label="Close history"><X size={18}/></button></div><SourceHistory rows={history.rows} sourceUrl={history.source.url}/></section></div>}
    </main>
  );
}

function Logs({rows}) { return <div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Router</th><th>Operation</th><th>Status</th><th>Time</th><th>Details</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.id}><td>{row.router_name||"Blocklist service"}</td><td>{row.operation}</td><td><Status value={row.status}/></td><td>{shortDate(row.created_at)}</td><td>{row.message||"—"}</td></tr>):<tr><td colSpan="5" className="dns-no-rows">No synchronization events recorded.</td></tr>}</tbody></table></div>; }
function SourceHistory({rows,sourceUrl}) { let host=""; try { host=new URL(sourceUrl).hostname; } catch {} return <div className="dns-table-wrap"><table className="dns-table"><thead><tr><th>Status</th><th>Domains</th><th>Invalid removed</th><th>HTTP</th><th>Time</th><th>Message</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.id}><td><Status value={r.status}/></td><td>{r.domain_count??"—"}</td><td>{r.invalid_count??"—"}</td><td>{r.http_status??"—"}</td><td>{shortDate(r.created_at)}</td><td>{r.message?.includes("undefined")&&host?`Validated from ${host}`:r.message||"—"}</td></tr>):<tr><td colSpan="6" className="dns-no-rows">No source history yet.</td></tr>}</tbody></table></div>; }
