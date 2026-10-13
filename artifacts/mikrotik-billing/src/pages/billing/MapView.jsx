import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search,
  X,
  Copy,
  CheckCheck,
  MapPin,
  Users,
  Wifi,
  AlertTriangle,
  Building2,
  Radio,
  ExternalLink,
  Filter,
  RefreshCw,
  ChevronRight,
  Navigation,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

// Fix Leaflet's broken default icon paths in Vite/webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Colour helpers ──────────────────────────────────────────────────────────
const STATUS_COLORS = {
  active:    { fill: "#22c55e", ring: "#16a34a", label: "Active",    bg: "bg-green-500/20",  text: "text-green-400",  border: "border-green-500/30" },
  throttled: { fill: "#f59e0b", ring: "#d97706", label: "Throttled", bg: "bg-amber-500/20",  text: "text-amber-400",  border: "border-amber-500/30" },
  suspended: { fill: "#ef4444", ring: "#dc2626", label: "Suspended", bg: "bg-red-500/20",    text: "text-red-400",    border: "border-red-500/30"   },
};

// ─── SVG icon factories ───────────────────────────────────────────────────────
function makeSvgIcon(fill, ring, size = 28) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}" viewBox="0 0 ${size} ${size + 8}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${fill}" stroke="${ring}" stroke-width="2.5" opacity="0.95"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-6}" fill="white" opacity="0.35"/>
    <line x1="${size/2}" y1="${size-2}" x2="${size/2}" y2="${size+8}" stroke="${fill}" stroke-width="2.5"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function makeBranchIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <rect x="2" y="2" width="30" height="30" rx="6" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2.5" opacity="0.95"/>
    <rect x="8" y="8" width="18" height="18" rx="3" fill="white" opacity="0.3"/>
    <line x1="17" y1="32" x2="17" y2="42" stroke="#3b82f6" stroke-width="2.5"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function makeTowerIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <polygon points="16,2 30,28 2,28" fill="#8b5cf6" stroke="#6d28d9" stroke-width="2.5" opacity="0.95"/>
    <polygon points="16,10 24,28 8,28" fill="white" opacity="0.25"/>
    <line x1="16" y1="28" x2="16" y2="40" stroke="#8b5cf6" stroke-width="2.5"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function makeClickIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#f59e0b" stroke="white" stroke-width="2.5" opacity="0.9"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// ─── Leaflet icon instances (created once) ────────────────────────────────────
const makeLeafletIcon = (url, w, h, ay) =>
  L.icon({ iconUrl: url, iconSize: [w, h], iconAnchor: [w / 2, ay], popupAnchor: [0, -(ay + 4)] });

const CLICK_ICON = makeLeafletIcon(makeClickIcon(), 24, 24, 12);
const BRANCH_ICON = makeLeafletIcon(makeBranchIcon(), 34, 42, 42);
const TOWER_ICON  = makeLeafletIcon(makeTowerIcon(), 32, 40, 40);

const customerIcon = (status) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.active;
  return makeLeafletIcon(makeSvgIcon(c.fill, c.ring), 28, 36, 36);
};

