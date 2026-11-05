const axios = require("axios");
const crypto = require("crypto");
const net = require("net");
const routerConnectionManager = require("./routerConnectionManager");

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_FEED = "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts";
const MAX_DOMAINS = Math.min(500000, Math.max(1, Number(process.env.DNS_ADBLOCK_MAX_DOMAINS) || 250000));
const MAX_BYTES = Math.min(100 * 1024 * 1024, Math.max(1024, Number(process.env.DNS_ADBLOCK_MAX_SOURCE_BYTES) || 30 * 1024 * 1024));
const MANAGED = "IKIYY-DNS-ADBLOCK-MANAGED";
const MIN_ROUTEROS = process.env.DNS_ADBLOCK_MIN_ROUTEROS || "7.15";
const ALLOWED_HOSTS = new Set(["raw.githubusercontent.com", "raw.github.com", ...(process.env.DNS_ADBLOCK_ALLOWED_HOSTS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)]);
function db() { return global.db || require("../db/memory"); }
function tenant(req) { return req?.tenantId || req?.user?.tenant_id || DEFAULT_TENANT; }
function safeDomain(value) {
  const domain = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > 253 || domain.includes("*") || domain.includes("/") || domain.includes("@") || net.isIP(domain)) return null;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ? domain : null;
}
function parseHosts(text, limit = MAX_DOMAINS) {
  const domains = new Set(); let invalid = 0; let lines = 0;
  for (const row of String(text || "").split(/\r?\n/)) {
    if (++lines > 1500000) break;
    const line = row.trim(); if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const candidates = parts.length > 1 && (net.isIP(parts[0]) || parts[0] === "0.0.0.0") ? parts.slice(1) : [parts[0]];
    for (const candidate of candidates) {
      if (candidate.startsWith("#")) break;
      const domain = safeDomain(candidate);
      if (!domain) { invalid++; continue; }
      domains.add(domain);
      if (domains.size > Math.min(limit, MAX_DOMAINS)) throw new Error(`Blocklist exceeds domain cap (${Math.min(limit, MAX_DOMAINS)})`);
    }
  }
  return { domains: [...domains].sort(), invalid };
}
function validateSource(raw) {
  let url; try { url = new URL(String(raw || "")); } catch { throw Object.assign(new Error("Source URL must be a valid HTTPS URL"), { status: 400 }); }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || (url.port && url.port !== "443")) {
    throw Object.assign(new Error("HTTPS blocklist host is not approved. Set DNS_ADBLOCK_ALLOWED_HOSTS to trusted hostnames."), { status: 400 });
  }
  return url.toString();
}
function makeFeedBody(domains) { return `# IKIYY NETWORKS managed DNS filter\n${domains.map(d => `0.0.0.0 ${d}`).join("\n")}\n`; }
function digest(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function feedSecret(id) { const secret = process.env.DNS_ADBLOCK_FEED_SECRET || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET; if (!secret || String(secret).length < 32) throw new Error("Set a stable DNS_ADBLOCK_FEED_SECRET (at least 32 characters) before publishing managed feeds"); return crypto.createHmac("sha256", secret).update(String(id)).digest("hex"); }
function secureEq(a, b) { const x=Buffer.from(String(a||"")); const y=Buffer.from(String(b||"")); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function rows(value) { return Array.isArray(value) ? value : value?.rows || []; }
function esc(s) { return String(s).replace(/([\\"$`])/g,"\\$1"); }
function minVersion(version, required) {
  const a=String(version||"").match(/^(\d+(?:\.\d+){1,3})/); const b=String(required||"").match(/^(\d+(?:\.\d+){1,3})/);
  if(!a||!b)return false; const aa=a[1].split(".").map(Number),bb=b[1].split(".").map(Number);
  for(let i=0;i<4;i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0);}return true;
}
function tenantDb(req) { return tenant(req); }

async function ensureDefaultSource(tid) {
  return db().query(`INSERT INTO dns_adblock_sources (tenant_id,name,url,enabled,domain_limit)
    VALUES ($1,'StevenBlack Unified Hosts',$2,true,$3) ON CONFLICT (tenant_id,url) DO NOTHING`,[tid,DEFAULT_FEED,Math.min(MAX_DOMAINS,200000)]);
}
async function fetchSources(tid) {
  await ensureDefaultSource(tid);
  const sources=(await db().query("SELECT * FROM dns_adblock_sources WHERE tenant_id=$1 AND enabled=true ORDER BY created_at",[tid])).rows||[];
  const union=new Set(), failures=[];
  for(const source of sources){
    try {
      const url=validateSource(source.url);
      const response=await axios.get(url,{timeout:45000,responseType:"text",maxContentLength:MAX_BYTES,maxBodyLength:MAX_BYTES,maxRedirects:0,headers:{"User-Agent":"IKIYY-NETWORKS-DNS-Filter/1.0",...(source.etag?{"If-None-Match":source.etag}:{}),...(source.last_modified?{"If-Modified-Since":source.last_modified}:{})},validateStatus:s=>s===200||s===304});
      const knownGood=Array.isArray(source.last_known_good_domains)?source.last_known_good_domains:[];
      if(response.status===304){ for(const d of knownGood)union.add(d); continue; }
      const parsed=parseHosts(response.data,source.domain_limit);
      if(!parsed.domains.length)throw new Error("Source contained no valid domains");
      await db().query("UPDATE dns_adblock_sources SET domain_count=$1,last_known_good_domains=$2::jsonb,etag=$3,last_modified=$4,last_successful_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$5 AND tenant_id=$6",[parsed.domains.length,JSON.stringify(parsed.domains),response.headers.etag||null,response.headers["last-modified"]||null,source.id,tid]);
      await db().query("INSERT INTO dns_adblock_source_history(tenant_id,source_id,status,domain_count,invalid_count,http_status,message) VALUES($1,$2,'validated',$3,$4,$5,$6)",[tid,source.id,parsed.domains.length,parsed.invalid,response.status,`Validated from ${url.hostname}`]);
      for(const domain of parsed.domains)union.add(domain);
    } catch(error) {
      failures.push({source:source.name,error:error.message});
      await db().query("UPDATE dns_adblock_sources SET last_error=$1 WHERE id=$2 AND tenant_id=$3",[error.message.slice(0,1000),source.id,tid]).catch(()=>{});
      await db().query("INSERT INTO dns_adblock_source_history(tenant_id,source_id,status,message) VALUES($1,$2,'failed',$3)",[tid,source.id,error.message.slice(0,1000)]).catch(()=>{});
      for(const domain of (Array.isArray(source.last_known_good_domains)?source.last_known_good_domains:[]))union.add(domain);
    }
  }
  if(!union.size)throw new Error("No validated or last-known-good blocklist domains available; refusing an empty update");
  const allow=(await db().query("SELECT domain FROM dns_adblock_domains WHERE tenant_id=$1 AND list_type='allow' AND enabled=true",[tid])).rows||[];
  const deny=(await db().query("SELECT domain FROM dns_adblock_domains WHERE tenant_id=$1 AND list_type='deny' AND enabled=true",[tid])).rows||[];
  const allowSet=new Set(allow.map(row=>row.domain));
  const final=new Set([...union].filter(domain=>!allowSet.has(domain)));
  for(const row of deny)final.add(row.domain);
  if(final.size>MAX_DOMAINS)throw new Error(`Merged domain set exceeds hard limit ${MAX_DOMAINS}`);
  return {domains:[...final].sort(),failures,source_count:sources.length};
}async function listSources(tid){await ensureDefaultSource(tid);return (await db().query("SELECT id,name,url,enabled,domain_limit,domain_count,last_successful_at,last_error,created_at FROM dns_adblock_sources WHERE tenant_id=$1 ORDER BY created_at",[tid])).rows||[];}
async function sourceHistory(tid,id){return(await db().query("SELECT * FROM dns_adblock_source_history WHERE tenant_id=$1 AND source_id=$2 ORDER BY created_at DESC LIMIT 100",[tid,id])).rows||[];}
async function createSource(tid,item){const url=validateSource(item.url);const name=String(item.name||"Custom source").trim().slice(0,160);const cap=Math.min(MAX_DOMAINS,Math.max(1,Number(item.domain_limit)||100000));const r=await db().query("INSERT INTO dns_adblock_sources(tenant_id,name,url,enabled,domain_limit) VALUES($1,$2,$3,$4,$5) RETURNING id,name,url,enabled,domain_limit,domain_count,last_successful_at,last_error",[tid,name,url,item.enabled!==false,cap]);return r.rows[0];}
async function updateSource(tid,id,item){const url=item.url===undefined?undefined:validateSource(item.url);const r=await db().query("UPDATE dns_adblock_sources SET name=COALESCE($1,name),url=COALESCE($2,url),enabled=COALESCE($3,enabled),domain_limit=COALESCE($4,domain_limit),updated_at=NOW() WHERE id=$5 AND tenant_id=$6 RETURNING id,name,url,enabled,domain_limit,domain_count,last_successful_at,last_error",[item.name===undefined?null:String(item.name).slice(0,160),url||null,item.enabled===undefined?null:Boolean(item.enabled),item.domain_limit===undefined?null:Math.min(MAX_DOMAINS,Math.max(1,Number(item.domain_limit)||100000)),id,tid]);if(!r.rows?.[0])throw Object.assign(new Error("Blocklist source not found"),{status:404});return r.rows[0];}
async function deleteSource(tid,id){const r=await db().query("DELETE FROM dns_adblock_sources WHERE id=$1 AND tenant_id=$2 AND url<>$3 RETURNING id",[id,tid,DEFAULT_FEED]);if(!r.rows?.length)throw Object.assign(new Error("Source not found or protected default"),{status:404});return{success:true};}
async function publish(tid,routerConfigId,domains,userId,httpsBase){
  if(!httpsBase||!/^https:\/\//i.test(httpsBase))throw new Error("DNS_ADBLOCK_PUBLIC_BASE_URL must be a public HTTPS base URL for router feeds");
  const conf=(await db().query("SELECT id,domain_limit,active_version_id FROM dns_adblock_router_configs WHERE id=$1 AND tenant_id=$2",[routerConfigId,tid])).rows?.[0];if(!conf)throw new Error("Router config not found");
  const cap=Math.min(Number(conf.domain_limit)||MAX_DOMAINS,MAX_DOMAINS);if(domains.length>cap)throw new Error(`Domain count ${domains.length} exceeds router cap ${cap}`);
  const max=(await db().query("SELECT COALESCE(MAX(version),0)::bigint AS version FROM dns_adblock_versions WHERE router_config_id=$1",[routerConfigId])).rows?.[0]?.version||0;
  const version=Number(max)+1, content=makeFeedBody(domains), sha=digest(content);
  const result=await db().query(`INSERT INTO dns_adblock_versions(tenant_id,router_config_id,version,status,domain_count,domains,sha256,feed_signature,created_by)
    VALUES($1,$2,$3,'staged',$4,$5::jsonb,$6,'pending',$7) RETURNING id`,[tid,routerConfigId,version,domains.length,JSON.stringify(domains),sha,userId||null]);
  const id=result.rows[0].id; const token=feedSecret(id);
  await db().query("UPDATE dns_adblock_versions SET feed_signature=$1,status='published' WHERE id=$2",[digest(token),id]);
  return {id,version,sha256:sha,domain_count:domains.length,feedUrl:`${httpsBase.replace(/\/$/,"")}/api/dns-adblock/feed/${id}/${token}`};
}
async function verifyFeed(id,token){const r=await db().query("SELECT feed_signature,domains,sha256 FROM dns_adblock_versions WHERE id=$1 AND status IN ('published','active')",[id]);const v=r.rows?.[0];if(!v||!secureEq(v.feed_signature,digest(token)))return null;const content=makeFeedBody(v.domains||[]);return{sha256:v.sha256,text:content};}
function ipNetwork(value){const x=String(value||"").trim();const ip=x.split("/")[0];return net.isIP(ip)===4&&(!x.includes("/")||/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(x))?x:null;}
function routerConfigName(id,kind){return `IKIYY-DNS-${kind}-${String(id).replace(/-/g,"").slice(0,12)}`;}
function apiRows(data){return Array.isArray(data)?data:[];}
async function detectRouter(router){
  const resources=apiRows(await routerExec(router,"/system/resource/print",{".proplist":"version,board-name,architecture-name,total-memory,free-memory"}));
  const boards=apiRows(await routerExec(router,"/system/routerboard/print",{".proplist":"model,board-name,firmware-type"}));
  const version=String(resources[0]?.version||"").match(/\d+(?:\.\d+){1,3}/)?.[0]||null;
  const model=boards[0]?.model||resources[0]?.["board-name"]||"Unknown";
  const compatible=Boolean(version&&minVersion(version,MIN_ROUTEROS));
  return{version,model,compatible,minimum:MIN_ROUTEROS,free_memory:resources[0]?.["free-memory"]||null};
}
function privateAddress(value) {
  const ip=String(value||"").split("/")[0];
  if(net.isIP(ip)!==4)return false;
  const octets=ip.split(".").map(Number);
  return octets[0]===10 || (octets[0]===172 && octets[1]>=16 && octets[1]<=31) || (octets[0]===192 && octets[1]===168) || (octets[0]===100 && octets[1]>=64 && octets[1]<=127) || octets[0]===127;
}
async function loadRouter(tid,configId){
  const r=await db().query(`SELECT c.*,m.name AS connection_name,m.ip_address,m.api_port,m.ssh_port,m.username,m.password_encrypted,m.connection_type,m.use_tunnel,m.wireguard_tunnel_ip,m.wireguard_public_key,m.wireguard_interface_name,m.tenant_id AS connection_tenant_id FROM dns_adblock_router_configs c JOIN mikrotik_connections m ON m.id=c.connection_id WHERE c.id=$1 AND c.tenant_id=$2`,[configId,tid]);
  if(!r.rows?.[0])throw Object.assign(new Error("Router DNS config not found"),{status:404});
  const c=r.rows[0];
  const tunnelReady=Boolean(c.use_tunnel&&c.wireguard_tunnel_ip);
  const tlsApi=String(c.connection_type||"").toLowerCase()==="api-ssl"||Number(c.api_port)===8729;
  if(!tunnelReady&&!tlsApi&&!privateAddress(c.ip_address)) throw new Error("Refusing unencrypted RouterOS API on a public management address; use the configured WireGuard tunnel or api-ssl over TLS");
  return{config:c,router:{id:c.connection_id,name:c.connection_name,ip_address:c.ip_address,api_port:c.api_port,ssh_port:c.ssh_port,username:c.username,password_encrypted:c.password_encrypted,connection_type:c.connection_type,use_tunnel:c.use_tunnel,wireguard_tunnel_ip:c.wireguard_tunnel_ip,wireguard_public_key:c.wireguard_public_key,wireguard_interface_name:c.wireguard_interface_name}};
}
function toRouterOSArgs(args={}) {
  return Object.fromEntries(Object.entries(args).map(([key,value])=>[key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`),value]));
}
async function routerExec(router,path,args={}) {
  return routerConnectionManager.executeCommand(router,path,toRouterOSArgs(args));
}
async function rowsAt(router,path,props){return apiRows(await routerExec(router,`${path}/print`,{".proplist":props}));}
async function syncCustomerIps(router,config){
  const policies=(await db().query(`SELECT p.customer_id,p.access_type,p.username,p.enabled,COALESCE(g.enabled,true) AS group_enabled,COALESCE(g.default_blocking,true) AS group_blocking
    FROM dns_adblock_policies p LEFT JOIN dns_adblock_groups g ON g.id=p.group_id
    WHERE p.tenant_id=$1 AND p.router_config_id=$2`,[config.tenant_id,config.id])).rows||[];
  const activePpp=await rowsAt(router,"/ppp/active","name,address,remote-ipv6-prefix,service");
  const hotspot=await rowsAt(router,"/ip/hotspot/active","user,address,mac-address");
  const leases=await rowsAt(router,"/ip/dhcp-server/lease","address,mac-address,host-name");
  const blockName=routerConfigName(config.id,"BLOCK");const bypassName=routerConfigName(config.id,"BYPASS");
  const blockIps=new Set(),bypassIps=new Set();
  for(const p of policies){
    const sessions=p.access_type==="pppoe"?activePpp.filter(s=>s.name===p.username):hotspot.filter(s=>s.user===p.username);
    for(const session of sessions){
      const ip=String(session.address||"");if(net.isIP(ip)===4)((p.enabled&&p.group_enabled&&p.group_blocking)?blockIps:bypassIps).add(ip);
      const mac=String(session["mac-address"]||"").toLowerCase();
      if(mac)for(const lease of leases)if(String(lease["mac-address"]||"").toLowerCase()===mac&&net.isIP(String(lease.address||""))===4)((p.enabled&&p.group_enabled&&p.group_blocking)?blockIps:bypassIps).add(lease.address);
    }
  }
  const prior=await rowsAt(router,"/ip/firewall/address-list",".id,list,address,comment");
  const owned=prior.filter(x=>x.comment===`${MANAGED}:${config.id}`);
  for(const name of [blockName,bypassName]){
    const existing=new Map(owned.filter(x=>x.list===name).map(x=>[x.address,x]));
    const desired=name===blockName?blockIps:bypassIps;
    for(const ip of desired)if(!existing.has(ip))await routerExec(router,"/ip/firewall/address-list/add",{list:name,address:ip,comment:`${MANAGED}:${config.id}`});
    for(const [ip,row]of existing)if(!desired.has(ip))await routerExec(router,"/ip/firewall/address-list/remove",{numbers:row[".id"]});
  }
  // Never source-identify a subscriber through the shared DNS cache; RouterOS uses per-client source address policy.
  const radreplyTable=await db().query("SELECT to_regclass('public.radreply') AS table_name");
  if(policies.some(p=>p.access_type==='pppoe')&&radreplyTable.rows?.[0]?.table_name){
    for(const p of policies.filter(p=>p.access_type==='pppoe')){
      const target=(p.enabled&&p.group_enabled&&p.group_blocking)?blockName:bypassName;
      await db().query("DELETE FROM radreply WHERE username=$1 AND attribute='Mikrotik-Address-List' AND value LIKE 'IKIYY-DNS-%'",[p.username]);
      await db().query("INSERT INTO radreply(username,attribute,op,value,customer_id,subscription_id) SELECT $1,'Mikrotik-Address-List','=',$2,$3,s.id FROM subscriptions s WHERE s.customer_id=$3 AND s.pppoe_username=$1 ORDER BY s.created_at DESC LIMIT 1",[p.username,target,p.customer_id]);
    }
  }
  return{blockName,bypassName,blocked_clients:blockIps.size,bypass_clients:bypassIps.size,policy_count:policies.length};
}
async function ensureNatRule(router,rules,attrs){
  const exists=rules.some(r=>r.comment===attrs.comment&&r.protocol===attrs.protocol&&String(r["dst-port"])===String(attrs["dst-port"])&&r.action===attrs.action&&String(r["src-address"]||"")===String(attrs["src-address"]||"")&&String(r["src-address-list"]||"")===String(attrs["src-address-list"]||""));
  if(!exists)await routerExec(router,"/ip/firewall/nat/add",{...attrs,"place-before":"0"});
}
async function ensureFilterRule(router,rules,attrs){
  const exists=rules.some(r=>r.comment===attrs.comment&&r.chain===attrs.chain&&r.protocol===attrs.protocol&&String(r["dst-port"])===String(attrs["dst-port"])&&r.action===attrs.action&&String(r["src-address"]||"")===String(attrs["src-address"]||"")&&String(r["in-interface-list"]||"")===String(attrs["in-interface-list"]||""));
  if(!exists)await routerExec(router,"/ip/firewall/filter/add",{...attrs,"place-before":"0"});
}
async function applyFirewall(router,config,policyIps){
  const nat=await rowsAt(router,"/ip/firewall/nat",".id,chain,action,protocol,dst-port,src-address,src-address-list,to-addresses,to-ports,comment,disabled");
  const filters=await rowsAt(router,"/ip/firewall/filter",".id,chain,action,protocol,dst-port,in-interface-list,src-address,comment,disabled");
  const list=String(config.lan_interface_list||"LAN");
  const wanList=String(config.wan_interface_list||"WAN");
  const configuredSources=String(config.protected_ipv4_subnets||"").split(/[\s,;]+/).map(ipNetwork).filter(Boolean);
  if(config.network_wide&&configuredSources.length===0)throw new Error("Set explicit Protected IPv4 Subnets before enabling network-wide DNS enforcement; no WAN/global catch-all is added");
  const sourceNetworks=config.network_wide?configuredSources:[...(policyIps.blockIps||[])];
  if(!config.network_wide&&sourceNetworks.length===0)throw new Error("No enabled subscriber sessions are currently available for individual-only DNS filtering");
  const tag=`${MANAGED}:${config.id}`;
  const desiredNatKeys=new Set();
  for(const subnet of sourceNetworks){
    for(const proto of ["udp","tcp"]){
      const matchList=config.network_wide?`!${policyIps.bypassName}`:"";
      desiredNatKeys.add([proto,subnet,matchList].join("|"));
      if(config.network_wide){
        await ensureNatRule(router,nat,{chain:"dstnat","in-interface-list":list,"src-address":subnet,"src-address-list":`!${policyIps.bypassName}`,protocol:proto,"dst-port":"53",action:"redirect","to-ports":"53","place-before":"0",comment:tag});
      } else {
        await ensureNatRule(router,nat,{chain:"dstnat","in-interface-list":list,"src-address":subnet,protocol:proto,"dst-port":"53",action:"redirect","to-ports":"53","place-before":"0",comment:tag});
      }
      // Guard the router resolver itself. Allow only the explicitly protected subscriber prefixes.
      await ensureFilterRule(router,filters,{chain:"input","in-interface-list":list,"src-address":subnet,protocol:proto,"dst-port":"53",action:"accept","place-before":"0",comment:tag});
    }
  }
  for(const row of nat.filter(r=>r.comment===tag&&String(r["dst-port"])==="53")){
    const key=[row.protocol,row["src-address"]||"",row["src-address-list"]||""].join("|");
    if(!desiredNatKeys.has(key)) await routerExec(router,"/ip/firewall/nat/remove",{numbers:row[".id"]});
  }
  // Explicitly reject WAN DNS access; no remote recursive resolver is exposed.
  for(const proto of ["udp","tcp"]) await ensureFilterRule(router,filters,{chain:"input","in-interface-list":wanList,protocol:proto,"dst-port":"53",action:"drop","place-before":"0",comment:tag});
  if(config.block_dot){
    for(const proto of ["tcp","udp"])await ensureFilterRule(router,filters,{chain:"forward","in-interface-list":list,protocol:proto,"dst-port":"853",action:"drop","place-before":"0",comment:tag});
  } else {
    for(const row of filters.filter(r=>r.comment===tag&&String(r["dst-port"])==="853"))await routerExec(router,"/ip/firewall/filter/remove",{numbers:row[".id"]});
  }
  // Controlled IPv6 interception using the configured LAN interface list. IPv6 opt-out stays unsupported unless explicit prefix lists are added.
  if(config.enforce_ipv6){
    const ipv6Subnets=String(config.protected_ipv6_prefixes||"").split(/[\s,;]+/).map(value=>String(value).trim()).filter(value=>value&&net.isIP(value.split("/")[0])===6&&/^.+\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/.test(value));
    if(!ipv6Subnets.length)throw new Error("IPv6 enforcement requires explicit protected IPv6 prefixes; no broad IPv6 interception is installed");
    const nat6=await rowsAt(router,"/ipv6/firewall/nat",".id,chain,action,protocol,dst-port,in-interface-list,src-address-list,comment");
    const filter6=await rowsAt(router,"/ipv6/firewall/filter",".id,chain,action,protocol,dst-port,in-interface-list,comment");
    for(const subnet of ipv6Subnets)for(const proto of ["udp","tcp"]){
      if(config.network_wide){if(!nat6.some(r=>r.comment===tag&&r.protocol===proto&&String(r["dst-port"])==="53"&&r["src-address"]===subnet))await routerExec(router,"/ipv6/firewall/nat/add",{chain:"dstnat","in-interface-list":list,"src-address":subnet,protocol:proto,"dst-port":"53",action:"redirect","to-ports":"53","place-before":"0",comment:tag});}
      if(!filter6.some(r=>r.comment===tag&&r.chain==="input"&&r.protocol===proto&&String(r["dst-port"])==="53"&&r["src-address"]===subnet))await routerExec(router,"/ipv6/firewall/filter/add",{chain:"input","in-interface-list":list,"src-address":subnet,protocol:proto,"dst-port":"53",action:"accept","place-before":"0",comment:tag});
    }
    for(const proto of ["udp","tcp"])if(!filter6.some(r=>r.comment===tag&&r.chain==="input"&&r.protocol===proto&&String(r["dst-port"])==="53"&&r["in-interface-list"]===wanList))await routerExec(router,"/ipv6/firewall/filter/add",{chain:"input","in-interface-list":wanList,protocol:proto,"dst-port":"53",action:"drop","place-before":"0",comment:tag});
  }
}
async function removeManaged(router,config){
  const tag=`${MANAGED}:${config.id}`;
  for(const [path,comment]of [["/ip/firewall/nat",tag],["/ip/firewall/filter",tag],["/ip/firewall/address-list",tag],["/ipv6/firewall/nat",tag],["/ipv6/firewall/filter",tag]]){
    try{const data=await rowsAt(router,path,".id,comment");for(const row of data.filter(r=>r.comment===comment))await routerExec(router,`${path}/remove`,{numbers:row[".id"]});}catch(error){if(!/no such command|not enough permissions|invalid/i.test(error.message))throw error;}
  }
  const ads=await rowsAt(router,"/ip/dns/adlist",".id,comment");for(const ad of ads.filter(r=>r.comment===MANAGED||r.comment===`${MANAGED}:${config.id}`))await routerExec(router,"/ip/dns/adlist/remove",{numbers:ad[".id"]});
  const baseline=config.dns_baseline||{};
  if(baseline["allow-remote-requests"]!==undefined){const restore={"allow-remote-requests":baseline["allow-remote-requests"]};if(baseline["cache-size"])restore["cache-size"]=baseline["cache-size"];await routerExec(router,"/ip/dns/set",restore);}
}
async function recordLog(tid,id,operation,status,message,details={}){await db().query(`INSERT INTO dns_adblock_sync_logs(tenant_id,router_config_id,operation,status,version,domain_count,message,details) SELECT $1,$2,$3,$4,version,domain_count,$5,$6::jsonb FROM dns_adblock_versions WHERE router_config_id=$2 ORDER BY version DESC LIMIT 1`,[tid,id,operation,status,message||null,JSON.stringify(details)]).catch(async()=>db().query("INSERT INTO dns_adblock_sync_logs(tenant_id,router_config_id,operation,status,message,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[tid,id,operation,status,message||null,JSON.stringify(details)]));}
async function syncRouter(req,id,{snapshot,reason="manual"}={}){
  const tid=tenant(req);let candidate=null;let config=null;let router=null;
  try{
    if(!global.dbAvailable)throw new Error("Router synchronization requires PostgreSQL persistence");
    ({config,router}=await loadRouter(tid,id));if(!config.enabled)throw new Error("Enable DNS filtering before synchronization");
    if(!snapshot)snapshot=await fetchSources(tid);
    const published=await publish(tid,id,snapshot.domains,req?.user?.id,process.env.DNS_ADBLOCK_PUBLIC_BASE_URL||process.env.APP_URL||process.env.BASE_URL);
    candidate=published;
    const info=await detectRouter(router);
    if(!info.compatible)throw new Error(`RouterOS ${info.version||"unknown"} is below ${MIN_ROUTEROS}; native Adlist deployment is refused`);
    const adlists=await rowsAt(router,"/ip/dns/adlist",".id,url,disabled,name-count,match-count,comment");
    const dns=await rowsAt(router,"/ip/dns",".id,allow-remote-requests,cache-size,servers");
    const intfs=await rowsAt(router,"/interface/list",".id,name");
    if(!intfs.some(x=>x.name===String(config.lan_interface_list||"LAN")))throw new Error(`Router lacks configured LAN interface list ${config.lan_interface_list||"LAN"}`);
    if(!intfs.some(x=>x.name===String(config.wan_interface_list||"WAN")))throw new Error(`Router lacks configured WAN interface list ${config.wan_interface_list||"WAN"}; resolver exposure guard not safely configurable`);
    if(!config.dns_baseline)await db().query("UPDATE dns_adblock_router_configs SET dns_baseline=$1::jsonb WHERE id=$2",[JSON.stringify({"allow-remote-requests":dns[0]?.["allow-remote-requests"]||"no","cache-size":dns[0]?.["cache-size"]||null}),id]);
    const desiredCache=Math.max(16384,Math.ceil(published.domain_count*0.16));
    const currentCache=Number(String(dns[0]?.["cache-size"]||"2048").replace(/[^0-9]/g,""))||2048;
    const dnsSet={"allow-remote-requests":"yes"};if(currentCache<desiredCache)dnsSet["cache-size"]=String(desiredCache);
    await routerExec(router,"/ip/dns/set",dnsSet);
    const previous=adlists.filter(a=>a.comment===MANAGED||a.comment===`${MANAGED}:${id}`);
    const same=previous.find(a=>a.url===published.feedUrl);
    if(same)await routerExec(router,"/ip/dns/adlist/set",{numbers:same[".id"],"ssl-verify":"yes",disabled:"no"});
    else await routerExec(router,"/ip/dns/adlist/add",{url:esc(published.feedUrl),"ssl-verify":"yes",comment:`${MANAGED}:${id}`});
    await routerExec(router,"/ip/dns/adlist/reload");
    let active=null;let imported=0;
    for(let attempt=0;attempt<10;attempt++){
      const after=await rowsAt(router,"/ip/dns/adlist",".id,url,disabled,name-count,match-count,comment");
      active=after.find(a=>a.url===published.feedUrl&&a.comment===`${MANAGED}:${id}`&&!["yes","true"].includes(String(a.disabled)));
      imported=Number(active?.["name-count"]||0);
      if(active&&imported>=Math.max(1,Math.floor(published.domain_count*0.5)))break;
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    if(!active||imported<Math.max(1,Math.floor(published.domain_count*0.5)))throw new Error(`New Adlist not verified (${imported}/${published.domain_count}); previous managed version retained`);
    const policy=await syncCustomerIps(router,config);
    if(config.enforce_dns)await applyFirewall(router,config,policy);
    // Only remove the previous active feeds after candidate import and managed enforcement succeeded.
    for(const old of previous)if(old.url!==published.feedUrl)await routerExec(router,"/ip/dns/adlist/remove",{numbers:old[".id"]});
    await db().query("UPDATE dns_adblock_versions SET status='retired',retired_at=NOW() WHERE router_config_id=$1 AND status='active' AND id<>$2",[id,published.id]);
    await db().query("UPDATE dns_adblock_versions SET status='active',activated_at=NOW() WHERE id=$1",[published.id]);
    await db().query("UPDATE dns_adblock_router_configs SET active_version_id=$1,routeros_version=$2,hardware_model=$3,compatibility='compatible',last_successful_sync=NOW(),last_sync_status='synced',last_sync_error=NULL,updated_at=NOW() WHERE id=$4",[published.id,info.version,info.model,id]);
    await recordLog(tid,id,reason,"success",`Adlist v${published.version} imported ${imported} domains`,{version:published.version,sha256:published.sha256,managed_blocked_sessions:policy.blocked_count,customer_optouts:policy.optout_count,feed_failures:snapshot.failures||[]});
    return{success:true,status:"synced",version:published.version,domain_count:published.domain_count,imported_count:imported,routeros_version:info.version,model:info.model};
  }catch(error){
    if(candidate) {
      try {
        if(router){
          const entries=await rowsAt(router,"/ip/dns/adlist",".id,url,comment");
          for(const entry of entries.filter(row=>row.url===candidate.feedUrl&&row.comment===`${MANAGED}:${id}`))await routerExec(router,"/ip/dns/adlist/remove",{numbers:entry[".id"]});
        }
      } catch(rollbackError) { error.message += `; staged Adlist rollback also failed: ${rollbackError.message}`; }
      await db().query("UPDATE dns_adblock_versions SET status='failed' WHERE id=$1 AND status='published'",[candidate.id]).catch(()=>{});
    }
    await db().query("UPDATE dns_adblock_router_configs SET last_sync_status='failed',last_sync_error=$1,updated_at=NOW() WHERE id=$2",[error.message.slice(0,1500),id]).catch(()=>{});
    await recordLog(tid,id,reason,"failed",error.message).catch(()=>{});
    return{success:false,status:"failed",error:error.message};
  }
}
async function dashboard(tid){
 const [s,r,p,l,u]=await Promise.all([
  db().query("SELECT COUNT(*) FILTER(WHERE enabled)::int AS active_sources,COALESCE(SUM(domain_count) FILTER(WHERE enabled),0)::int AS domains FROM dns_adblock_sources WHERE tenant_id=$1",[tid]),
  db().query("SELECT COUNT(*) FILTER(WHERE enabled)::int AS managed,COUNT(*) FILTER(WHERE enabled AND last_sync_status='synced')::int AS synced,COUNT(*) FILTER(WHERE enabled AND last_sync_status='failed')::int AS failed FROM dns_adblock_router_configs WHERE tenant_id=$1",[tid]),
  db().query("SELECT COUNT(*)::int AS enabled FROM dns_adblock_policies WHERE tenant_id=$1 AND enabled=true",[tid]),
  db().query("SELECT * FROM dns_adblock_sync_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20",[tid]),
  db().query("SELECT MAX(last_successful_at) AS updated FROM dns_adblock_sources WHERE tenant_id=$1",[tid]),
 ]);
 return{...(s.rows[0]||{}),...(r.rows[0]||{}),customers_enabled:p.rows[0]?.enabled||0,last_successful_update:u.rows[0]?.updated||null,logs:l.rows||[]};
}
async function routerStatus(tid){return(await db().query(`SELECT COALESCE(c.id,m.id) AS id,c.id AS config_id,m.id AS connection_id,c.tenant_id,c.enabled,c.network_wide,c.enforce_dns,c.block_dot,c.enforce_ipv6,c.lan_interface_list,c.wan_interface_list,c.protected_ipv4_subnets,c.protected_ipv6_prefixes,c.domain_limit,c.routeros_version,c.hardware_model,c.compatibility,c.active_version_id,c.last_successful_sync,c.last_sync_status,c.last_sync_error,m.name AS router_name,m.ip_address AS router_ip,m.is_online FROM mikrotik_connections m LEFT JOIN dns_adblock_router_configs c ON c.connection_id=m.id AND c.tenant_id=$1 WHERE ($1::uuid IS NULL OR m.tenant_id=$1 OR m.tenant_id IS NULL) ORDER BY m.name`,[tid])).rows||[];}
async function getRouterConfig(tid,connectionId){const row=(await db().query("SELECT * FROM dns_adblock_router_configs WHERE tenant_id=$1 AND connection_id=$2",[tid,connectionId])).rows?.[0];return row||{connection_id:connectionId,enabled:false,network_wide:true,enforce_dns:true,block_dot:false,enforce_ipv6:false,lan_interface_list:"LAN",wan_interface_list:"WAN",protected_ipv4_subnets:"",protected_ipv6_prefixes:"",domain_limit:200000};}
async function discoverRouter(req,connectionId){const tid=tenant(req);const row=(await db().query("SELECT * FROM mikrotik_connections WHERE id=$1 AND ($2::uuid IS NULL OR tenant_id=$2)",[connectionId,req.tenantId||req.user?.tenant_id||null])).rows?.[0];if(!row)throw Object.assign(new Error("MikroTik router not found"),{status:404});const tunnel=Boolean(row.use_tunnel&&row.wireguard_tunnel_ip);const tls=String(row.connection_type||"").toLowerCase()==="api-ssl"||Number(row.api_port)===8729;if(!tunnel&&!tls&&!privateAddress(row.ip_address))throw Object.assign(new Error("Refusing unencrypted RouterOS API over a public management address; use WireGuard or api-ssl"),{status:403});const router={id:row.id,name:row.name,ip_address:row.ip_address,api_port:row.api_port,ssh_port:row.ssh_port,username:row.username,password_encrypted:row.password_encrypted,connection_type:row.connection_type,use_tunnel:row.use_tunnel,wireguard_tunnel_ip:row.wireguard_tunnel_ip,wireguard_public_key:row.wireguard_public_key,wireguard_interface_name:row.wireguard_interface_name};const info=await detectRouter(router);const ads=info.compatible?await rowsAt(router,"/ip/dns/adlist",".id,url,disabled,name-count,match-count,comment"):[];const saved=await db().query("SELECT id FROM dns_adblock_router_configs WHERE tenant_id=$1 AND connection_id=$2",[tid,connectionId]);if(saved.rows?.[0])await db().query("UPDATE dns_adblock_router_configs SET routeros_version=$1,hardware_model=$2,compatibility=$3,updated_at=NOW() WHERE id=$4",[info.version,info.model,info.compatible?"compatible":"unsupported",saved.rows[0].id]);return{connection_id:row.id,router_name:row.name,router_ip:row.ip_address,is_online:row.is_online,config_id:saved.rows?.[0]?.id||null,...info,adlists:ads};}
async function listPolicies(tid){return(await db().query(`SELECT p.*,c.name AS customer_name,g.name AS group_name,m.name AS router_name FROM dns_adblock_policies p JOIN customers c ON c.id=p.customer_id JOIN dns_adblock_router_configs r ON r.id=p.router_config_id JOIN mikrotik_connections m ON m.id=r.connection_id LEFT JOIN dns_adblock_groups g ON g.id=p.group_id WHERE p.tenant_id=$1 ORDER BY c.name`,[tid])).rows||[];}
async function eligibleCustomers(tid){const result=await db().query(`SELECT c.id,c.name,c.phone,s.pppoe_username,s.hotspot_username,s.status AS subscription_status,m.id AS connection_id,m.name AS router_name,dc.id AS router_config_id FROM customers c JOIN subscriptions s ON s.customer_id=c.id AND s.status='active' JOIN mikrotik_connections m ON m.id=s.mikrotik_connection_id LEFT JOIN dns_adblock_router_configs dc ON dc.connection_id=m.id AND dc.tenant_id=$1 WHERE ($2::uuid IS NULL OR c.tenant_id=$2) ORDER BY c.name`,[tid,tid===DEFAULT_TENANT?null:tid]);return result.rows||[];}
async function disableRouter(req,id){const tid=tenant(req);const{config,router}=await loadRouter(tid,id);await removeManaged(router,config);await db().query("UPDATE dns_adblock_versions SET status='retired',retired_at=NOW() WHERE router_config_id=$1 AND status='active'",[id]);const result=await db().query("UPDATE dns_adblock_router_configs SET enabled=false,last_sync_status='disabled',last_sync_error=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[id]);await recordLog(tid,id,"disable","success","Removed only DNS Adblock-managed rules and Adlists");return result.rows[0];}
async function setRouter(req,connectionId,b={}){
 const tid=tenant(req);const conn=await db().query("SELECT id,name,ip_address FROM mikrotik_connections WHERE id=$1 AND ($2::uuid IS NULL OR tenant_id=$2)",[connectionId,req.tenantId||req.user?.tenant_id||null]);if(!conn.rows?.[0])throw Object.assign(new Error("MikroTik router not found in this tenant"),{status:404});
 const old=(await db().query("SELECT * FROM dns_adblock_router_configs WHERE tenant_id=$1 AND connection_id=$2",[tid,connectionId])).rows?.[0];
 const values=[b.enabled===undefined?(old?.enabled??true):Boolean(b.enabled),b.network_wide===undefined?(old?.network_wide??true):Boolean(b.network_wide),b.enforce_dns===undefined?(old?.enforce_dns??true):Boolean(b.enforce_dns),b.block_dot===undefined?(old?.block_dot??false):Boolean(b.block_dot),b.enforce_ipv6===undefined?(old?.enforce_ipv6??false):Boolean(b.enforce_ipv6),String(b.lan_interface_list??old?.lan_interface_list??"LAN").slice(0,64),String(b.wan_interface_list??old?.wan_interface_list??"WAN").slice(0,64),String(b.protected_ipv4_subnets??old?.protected_ipv4_subnets??"").slice(0,1000),String(b.protected_ipv6_prefixes??old?.protected_ipv6_prefixes??"").slice(0,1000),Math.min(MAX_DOMAINS,Math.max(1,Number(b.domain_limit??old?.domain_limit)||200000))];
 let result;if(old)result=await db().query("UPDATE dns_adblock_router_configs SET enabled=$1,network_wide=$2,enforce_dns=$3,block_dot=$4,enforce_ipv6=$5,lan_interface_list=$6,wan_interface_list=$7,protected_ipv4_subnets=$8,protected_ipv6_prefixes=$9,domain_limit=$10,updated_at=NOW() WHERE id=$11 RETURNING *",[...values,old.id]);else result=await db().query("INSERT INTO dns_adblock_router_configs(tenant_id,connection_id,enabled,network_wide,enforce_dns,block_dot,enforce_ipv6,lan_interface_list,wan_interface_list,protected_ipv4_subnets,protected_ipv6_prefixes,domain_limit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",[tid,connectionId,...values]);
 if(old?.enabled&&!values[0]){const loaded=await loadRouter(tid,old.id);await removeManaged(loaded.router,old);await db().query("UPDATE dns_adblock_router_configs SET last_sync_status='disabled',updated_at=NOW() WHERE id=$1",[old.id]);await recordLog(tid,old.id,"disable","success","Removed only DNS Adblock managed rules and Adlists");}
 else if(values[0])await syncRouter(req,result.rows[0].id,{reason:"configure"});
 return{config:result.rows[0],router:conn.rows[0]};
}
async function checkRouter(req,id){const{config,router}=await loadRouter(tenant(req),id);const info=await detectRouter(router);const adlists=await rowsAt(router,"/ip/dns/adlist",".id,url,disabled,name-count,match-count,comment");await db().query("UPDATE dns_adblock_router_configs SET routeros_version=$1,hardware_model=$2,compatibility=$3,updated_at=NOW() WHERE id=$4",[info.version,info.model,info.compatible?"compatible":"unsupported",id]);return{...info,adlists:adlists.map(a=>({url:a.url,managed:a.comment===`${MANAGED}:${id}`,active:!["true","yes"].includes(String(a.disabled)),imported_domains:Number(a["name-count"]||0),matched_queries:Number(a["match-count"]||0)})),sync_status:config.last_sync_status};}
async function updatePolicy(req,id,b){const tid=tenant(req);const old=(await db().query("SELECT * FROM dns_adblock_policies WHERE id=$1 AND tenant_id=$2",[id,tid])).rows?.[0];if(!old)throw Object.assign(new Error("Customer policy not found"),{status:404});const enabled=Boolean(b.enabled);await db().query("UPDATE dns_adblock_policies SET enabled=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3",[enabled,id,tid]);const synced=await syncRouter(req,old.router_config_id,{reason:"customer_policy"});await db().query("UPDATE dns_adblock_policies SET last_sync_status=$1,last_sync_error=$2 WHERE id=$3",[synced.success?"synced":"failed",synced.error||null,id]);return{policy:{...old,enabled,last_sync_status:synced.success?"synced":"failed"},sync:synced};}
async function upsertPolicy(req,p){const tid=tenant(req);const access=p.access_type==="hotspot"?"hotspot":p.access_type==="pppoe"?"pppoe":null;if(!access)throw Object.assign(new Error("access_type must be pppoe or hotspot"),{status:400});const username=String(p.username||"").trim().slice(0,100);if(!username)throw Object.assign(new Error("Subscriber username is required"),{status:400});const c=(await db().query("SELECT id FROM customers WHERE id=$1 AND ($2::uuid IS NULL OR tenant_id=$2)",[p.customer_id,req.tenantId||req.user?.tenant_id||null])).rows?.[0];if(!c)throw Object.assign(new Error("Customer not found"),{status:404});const r=(await db().query("SELECT id FROM dns_adblock_router_configs WHERE id=$1 AND tenant_id=$2 AND enabled=true",[p.router_config_id,tid])).rows?.[0];if(!r)throw Object.assign(new Error("Choose an enabled router DNS filter"),{status:400});const row=await db().query(`INSERT INTO dns_adblock_policies(tenant_id,customer_id,router_config_id,access_type,username,enabled,self_service_allowed,group_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(router_config_id,access_type,username) DO UPDATE SET customer_id=EXCLUDED.customer_id,enabled=EXCLUDED.enabled,self_service_allowed=EXCLUDED.self_service_allowed,group_id=EXCLUDED.group_id,updated_at=NOW() RETURNING *`,[tid,p.customer_id,p.router_config_id,access,username,p.enabled!==false,Boolean(p.self_service_allowed),p.group_id||null]);return row.rows[0];}
async function listGroups(tid){return(await db().query("SELECT * FROM dns_adblock_groups WHERE tenant_id=$1 ORDER BY name",[tid])).rows||[];}
async function createGroup(tid,b){const name=String(b.name||"").trim().slice(0,120);if(!name)throw Object.assign(new Error("Group name required"),{status:400});const r=await db().query("INSERT INTO dns_adblock_groups(tenant_id,name,enabled,self_service_allowed,default_blocking) VALUES($1,$2,$3,$4,$5) RETURNING *",[tid,name,b.enabled!==false,Boolean(b.self_service_allowed),b.default_blocking!==false]);return r.rows[0];}
async function updateGroup(tid,id,b){const r=await db().query("UPDATE dns_adblock_groups SET name=COALESCE($1,name),enabled=COALESCE($2,enabled),self_service_allowed=COALESCE($3,self_service_allowed),default_blocking=COALESCE($4,default_blocking),updated_at=NOW() WHERE id=$5 AND tenant_id=$6 RETURNING *",[b.name===undefined?null:String(b.name).trim().slice(0,120),b.enabled===undefined?null:Boolean(b.enabled),b.self_service_allowed===undefined?null:Boolean(b.self_service_allowed),b.default_blocking===undefined?null:Boolean(b.default_blocking),id,tid]);if(!r.rows?.[0])throw Object.assign(new Error("Policy group not found"),{status:404});const routers=await db().query("SELECT DISTINCT router_config_id FROM dns_adblock_policies WHERE group_id=$1 AND tenant_id=$2",[id,tid]);for(const row of routers.rows||[])await syncRouter({tenantId:tid,user:{tenant_id:tid,role:"system"}},row.router_config_id,{reason:"group_policy"});return r.rows[0];}
async function listDomains(tid){return(await db().query("SELECT * FROM dns_adblock_domains WHERE tenant_id=$1 ORDER BY list_type,domain",[tid])).rows||[];}
async function upsertDomain(tid,item,userId){const domain=safeDomain(item.domain);const type=["allow","deny"].includes(item.list_type)?item.list_type:null;if(!domain||!type)throw Object.assign(new Error("Valid domain and allow/deny list_type required"),{status:400});const r=await db().query(`INSERT INTO dns_adblock_domains(tenant_id,domain,list_type,enabled,note,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,domain,list_type) DO UPDATE SET enabled=EXCLUDED.enabled,note=EXCLUDED.note RETURNING *`,[tid,domain,type,item.enabled!==false,String(item.note||"").slice(0,500),userId||null]);return r.rows[0];}
async function deleteDomain(tid,id){const r=await db().query("DELETE FROM dns_adblock_domains WHERE id=$1 AND tenant_id=$2 RETURNING id",[id,tid]);if(!r.rows?.length)throw Object.assign(new Error("Domain not found"),{status:404});return{success:true};}
async function syncLogs(tid,limit=100){return(await db().query("SELECT l.*,m.name AS router_name FROM dns_adblock_sync_logs l LEFT JOIN dns_adblock_router_configs c ON c.id=l.router_config_id LEFT JOIN mikrotik_connections m ON m.id=c.connection_id WHERE l.tenant_id=$1 ORDER BY l.created_at DESC LIMIT $2",[tid,limit])).rows||[];}
async function getCustomerPolicy(customerId){return(await db().query("SELECT id,enabled,self_service_allowed,access_type,username,last_sync_status FROM dns_adblock_policies WHERE customer_id=$1 ORDER BY created_at DESC",[customerId])).rows||[];}
async function getCustomerPolicySummary(customerId){const policies=await getCustomerPolicy(customerId);return{policies,managed:policies.length>0,enabled:policies.some(p=>p.enabled),self_service_allowed:policies.some(p=>p.self_service_allowed)};}
async function deleteGroup(tid,id){const routers=(await db().query("SELECT DISTINCT router_config_id FROM dns_adblock_policies WHERE group_id=$1 AND tenant_id=$2",[id,tid])).rows||[];await db().query("UPDATE dns_adblock_policies SET group_id=NULL,updated_at=NOW() WHERE group_id=$1 AND tenant_id=$2",[id,tid]);const r=await db().query("DELETE FROM dns_adblock_groups WHERE id=$1 AND tenant_id=$2 RETURNING id",[id,tid]);if(!r.rows?.length)throw Object.assign(new Error("Policy group not found"),{status:404});for(const row of routers)await syncRouter({tenantId:tid,user:{tenant_id:tid,role:"system"}},row.router_config_id,{reason:"group_delete"});return{success:true};}
async function setCustomerSelfService(customerId,enabled){const policies=(await db().query("SELECT id,router_config_id,tenant_id FROM dns_adblock_policies WHERE customer_id=$1 AND self_service_allowed=true",[customerId])).rows||[];const results=[];for(const p of policies){await db().query("UPDATE dns_adblock_policies SET enabled=$1,updated_at=NOW() WHERE id=$2",[Boolean(enabled),p.id]);const outcome=await syncRouter({tenantId:p.tenant_id,user:{tenant_id:p.tenant_id,role:"system"}},p.router_config_id,{reason:"customer_self_service"});await db().query("UPDATE dns_adblock_policies SET last_sync_status=$1,last_sync_error=$2 WHERE id=$3",[outcome.success?"synced":"failed",outcome.error||null,p.id]);results.push(outcome);}return{enabled:Boolean(enabled),count:results.length,results};}
async function dailyUpdate(){if(!global.dbAvailable)return{skipped:true};const rows=(await db().query("SELECT id,tenant_id FROM dns_adblock_router_configs WHERE enabled=true")).rows||[];const outcomes=[];for(const tid of [...new Set(rows.map(x=>x.tenant_id))]){let snapshot;try{snapshot=await fetchSources(tid);}catch(error){for(const c of rows.filter(x=>x.tenant_id===tid)){await db().query("UPDATE dns_adblock_router_configs SET last_sync_status='failed',last_sync_error=$1 WHERE id=$2",[error.message.slice(0,1000),c.id]);await recordLog(tid,c.id,"daily_update","failed",error.message);}continue;}for(const c of rows.filter(x=>x.tenant_id===tid))outcomes.push(await syncRouter({tenantId:tid,user:{tenant_id:tid,role:"system"}},c.id,{snapshot,reason:"daily_update"}));}return{routers:outcomes.length,succeeded:outcomes.filter(x=>x.success).length,failed:outcomes.filter(x=>!x.success).length};}
async function checkHealth(){const configs=(await db().query("SELECT id,tenant_id FROM dns_adblock_router_configs WHERE enabled=true")).rows||[];const results=[];for(const item of configs){try{results.push({id:item.id,status:await checkRouter({tenantId:item.tenant_id,user:{tenant_id:item.tenant_id,role:"system"}},item.id)});}catch(error){await db().query("UPDATE dns_adblock_router_configs SET last_sync_status='unreachable',last_sync_error=$1 WHERE id=$2",[error.message.slice(0,1000),item.id]).catch(()=>{});await recordLog(item.tenant_id,item.id,"health_check","failed",error.message).catch(()=>{});results.push({id:item.id,error:error.message});}}return{checked:configs.length,results};}
async function retryFailed(){const configs=(await db().query("SELECT id,tenant_id FROM dns_adblock_router_configs WHERE enabled=true AND last_sync_status IN ('failed','queued','unreachable')")).rows||[];const results=[];for(const tid of [...new Set(configs.map(c=>c.tenant_id))]){let snapshot;try{snapshot=await fetchSources(tid);}catch(error){continue;}for(const item of configs.filter(c=>c.tenant_id===tid))results.push(await syncRouter({tenantId:tid,user:{tenant_id:tid,role:"system"}},item.id,{snapshot,reason:"retry"}));}return{attempted:results.length,succeeded:results.filter(r=>r.success).length};}
async function recordLog(tid,id,operation,status,message,details={}){await db().query("INSERT INTO dns_adblock_sync_logs(tenant_id,router_config_id,operation,status,message,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[tid,id||null,operation,status,message||null,JSON.stringify(details)]);}

module.exports={DEFAULT_FEED,MAX_DOMAINS,MANAGED,safeDomain,parseHosts,validateSource,toRouterOSArgs,fetchSources,publish,verifyFeed,syncRouter,dailyUpdate,dashboard,routerStatus,getRouterConfig,discoverRouter,listPolicies,eligibleCustomers,disableRouter,listSources,createSource,updateSource,deleteSource,sourceHistory,setRouter,checkRouter,upsertPolicy,updatePolicy,listGroups,createGroup,updateGroup,listDomains,upsertDomain,deleteDomain,syncLogs,getCustomerPolicy,getCustomerPolicySummary,setCustomerSelfService,deleteGroup,checkHealth,retryFailed,recordLog};
