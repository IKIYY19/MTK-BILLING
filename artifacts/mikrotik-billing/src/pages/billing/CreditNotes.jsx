import React, { useEffect, useState } from "react";
import axios from "axios";
import { FileText, Plus, Search, X, Loader2, ArrowLeft, Trash2, Check, Clock, Ban } from "lucide-react";
import { useToastStore } from "../../stores/toastStore";
import { getToken } from "../../lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

export default function CreditNotes() {
  const addToast = useToastStore((state) => state.addToast);
  const toast = {
    success: (msg) => addToast("success", msg, "", 3000),
    error:   (msg) => addToast("error",   msg, "", 4000),
  };
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [form, setForm] = useState({
    customer_id: "",
    invoice_id: "",
    amount: "",
    reason: "",
  });

  useEffect(() => { fetchNotes(); fetchCustomers(); }, []);

  const fetchNotes = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/billing/credit-notes`, { headers: { Authorization: `Bearer ${token}` } });
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) { toast.error("Failed to load credit notes"); }
    finally { setLoading(false); }
  };

  const fetchCustomers = async () => {
    try {
      const token = getToken();
      const { data } = await axios.get(`${API}/billing/customers?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
      setCustomers(data?.data || data || []);
    } catch (e) {
      console.warn("Failed to fetch customers:", e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.amount) { toast.error("Customer and amount are required"); return; }
    setSubmitting(true);
    try {
      const token = getToken();
      await axios.post(`${API}/billing/credit-notes`, form, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Credit note issued");
      setShowForm(false);
      setForm({ customer_id: "", invoice_id: "", amount: "", reason: "" });
      setSelectedCustomer(null);
      fetchNotes();
    } catch (e) { toast.error("Failed", e.response?.data?.error); }
    finally { setSubmitting(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      const token = getToken();
      if (status === "applied") {
        await axios.post(`${API}/billing/credit-notes/${id}/apply`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API}/billing/credit-notes/${id}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success(`Credit note ${status}`);
      fetchNotes();
    } catch (e) { toast.error(e.response?.data?.error || "Failed to update"); }
  };

  const filtered = notes.filter(n => {
    if (!search) {return true;}
    const s = search.toLowerCase();
    return (n.credit_note_number || "").toLowerCase().includes(s)
      || (n.customer_name || "").toLowerCase().includes(s)
      || (n.reason || "").toLowerCase().includes(s);
  });

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || "").includes(customerSearch))
    : [];

  if (loading) {return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;}

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credit Notes</h1>
          <p className="text-zinc-400 text-sm mt-1">Issue refunds and credit adjustments</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Issue Credit Note"}
        </Button>
      </div>

      {showForm && (
      <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><FileText className="w-5 h-5 text-zinc-400" />New Credit Note</CardTitle>
            <CardDescription>Issue a credit to a customer's account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Customer</Label>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 mt-1 p-2 bg-zinc-800/50 rounded-lg">
                    <span className="text-white text-sm">{selectedCustomer.name}</span>
                    <span className="text-zinc-500 text-xs">({selectedCustomer.phone || selectedCustomer.email})</span>
                    <button type="button" onClick={() => { setSelectedCustomer(null); setForm({ ...form, customer_id: "" }); }} className="ml-auto text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="relative mt-1">
                    <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer by name or phone..." className="bg-zinc-800/50 border-zinc-700/50 text-white" />
                    {filteredCustomers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.slice(0, 10).map(c => (
                          <button key={c.id} type="button" onClick={() => { setSelectedCustomer(c); setForm({ ...form, customer_id: c.id }); setCustomerSearch(""); }} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700">
                            {c.name} <span className="text-zinc-500">{c.phone || c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (KES)</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500" className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1" required />
                </div>
                <div>
                  <Label>Invoice # (optional)</Label>
                  <Input value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} placeholder="INV-2026-0001" className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Service downtime compensation, goodwill, etc." className="bg-zinc-800/50 border-zinc-700/50 text-white mt-1" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Issue Credit Note
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search credit notes..." className="pl-10 bg-zinc-800/50 border-zinc-700/50 text-white" />
        </div>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800/50">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No credit notes found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Credit Note #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((note) => (
                  <tr key={note.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-white font-mono">{note.credit_note_number}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{note.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{note.invoice_number || "—"}</td>
                    <td className="px-4 py-3 text-sm text-orange-400 font-medium">{parseFloat(note.amount).toLocaleString()} KES</td>
                    <td className="px-4 py-3 text-sm text-zinc-400 max-w-[200px] truncate">{note.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        note.status === "approved" ? "bg-green-500/10 text-green-400" :
                        note.status === "rejected" ? "bg-red-500/10 text-red-400" :
                        note.status === "applied" ? "bg-blue-500/10 text-blue-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      }`}>
                        {note.status === "pending" && <Clock className="w-3 h-3" />}
                        {note.status === "approved" && <Check className="w-3 h-3" />}
                        {note.status === "rejected" && <Ban className="w-3 h-3" />}
                        {note.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {note.status === "pending" && (
                          <>
                            <button onClick={() => updateStatus(note.id, "approved")} className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10" title="Approve"><Check className="w-4 h-4" /></button>
                            <button onClick={() => updateStatus(note.id, "rejected")} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" title="Reject"><X className="w-4 h-4" /></button>
                          </>
                        )}
                        {note.status === "approved" && (
                          <button onClick={() => updateStatus(note.id, "applied")} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10" title="Mark as Applied"><Check className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
