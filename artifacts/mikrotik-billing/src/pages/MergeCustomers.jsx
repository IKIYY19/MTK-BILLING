import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { GitMerge, AlertTriangle, Search, Users, Receipt, CreditCard, Activity, Ticket, Wallet, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useToast } from "../hooks/useToast";

const API = import.meta.env.VITE_API_URL || "/api";

export default function MergeCustomers() {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);

  // Selected
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);

  // Preview stats
  const [sourceStats, setSourceStats] = useState(null);
  const [targetStats, setTargetStats] = useState(null);

  // Merge state
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data } = await axios.get(`${API}/billing/customers`, {
        params: { limit: 1000 },
      });
      setCustomers(data.customers || data || []);
    } catch (e) {
      console.error("Failed to fetch customers:", e);
      toast.error("Failed to load customers", e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredSourceCustomers = useMemo(() => {
    if (!sourceSearch.trim()) {return [];}
    const q = sourceSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          (c.name?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.phone?.includes(q)) &&
          c.id !== target?.id
      )
      .slice(0, 10);
  }, [sourceSearch, customers, target]);

  const filteredTargetCustomers = useMemo(() => {
    if (!targetSearch.trim()) {return [];}
    const q = targetSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          (c.name?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.phone?.includes(q)) &&
          c.id !== source?.id
      )
      .slice(0, 10);
  }, [targetSearch, customers, source]);

  const selectSource = async (customer) => {
    setSource(customer);
    setSourceSearch(customer.name);
    setSourceDropdownOpen(false);
    setResult(null);
    await fetchCustomerStats(customer.id, "source");
  };

  const selectTarget = async (customer) => {
    setTarget(customer);
    setTargetSearch(customer.name);
    setTargetDropdownOpen(false);
    setResult(null);
    await fetchCustomerStats(customer.id, "target");
  };

  const fetchCustomerStats = async (customerId, type) => {
    try {
      const { data } = await axios.get(`${API}/billing/customers/${customerId}`);
      const stats = {
        invoices: data.invoices?.length || 0,
        payments: data.payments?.length || 0,
        subscriptions: data.subscriptions?.length || 0,
        tickets: data.tickets?.length || 0,
        wallet: data.wallet?.balance || 0,
      };
      if (type === "source") {setSourceStats(stats);}
      else {setTargetStats(stats);}
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  };

  const handleMerge = async () => {
    if (!source || !target) {return;}
    setMerging(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/billing/customers/merge`, {
        source_id: source.id,
        target_id: target.id,
      });
      setResult(data);
      toast.success("Customers merged successfully");
      // Refresh customer list
      fetchCustomers();
      // Reset selections
      setSource(null);
      setTarget(null);
      setSourceSearch("");
      setTargetSearch("");
      setSourceStats(null);
      setTargetStats(null);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setResult({ error: msg });
      toast.error("Merge failed", msg);
    } finally {
      setMerging(false);
    }
  };

  const canMerge =
    source && target && source.id !== target.id && !merging;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
      </div>
    );
  }

  const StatBadge = ({ icon: Icon, label, value, color = "text-zinc-400" }) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-white ml-auto">{value}</span>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <GitMerge className="w-7 h-7 text-purple-400" />
          Merge Customers
        </h2>
        <p className="mt-2 text-sm text-zinc-400 max-w-2xl">
          Combine duplicate customer accounts. All invoices, payments,
          subscriptions, and tickets from the source customer will be moved to
          the target customer. Wallet balances are summed.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Source Customer */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              Source Customer
            </CardTitle>
            <CardDescription>
              All data will be moved from this customer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search customer by name, email, or phone..."
                value={sourceSearch}
                onChange={(e) => {
                  setSourceSearch(e.target.value);
                  setSourceDropdownOpen(true);
                  if (!e.target.value.trim()) {setSource(null);}
                }}
                onFocus={() => setSourceDropdownOpen(true)}
                onBlur={() => setTimeout(() => setSourceDropdownOpen(false), 200)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
              />
              {sourceDropdownOpen && filteredSourceCustomers.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                  {filteredSourceCustomers.map((c) => (
                    <button
                      key={c.id}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700/50 transition-colors ${
                        source?.id === c.id
                          ? "bg-amber-500/10 text-amber-400"
                          : "text-zinc-300"
                      }`}
                      onMouseDown={() => selectSource(c)}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-zinc-500">
                        {c.email || c.phone || "No contact info"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {source && (
              <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold">{source.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      source.status === "active"
                        ? "bg-green-600/20 text-green-400"
                        : source.status === "merged"
                          ? "bg-purple-600/20 text-purple-400"
                          : "bg-zinc-600/20 text-zinc-400"
                    }`}
                  >
                    {source.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  {source.email && <div>{source.email}</div>}
                  {source.phone && <div>{source.phone}</div>}
                  <div className="text-zinc-600 font-mono mt-1">
                    ID: {source.id}
                  </div>
                </div>
                {sourceStats && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <StatBadge
                      icon={Receipt}
                      label="Invoices"
                      value={sourceStats.invoices}
                      color="text-blue-400"
                    />
                    <StatBadge
                      icon={CreditCard}
                      label="Payments"
                      value={sourceStats.payments}
                      color="text-green-400"
                    />
                    <StatBadge
                      icon={Activity}
                      label="Subscriptions"
                      value={sourceStats.subscriptions}
                      color="text-cyan-400"
                    />
                    <StatBadge
                      icon={Wallet}
                      label="Wallet"
                      value={`KES ${sourceStats.wallet.toFixed(2)}`}
                      color="text-emerald-400"
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Customer */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Target Customer
            </CardTitle>
            <CardDescription>
              All data will be moved into this customer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search customer by name, email, or phone..."
                value={targetSearch}
                onChange={(e) => {
                  setTargetSearch(e.target.value);
                  setTargetDropdownOpen(true);
                  if (!e.target.value.trim()) {setTarget(null);}
                }}
                onFocus={() => setTargetDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTargetDropdownOpen(false), 200)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
              />
              {targetDropdownOpen && filteredTargetCustomers.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                  {filteredTargetCustomers.map((c) => (
                    <button
                      key={c.id}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700/50 transition-colors ${
                        target?.id === c.id
                          ? "bg-green-500/10 text-green-400"
                          : "text-zinc-300"
                      }`}
                      onMouseDown={() => selectTarget(c)}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-zinc-500">
                        {c.email || c.phone || "No contact info"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {target && (
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold">{target.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      target.status === "active"
                        ? "bg-green-600/20 text-green-400"
                        : "bg-zinc-600/20 text-zinc-400"
                    }`}
                  >
                    {target.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  {target.email && <div>{target.email}</div>}
                  {target.phone && <div>{target.phone}</div>}
                  <div className="text-zinc-600 font-mono mt-1">
                    ID: {target.id}
                  </div>
                </div>
                {targetStats && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <StatBadge
                      icon={Receipt}
                      label="Invoices"
                      value={targetStats.invoices}
                      color="text-blue-400"
                    />
                    <StatBadge
                      icon={CreditCard}
                      label="Payments"
                      value={targetStats.payments}
                      color="text-green-400"
                    />
                    <StatBadge
                      icon={Activity}
                      label="Subscriptions"
                      value={targetStats.subscriptions}
                      color="text-cyan-400"
                    />
                    <StatBadge
                      icon={Wallet}
                      label="Wallet"
                      value={`KES ${targetStats.wallet.toFixed(2)}`}
                      color="text-emerald-400"
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Warning */}
      {source && target && (
        <Card className="bg-red-500/5 border-red-500/20 mb-8">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-red-400 font-semibold text-sm mb-1">
                This action cannot be undone
              </div>
              <p className="text-sm text-zinc-400">
                All data from{" "}
                <span className="text-amber-400 font-medium">
                  {source.name}
                </span>{" "}
                will be transferred to{" "}
                <span className="text-green-400 font-medium">
                  {target.name}
                </span>
                . The source customer will be deactivated with status "merged".
              </p>
            </div>
          </CardContent>
          <CardFooter className="px-4 pb-4 pt-0">
            <Button
              onClick={handleMerge}
              disabled={!canMerge}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {merging ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="w-4 h-4" />
                  Merge {source.name} into {target.name}
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Results Panel */}
      {result && (
        <Card
          className={`border ${
            result.error
              ? "bg-red-500/5 border-red-500/20"
              : "bg-green-500/5 border-green-500/20"
          }`}
        >
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              {result.error ? (
                <>
                  <XCircle className="w-5 h-5 text-red-400" />
                  Merge Failed
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  Merge Complete
                </>
              )}
            </CardTitle>
            {!result.error && (
              <CardDescription>
                Successfully merged{" "}
                <span className="text-amber-400">{result.source_name}</span>{" "}
                into{" "}
                <span className="text-green-400">{result.target_name}</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {result.error ? (
              <p className="text-red-400 text-sm">{result.error}</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Receipt className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-white">
                    {result.invoices}
                  </div>
                  <div className="text-xs text-zinc-500">Invoices</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <CreditCard className="w-4 h-4 text-green-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-white">
                    {result.payments}
                  </div>
                  <div className="text-xs text-zinc-500">Payments</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Activity className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-white">
                    {result.subscriptions}
                  </div>
                  <div className="text-xs text-zinc-500">Subscriptions</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Ticket className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-white">
                    {result.tickets}
                  </div>
                  <div className="text-xs text-zinc-500">Tickets</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Wallet className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="text-xl font-bold text-white">
                    KES {result.wallet.toFixed(2)}
                  </div>
                  <div className="text-xs text-zinc-500">Wallet</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
