import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Plus,
  Search,
  ExternalLink,
  UserPlus,
  Trash2,
  Pencil,
  ChevronRight,
  Wifi,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  RefreshCw,
  X,
  MapPin,
  Smartphone,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { MpesaStkModal } from "../../components/MpesaStkModal";
import AirtelStkModal from "../../components/AirtelStkModal";
import MtnStkModal from "../../components/MtnStkModal";
import PaystackModal from "../../components/PaystackModal";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";
const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";

/* ─── Online Status Badge ─── */
function OnlineStatus({
  customer,
  connections,
  selectedConnection,
  onConnectionChange,
}) {
  const [status, setStatus] = useState(null); // null = unknown, 'online' = online, 'offline' = offline

  useEffect(() => {
    if (!selectedConnection || !customer) {
      setStatus(null);
      return;
    }
    const check = async () => {
      try {
        const { data } = await axios.get(
          `${API}/billing/customers/online-status?connection_id=${selectedConnection}`,
        );
        if (data.online?.[customer.id]) {
          setStatus(data.online[customer.id]);
        } else {
          setStatus("offline");
        }
      } catch (e) {
        setStatus(null);
      }
    };
    check();
    const interval = setInterval(check, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [customer?.id, selectedConnection]);

  if (!selectedConnection) {return null;}
  if (status === null) {return <span className="text-xs text-zinc-600">—</span>;}
  if (status === "offline")
    {return <span className="text-xs text-zinc-600">Offline</span>;}

  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
      <span className="text-xs text-emerald-400 font-medium">Online</span>
      <span className="text-[10px] text-zinc-500">{status.uptime || "—"}</span>
      {status.type === "pppoe" && <Wifi className="w-3 h-3 text-blue-400" />}
      {status.type === "hotspot" && <Zap className="w-3 h-3 text-amber-400" />}
    </div>
  );
}

export function BillingCustomers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    id_number: "",
    status: "active",
    notes: "",
    account_number: "",
    fup_profile_id: "",
    plan_id: "",
    lat: "",
    lng: "",
  });
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [onlineData, setOnlineData] = useState({});
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [fupProfiles, setFupProfiles] = useState([]);
  const [servicePlans, setServicePlans] = useState([]);
  const [settings, setSettings] = useState({});
  const [portalUrl, setPortalUrl] = useState(null);
  const [portalCredentials, setPortalCredentials] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [stkTarget, setStkTarget] = useState(null); // customer object for STK modal
  const [airtelTarget, setAirtelTarget] = useState(null);
  const [mtnTarget, setMtnTarget] = useState(null);
  const [paystackTarget, setPaystackTarget] = useState(null);
  const mapPickerRef = useRef(null);
  const pickerMapRef = useRef(null);
  const pickerMarkerRef = useRef(null);

  // Derive company abbreviation: first letter of each word (e.g. GIRAFFE NETWORKS -> GN)
  const getCompanyAbbreviation = () => {
    const cn = settings?.company_name || "";
    const abbr = settings?.company_abbreviation || "";
    if (abbr)
      {return (
        abbr
          .trim()
          .substring(0, 6)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "") || "CUST"
      );}
    if (cn) {
      const words = cn.trim().split(/\s+/);
      const derived = words
        .map((w) => w.charAt(0))
        .join("")
        .toUpperCase()
        .substring(0, 4);
      if (derived) {return derived;}
    }
    return "CUST";
  };

  // Auto-generate account number from company prefix
  const generateAccountNumber = (existingCustomers) => {
    const prefix = getCompanyAbbreviation();
    const nextNum =
      (existingCustomers?.filter((c) => c.account_number?.startsWith(prefix))
        .length || 0) + 1;
    return `${prefix}-${String(nextNum).padStart(5, "0")}`;
  };

  useEffect(() => {
    fetchCustomers();
    fetchConnections();
    fetchFUPProfiles();
    fetchServicePlans();
    fetchSettings();
  }, []);
  useEffect(() => {
    if (selectedConnection) {fetchOnlineStatus();}
  }, [selectedConnection]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/billing/customers`);
      setCustomers(data);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      toast.error(
        "Failed to load customers",
        error.response?.data?.error || error.message,
      );
    }
    setLoading(false);
  };

  const fetchConnections = async () => {
    try {
      const { data } = await axios.get(`${API}/mikrotik`);
      setConnections(data);
    } catch (error) {
      console.error("Failed to fetch connections:", error);
      toast.error(
        "Failed to load connections",
        error.response?.data?.error || error.message,
      );
    }
  };

  const fetchFUPProfiles = async () => {
    try {
      const { data } = await axios
        .get(`${API}/fup`)
        .catch(() => ({ data: [] }));
      setFupProfiles(data);
    } catch (error) {
      console.error("Failed to fetch FUP profiles:", error);
    }
  };

  const fetchServicePlans = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/plans`);
      setServicePlans(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios
        .get(`${API}/settings`)
        .catch(() => ({ data: {} }));
      setSettings(data.settings || data);
    } catch (error) {
      // Silent
    }
  };

  const fetchOnlineStatus = async () => {
    setOnlineLoading(true);
    try {
      const { data } = await axios.get(
        `${API}/billing/customers/online-status?connection_id=${selectedConnection}`,
      );
      setOnlineData(data.online || {});
    } catch (e) {
      setOnlineData({});
    }
    setOnlineLoading(false);
  };

  const geocodeAddress = async () => {
    const query = [form.address, form.city, form.country]
      .filter(Boolean)
      .join(", ");
    if (!query) {
      toast.error("Enter an address or city first");
      return;
    }
    try {
      const { data } = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      );
      if (data && data.length > 0) {
        setForm({ ...form, lat: data[0].lat, lng: data[0].lon });
        toast.success("Coordinates found");
      } else {
        toast.error("Address not found. Try being more specific.");
      }
    } catch (e) {
      toast.error("Geocoding failed");
    }
  };
  const toggleMapPicker = () => setShowMapPicker((prev) => !prev);

  // Load Google Maps API once
  useEffect(() => {
    if (!GMAPS_KEY) {return;}
    if (window.google?.maps) {return;}
    if (document.getElementById("gmaps-script")) {return;}
    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      GMAPS_KEY +
      "&libraries=places";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Init Google Map when picker shown
  useEffect(() => {
    if (!showMapPicker || pickerMapRef.current) {return;}
    if (!window.google?.maps) {return;}

    requestAnimationFrame(() => {
      if (!mapPickerRef.current || mapPickerRef.current.offsetHeight === 0)
        {return;}
      const lat = parseFloat(form.lat) || -1.2921;
      const lng = parseFloat(form.lng) || 36.8219;
      const map = new window.google.maps.Map(mapPickerRef.current, {
        center: { lat, lng },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
      });
      pickerMapRef.current = map;

      const marker = new window.google.maps.Marker({
        map,
        position: { lat, lng },
        draggable: true,
        visible: !!(form.lat && form.lng),
      });
      pickerMarkerRef.current = marker;

      map.addListener("click", (e) => {
        const pos = e.latLng;
        setForm((prev) => ({
          ...prev,
          lat: pos.lat().toFixed(6),
          lng: pos.lng().toFixed(6),
        }));
        marker.setPosition(pos);
        marker.setVisible(true);
      });

      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        setForm((prev) => ({
          ...prev,
          lat: pos.lat().toFixed(6),
          lng: pos.lng().toFixed(6),
        }));
      });
    });
  }, [showMapPicker, form.lat, form.lng]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = { ...form };
      // Auto-generate account number if not provided
      if (!submitData.account_number && !editing) {
        submitData.account_number = generateAccountNumber(
          submitData.name,
          customers,
        );
      }
      submitData.lat = form.lat || null;
      submitData.lng = form.lng || null;
      if (selectedConnection) {
        submitData.mikrotik_connection_id = selectedConnection;
      }

      if (editing) {
        await axios.put(`${API}/billing/customers/${editing.id}`, submitData);
        toast.success("Customer updated successfully");
      } else {
        const { data } = await axios.post(
          `${API}/billing/customers`,
          submitData,
        );
        toast.success(`Customer created: ${data.account_number || data.name}`);
        // Show portal URL and credentials if returned
        if (data.portal_url) {
          setPortalUrl(data.portal_url);
          setPortalCredentials({
            username: data.portal_username,
            password: data.portal_password,
          });
        }
      }
      setShowForm(false);
      setEditing(null);
      setForm({
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "",
        id_number: "",
        status: "active",
        notes: "",
        account_number: "",
        fup_profile_id: "",
        plan_id: "",
        lat: "",
        lng: "",
      });
      fetchCustomers();
    } catch (error) {
      console.error("Failed to save customer:", error);
      toast.error(
        "Failed to save customer",
        error.response?.data?.error || error.message,
      );
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this customer?")) {return;}
    try {
      await axios.delete(`${API}/billing/customers/${id}`);
      toast.success("Customer deleted");
      fetchCustomers();
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast.error(
        "Failed to delete customer",
        error.response?.data?.error || error.message,
      );
    }
  };

  const editCustomer = (c) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      city: c.city || "",
      country: c.country || "",
      id_number: c.id_number || "",
      status: c.status,
      notes: c.notes || "",
      account_number: c.account_number || "",
      fup_profile_id: c.fup_profile_id || "",
      plan_id: c.subscription?.plan_id || "",
      lat: c.lat || "",
      lng: c.lng || "",
    });
    setShowForm(true);
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBulkPlanChange = async () => {
    if (!bulkPlanId || selectedIds.size === 0) return;
    if (!confirm(`Change plan for ${selectedIds.size} customer(s)?`)) return;
    try {
      const { data } = await axios.post(`${API}/resellers/bulk/plan-change`, {
        customer_ids: [...selectedIds],
        plan_id: bulkPlanId,
      });
      const updated = data.results.filter(r => !r.error).length;
      toast.success(`Plan updated for ${updated} customer(s)`);
      setSelectedIds(new Set());
      setSelectAll(false);
      setBulkPlanId("");
      fetchCustomers();
    } catch (e) { toast.error("Bulk plan change failed"); }
  };

  const handleBulkSuspend = async (action) => {
    if (selectedIds.size === 0) return;
    const label = action === "suspend" ? "suspend" : "activate";
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${selectedIds.size} customer(s)?`)) return;
    try {
      await axios.post(`${API}/resellers/bulk/suspend`, {
        customer_ids: [...selectedIds],
        action,
      });
      toast.success(`${selectedIds.size} customer(s) ${label}d`);
      setSelectedIds(new Set());
      setSelectAll(false);
      fetchCustomers();
    } catch (e) { toast.error(`Bulk ${label} failed`); }
  };

  useEffect(() => {
    if (selectAll) {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    } else if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [selectAll]);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
      (c.phone && c.phone.includes(search)),
  );

  return (
    <>
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">
            Customers ({customers.length})
          </h2>
          <p className="text-slate-400 mt-1">
            Manage customer accounts and contact info
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connections.length > 0 && (
            <select
              value={selectedConnection}
              onChange={(e) => {
                setSelectedConnection(e.target.value);
              }}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">No Router (Offline)</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <Button
            onClick={() => {
              setEditing(null);
              setForm({
                name: "",
                email: "",
                phone: "",
                address: "",
                city: "",
                country: "",
                id_number: "",
                status: "active",
                notes: "",
                account_number: "",
                fup_profile_id: "",
                plan_id: "",
                lat: "",
                lng: "",
              });
              setShowForm(true);
            }}
            className="btn-gradient-primary flex items-center gap-2"
          >
            <UserPlus className="w-5 h-5" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectAll(!selectAll)}
          className="gap-1"
        >
          {selectAll ? "Deselect All" : "Select All"}
        </Button>
        {selectedIds.size > 0 && (
          <>
            <span className="text-sm text-zinc-400">{selectedIds.size} selected</span>
            <select
              value={bulkPlanId}
              onChange={e => setBulkPlanId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Change plan...</option>
              {servicePlans.map(p => (
                <option key={p.id} value={p.id}>{p.name} - {p.price}/mo</option>
              ))}
            </select>
            <Button
              variant="default"
              size="sm"
              disabled={!bulkPlanId}
              onClick={handleBulkPlanChange}
              className="gap-1 bg-blue-600 hover:bg-blue-500"
            >
              <Zap className="w-3.5 h-3.5" /> Apply Plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkSuspend("suspend")}
              className="gap-1 text-amber-400"
            >
              Suspend Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkSuspend("activate")}
              className="gap-1 text-green-400"
            >
              Activate Selected
            </Button>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="pl-10 max-w-md"
        />
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">
            {search
              ? "No results found"
              : "No customers yet. Add your first customer."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((c) => (
            <Card key={c.id} className="card-gradient overflow-hidden">
              <CardHeader className="border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 cursor-pointer"
                    />
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold ${
                        onlineData[c.id]
                          ? "bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-emerald-500/20 text-emerald-400"
                          : "bg-gradient-to-br from-blue-500/20 to-violet-500/20 ring-1 ring-blue-500/10 text-blue-400"
                      }`}
                    >
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{c.name}</CardTitle>
                      {c.account_number && (
                        <p className="text-[11px] text-zinc-500 font-mono">
                          {c.account_number}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      c.status === "active"
                        ? "bg-green-600/20 text-green-400"
                        : "bg-red-600/20 text-red-400"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t border-zinc-800">
                <div className="text-zinc-400">
                  Email:{" "}
                  <span className="text-white truncate block">
                    {c.email || "—"}
                  </span>
                </div>
                <div className="text-zinc-400">
                  Phone: <span className="text-white">{c.phone || "—"}</span>
                </div>
                <div className="text-zinc-400">
                  Location:{" "}
                  <span className="text-white">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
                <div className="text-zinc-400">
                  Subs:{" "}
                  <span className="text-white">{c.subscription_count}</span>
                </div>
                <div className="text-zinc-400">
                  Balance:{" "}
                  <span
                    className={`font-semibold ${c.outstanding_balance > 0 ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    ${c.outstanding_balance.toFixed(2)}
                  </span>
                </div>
                {selectedConnection && (
                  <div className="text-zinc-400">
                    {onlineData[c.id] ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 status-dot" />
                        <span className="text-emerald-400 font-medium">
                          Online
                        </span>
                        {onlineData[c.id].type === "pppoe" ? (
                          <Wifi className="w-3 h-3 text-blue-400" />
                        ) : (
                          <Zap className="w-3 h-3 text-amber-400" />
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-600">Offline</span>
                    )}
                  </div>
                )}
              </CardContent>
              <CardContent className="p-4 border-t border-zinc-800 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/portal/${c.id}`)}
                  className="flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> Portal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStkTarget(c)}
                  className="flex items-center gap-1 text-green-400 border-green-800 hover:bg-green-900/30"
                  title="Send M-Pesa STK Push"
                >
                  <Smartphone className="w-3 h-3" /> M-Pesa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editCustomer(c)}
                  className="flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(c.id)}
                  className="flex items-center gap-1 text-red-400 ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {editing ? "Edit Customer" : "New Customer"}
                  </CardTitle>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {editing
                      ? "Update customer details"
                      : "Add a new subscriber to your network"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer-name">Name *</Label>
                    <Input
                      id="customer-name"
                      required
                      value={form.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        if (!editing && !form.account_number) {
                          const newAccountNum =
                            generateAccountNumber(customers);
                          setForm({
                            ...form,
                            name: newName,
                            account_number: newAccountNum,
                          });
                        } else {
                          setForm({ ...form, name: newName });
                        }
                      }}
                      placeholder="John Kamau"
                    />
                  </div>
                  <div>
                    <Label htmlFor="account-number">Account Number</Label>
                    <Input
                      id="account-number"
                      value={
                        form.account_number || generateAccountNumber(customers)
                      }
                      onChange={(e) =>
                        setForm({ ...form, account_number: e.target.value })
                      }
                      className="font-mono"
                      placeholder="Auto-generated"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Auto-generated from name
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="+254712345678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="id-number">ID Number</Label>
                    <Input
                      id="id-number"
                      value={form.id_number}
                      onChange={(e) =>
                        setForm({ ...form, id_number: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value })
                      }
                      placeholder="Nairobi"
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={(e) =>
                        setForm({ ...form, country: e.target.value })
                      }
                      placeholder="Kenya"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      placeholder="Street address"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lat">Latitude</Label>
                    <Input
                      id="lat"
                      value={form.lat}
                      onChange={(e) =>
                        setForm({ ...form, lat: e.target.value })
                      }
                      placeholder="-1.2921"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lng">Longitude</Label>
                    <Input
                      id="lng"
                      value={form.lng}
                      onChange={(e) =>
                        setForm({ ...form, lng: e.target.value })
                      }
                      placeholder="36.8219"
                    />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={geocodeAddress}
                      className="text-xs"
                    >
                      <Search className="w-3 h-3 mr-1" /> Find Coordinates from
                      Address
                    </Button>
                  </div>
                  <div className="col-span-2 flex items-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={toggleMapPicker}
                      className={`text-xs ${showMapPicker ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : ""}`}
                    >
                      <MapPin className="w-3 h-3 mr-1" />{" "}
                      {showMapPicker ? "Hide Map" : "Pick from Map"}
                    </Button>
                  </div>
                  {showMapPicker && (
                    <div className="col-span-2">
                      <div
                        ref={mapPickerRef}
                        className="w-full h-48 rounded border border-zinc-700 z-0"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Click on the map to set customer location
                      </p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="plan">Service Plan</Label>
                    <select
                      id="plan"
                      value={form.plan_id}
                      onChange={(e) =>
                        setForm({ ...form, plan_id: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">No plan (create customer only)</option>
                      {servicePlans
                        .filter((p) => p.is_active !== false)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — KES {p.price}/mo ({p.speed_up}/
                            {p.speed_down})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="fup-profile">FUP Profile</Label>
                    <select
                      id="fup-profile"
                      value={form.fup_profile_id}
                      onChange={(e) =>
                        setForm({ ...form, fup_profile_id: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="">No FUP Profile</option>
                      {fupProfiles
                        .filter((f) => f.is_active)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.data_limit} {f.data_limit_unit})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <textarea
                      id="notes"
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      rows="2"
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background resize-none"
                      placeholder="Internal notes about this customer..."
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="btn-gradient-primary flex-1">
                    {editing ? "Update Customer" : "Create Customer"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Portal URL Modal */}
      {portalUrl && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-md">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Customer Portal URL</CardTitle>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    Share this link with your customer
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPortalUrl(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-zinc-800 rounded-lg p-4 mb-4">
                <div className="text-sm text-zinc-400 mb-2">Portal Link</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={portalUrl}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white font-mono"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(portalUrl);
                      toast.success("URL copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              {portalCredentials && (
                <div className="bg-zinc-800 rounded-lg p-4 mb-4">
                  <div className="text-sm text-zinc-400 mb-3">
                    Portal Credentials
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Username</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={portalCredentials.username}
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              portalCredentials.username,
                            );
                            toast.success("Username copied to clipboard");
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Password</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={portalCredentials.password}
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              portalCredentials.password,
                            );
                            toast.success("Password copied to clipboard");
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-300">
                  <strong>Note:</strong> This link expires in 30 days. You can
                  regenerate it anytime from the customer details page.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => window.open(portalUrl, "_blank")}
                  className="flex-1"
                >
                  Open Portal
                </Button>
                <Button
                  onClick={() => {
                    setPortalUrl(null);
                    setPortalCredentials(null);
                  }}
                  className="btn-gradient-primary flex-1"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>

      {/* M-Pesa STK Push Modal — triggered from customer card 📱 button */}
      <MpesaStkModal
        open={!!stkTarget}
        onClose={() => setStkTarget(null)}
        onSuccess={() => { setStkTarget(null); fetchCustomers(); }}
        customer={stkTarget}
        invoice={null}
        defaultAmount={undefined}
      />

      {/* Airtel Money Modal */}
      <AirtelStkModal
        open={!!airtelTarget}
        onClose={() => setAirtelTarget(null)}
        onSuccess={() => { setAirtelTarget(null); fetchCustomers(); }}
        customer={airtelTarget}
        invoice={null}
      />

      {/* MTN Mobile Money Modal */}
      <MtnStkModal
        open={!!mtnTarget}
        onClose={() => setMtnTarget(null)}
        onSuccess={() => { setMtnTarget(null); fetchCustomers(); }}
        customer={mtnTarget}
        invoice={null}
      />

      {/* Paystack Modal */}
      <PaystackModal
        open={!!paystackTarget}
        onClose={() => setPaystackTarget(null)}
        onSuccess={() => { setPaystackTarget(null); fetchCustomers(); }}
        customer={paystackTarget}
        invoice={null}
      />
    </>
  );
}