// ─── Small UI components ───────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[72px] flex flex-col items-center gap-1 rounded-xl p-2.5 border transition-all duration-200 cursor-pointer
        ${active
          ? `${color.bg} ${color.border} ring-1 ${color.border}`
          : "bg-slate-800/60 border-slate-700/50 hover:border-slate-600"}`}
    >
      <Icon className={`w-4 h-4 ${active ? color.text : "text-slate-400"}`} />
      <span className={`text-lg font-bold leading-none ${active ? color.text : "text-white"}`}>{value}</span>
      <span className="text-[10px] text-slate-400 leading-none">{label}</span>
    </button>
  );
}

function CustomerListItem({ customer, selected, onClick }) {
  const c = STATUS_COLORS[customer.status] || STATUS_COLORS.active;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center gap-2.5 transition-all duration-150 border
        ${selected
          ? "bg-indigo-600/20 border-indigo-500/40 ring-1 ring-indigo-500/30"
          : "bg-slate-800/50 border-slate-700/30 hover:bg-slate-700/50 hover:border-slate-600/50"}`}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.fill }} />
      <div className="min-w-0 flex-1">
        <div className="text-white text-xs font-medium truncate">{customer.name}</div>
        <div className="text-slate-500 text-[10px] truncate">{customer.plan || "No plan"}</div>
      </div>
      {!customer.lat && <MapPin className="w-3 h-3 text-slate-600 flex-shrink-0" title="No location set" />}
      <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function MapView() {
  const navigate = useNavigate();
  const mapDivRef     = useRef(null);
  const mapRef        = useRef(null);
  const markersRef    = useRef([]);
  const clickMarkerRef = useRef(null);

  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState("all");
  const [search, setSearch]               = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [clickedCoords, setClickedCoords] = useState(null);
  const [coordCopied, setCoordCopied]     = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const { data: res } = await axios.get(`${API}/advanced/map/data`);
      setData(res);
    } catch (e) {
      console.error("Map data error:", e);
      setData({ customers: [], branches: [], towers: [], center: [-1.2921, 36.8219], zoom: 11 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── Init Leaflet map once data arrives ─────────────────────────────────────
  useEffect(() => {
    if (!data || !mapDivRef.current || mapRef.current) return;

    const center = Array.isArray(data.center)
      ? data.center
      : [data.center?.lat ?? -1.2921, data.center?.lng ?? 36.8219];

    const map = L.map(mapDivRef.current, {
      center,
      zoom: data.zoom || 11,
      zoomControl: false,
    });

    // Use CartoDB tile servers (more reliable CDN than direct OSM, no API key needed)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      crossOrigin: true,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      setClickedCoords({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
      setSelectedCustomer(null);
      if (clickMarkerRef.current) clickMarkerRef.current.remove();
      clickMarkerRef.current = L.marker([lat, lng], { icon: CLICK_ICON, zIndexOffset: 1000 }).addTo(map);
    });

    mapRef.current = map;

    // Force Leaflet to recalculate tile positions immediately and after layout settles
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
    const t3 = setTimeout(() => map.invalidateSize(), 800);

    // ResizeObserver: re-run invalidateSize any time the container is resized by the browser
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapDivRef.current);
    }

    // Also invalidate on window resize
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    // Clean up on unmount
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
    };
  }, [data]);

  // ── Re-render markers when data or filter changes ──────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const branches  = Array.isArray(data.branches)  ? data.branches  : [];
    const towers    = Array.isArray(data.towers)     ? data.towers    : [];
    const customers = Array.isArray(data.customers)  ? data.customers : [];

    branches.forEach((b) => {
      if (!b.lat || !b.lng) return;
      const m = L.marker([b.lat, b.lng], { icon: BRANCH_ICON, title: b.name }).addTo(map);
      m.bindPopup(`
        <div style="font-family:system-ui;min-width:160px">
          <b style="font-size:13px">🏢 ${b.name}</b>
          <div style="font-size:11px;color:#555;margin-top:5px;line-height:1.7">
            ${b.city ? `<div>📍 ${b.city}</div>` : ""}
            <div>🟢 Active PPPoE: <b>${b.active_pppoe || 0}</b></div>
            <div>📡 Routers: <b>${b.online_routers || 0}/${b.total_routers || 0}</b></div>
          </div>
        </div>`, { maxWidth: 220 });
      markersRef.current.push(m);
    });

    towers.forEach((t) => {
      if (!t.lat || !t.lng) return;
      const m = L.marker([t.lat, t.lng], { icon: TOWER_ICON, title: t.name }).addTo(map);
      m.bindPopup(`
        <div style="font-family:system-ui;min-width:150px">
          <b style="font-size:13px">📡 ${t.name}</b>
          <div style="font-size:11px;color:#555;margin-top:5px;line-height:1.7">
            <div>👥 Clients: <b>${t.customer_count || 0}</b></div>
            ${t.height ? `<div>📏 Height: <b>${t.height}m</b></div>` : ""}
          </div>
        </div>`, { maxWidth: 200 });
      markersRef.current.push(m);
    });

    const filtered = filter === "all" ? customers : customers.filter((c) => c.status === filter);
    filtered.filter((c) => c.lat != null && c.lng != null).forEach((customer) => {
      const col = STATUS_COLORS[customer.status] || STATUS_COLORS.active;
      const m = L.marker([customer.lat, customer.lng], {
        icon: customerIcon(customer.status),
        title: customer.name,
      }).addTo(map);

      m.bindPopup(`
        <div style="font-family:system-ui;min-width:170px">
          <b style="font-size:13px">${customer.name}</b>
          <div style="font-size:11px;color:#555;margin-top:5px;line-height:1.8">
            <div>Status: <span style="color:${col.fill};font-weight:600">${col.label}</span></div>
            <div>Plan: <b>${customer.plan || "—"}</b></div>
            <div>Phone: ${customer.phone || "—"}</div>
            <div style="margin-top:5px;font-size:10px;color:#999">
              ${parseFloat(customer.lat).toFixed(5)}, ${parseFloat(customer.lng).toFixed(5)}
            </div>
          </div>
        </div>`, { maxWidth: 230 });

      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedCustomer(customer);
        setClickedCoords(null);
        if (clickMarkerRef.current) { clickMarkerRef.current.remove(); clickMarkerRef.current = null; }
      });

      markersRef.current.push(m);
    });
  }, [data, filter]);

  useEffect(() => { renderMarkers(); }, [renderMarkers]);

  // ── Fly to customer when clicked in sidebar ───────────────────────────────
  const flyToCustomer = (customer) => {
    setSelectedCustomer(customer);
    setClickedCoords(null);
    if (customer.lat && customer.lng && mapRef.current) {
      mapRef.current.flyTo([customer.lat, customer.lng], 16, { duration: 1 });
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const customers = data?.customers || [];
  const stats = {
    total:        customers.length,
    active:       customers.filter((c) => c.status === "active").length,
    throttled:    customers.filter((c) => c.status === "throttled").length,
    suspended:    customers.filter((c) => c.status === "suspended").length,
    branches:     (data?.branches || []).length,
    towers:       (data?.towers   || []).length,
    withLocation: customers.filter((c) => c.lat != null).length,
  };

  const filteredList = customers.filter((c) => {
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.plan  && c.plan.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const selCol = selectedCustomer ? (STATUS_COLORS[selectedCustomer.status] || STATUS_COLORS.active) : null;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <MapPin className="absolute inset-0 m-auto w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Loading map data…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex bg-slate-900 overflow-hidden" style={{ height: "100%", minHeight: 0, width: "100%" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div
        className={`flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 overflow-hidden flex-shrink-0
          ${sidebarOpen ? "w-80" : "w-0"}`}
        style={{ minWidth: sidebarOpen ? 320 : 0 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="text-white font-semibold text-sm">Network Map</h2>
            </div>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-xs text-slate-500 ml-9">
            {stats.withLocation} of {stats.total} clients have location
          </p>
        </div>

        {/* Stats */}
        <div className="p-3 border-b border-slate-800 flex gap-2 flex-shrink-0">
          <StatCard icon={Users}         label="Active"    value={stats.active}    color={STATUS_COLORS.active}    onClick={() => setFilter(filter === "active"    ? "all" : "active")}    active={filter === "active"} />
          <StatCard icon={AlertTriangle} label="Throttled" value={stats.throttled} color={STATUS_COLORS.throttled} onClick={() => setFilter(filter === "throttled" ? "all" : "throttled")} active={filter === "throttled"} />
          <StatCard icon={Wifi}          label="Suspended" value={stats.suspended} color={STATUS_COLORS.suspended} onClick={() => setFilter(filter === "suspended" ? "all" : "suspended")} active={filter === "suspended"} />
        </div>

        {/* Infrastructure */}
        <div className="px-3 py-2 border-b border-slate-800 flex gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-slate-400">{stats.branches} Branches</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-slate-400">{stats.towers} Towers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">{filteredList.length} shown</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-slate-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
          {filteredList.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              {search ? "No results found" : "No customers in this filter"}
            </div>
          ) : (
            filteredList.map((c) => (
              <CustomerListItem
                key={c.id}
                customer={c}
                selected={selectedCustomer?.id === c.id}
                onClick={() => flyToCustomer(c)}
              />
            ))
          )}
        </div>

        {/* Legend */}
        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {Object.entries(STATUS_COLORS).map(([, c]) => (
              <div key={c.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.fill }} />
                <span className="text-[10px] text-slate-400">{c.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-blue-500" />
              <span className="text-[10px] text-slate-400">Branch</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-purple-500" style={{ clipPath: "polygon(50% 0%,100% 100%,0% 100%)" }} />
              <span className="text-[10px] text-slate-400">Tower</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Map area ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ minWidth: 0, minHeight: 0, height: "100%" }}>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-3 left-3 z-[500] bg-slate-800/90 backdrop-blur border border-slate-700/60 rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-lg"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Map — must have explicit width+height for Leaflet tile rendering */}
        <div
          ref={mapDivRef}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
        />

        {/* Coordinate picker panel */}
        {clickedCoords && (
          <div className="absolute top-3 right-3 z-[500] bg-slate-900/95 backdrop-blur border border-amber-500/30 rounded-xl p-4 shadow-2xl min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-amber-400 font-semibold">Clicked Location</span>
              </div>
              <button
                onClick={() => {
                  setClickedCoords(null);
                  if (clickMarkerRef.current) { clickMarkerRef.current.remove(); clickMarkerRef.current = null; }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-mono text-sm text-white mb-3 leading-relaxed">
              {clickedCoords.lat},<br />{clickedCoords.lng}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${clickedCoords.lat}, ${clickedCoords.lng}`);
                setCoordCopied(true);
                setTimeout(() => setCoordCopied(false), 2000);
              }}
              className={`w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-all
                ${coordCopied
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600"}`}
            >
              {coordCopied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {coordCopied ? "Copied!" : "Copy Coordinates"}
            </button>
            <p className="text-[10px] text-slate-500 mt-2 text-center">Use these to set a client&apos;s location</p>
          </div>
        )}

        {/* Selected customer detail panel */}
        {selectedCustomer && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] bg-slate-900/98 backdrop-blur border border-slate-700/60 rounded-2xl p-5 shadow-2xl w-80 max-w-[calc(100vw-2rem)]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base"
                  style={{ backgroundColor: selCol?.fill + "33", border: `1.5px solid ${selCol?.fill}55` }}
                >
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm leading-tight">{selectedCustomer.name}</div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: selCol?.fill + "22", color: selCol?.fill }}>
                    {selCol?.label}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-slate-500 hover:text-white transition-colors mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              {selectedCustomer.plan && (
                <div className="bg-slate-800/80 rounded-lg p-2">
                  <div className="text-slate-500 text-[10px] mb-0.5">Plan</div>
                  <div className="text-white font-medium truncate">{selectedCustomer.plan}</div>
                </div>
              )}
              {selectedCustomer.phone && (
                <div className="bg-slate-800/80 rounded-lg p-2">
                  <div className="text-slate-500 text-[10px] mb-0.5">Phone</div>
                  <div className="text-white font-medium">{selectedCustomer.phone}</div>
                </div>
              )}
              {selectedCustomer.lat && (
                <div className="bg-slate-800/80 rounded-lg p-2 col-span-2">
                  <div className="text-slate-500 text-[10px] mb-0.5">Coordinates</div>
                  <div className="text-white font-mono text-[10px]">
                    {parseFloat(selectedCustomer.lat).toFixed(6)}, {parseFloat(selectedCustomer.lng).toFixed(6)}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate(`/billing-customers/${selectedCustomer.id}`)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-xl transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Customer Profile
            </button>
          </div>
        )}

        {/* No locations hint — small corner badge, does NOT block the map */}
        {stats.withLocation === 0 && (
          <div className="absolute bottom-4 right-4 z-[500] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg max-w-xs">
            <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <p className="text-slate-400 text-xs">
              No client pins yet — click the map to get coordinates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
