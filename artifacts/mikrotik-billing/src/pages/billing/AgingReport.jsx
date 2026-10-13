import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, TrendingDown, Users, DollarSign,
  Download, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

function fmt(n) {
  return 'KES ' + (parseFloat(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
}

const BUCKETS = [
  { key: 'days_0_30',    label: '1–30 Days',   totalKey: 'total_0_30',    color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  { key: 'days_31_60',   label: '31–60 Days',  totalKey: 'total_31_60',   color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { key: 'days_61_90',   label: '61–90 Days',  totalKey: 'total_61_90',   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  { key: 'days_over_90', label: '90+ Days',    totalKey: 'total_over_90', color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/30' },
];

export function AgingReport() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`${API}/billing/reports/aging`);
      setData(res);
    } catch (e) {
      toast.error('Failed to load aging report', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const applyPenalties = async () => {
    if (!confirm('Apply late payment penalties to all overdue invoices past the grace period?\n\nThis will add a penalty charge to qualifying invoices.')) return;
    setApplying(true);
    try {
      const { data: res } = await axios.post(`${API}/billing/reports/apply-late-penalties`);
      toast.success(`Penalties applied to ${res.applied?.length || 0} invoices`);
      load();
    } catch (e) {
      toast.error('Failed to apply penalties', e.response?.data?.error || e.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const { summary = {}, customers = [] } = data || {};

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">Accounts Receivable Aging</h2>
          <p className="text-slate-400 mt-1">
            {customers.length} customers with overdue balances
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={load} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button
            onClick={applyPenalties}
            disabled={applying}
            className="btn-gradient-danger flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {applying ? 'Applying...' : 'Apply Late Penalties'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {BUCKETS.map(b => (
          <Card key={b.key} className={`card-gradient border ${b.border}`}>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-400 mb-1">{b.label}</p>
              <p className={`text-lg font-bold ${b.color}`}>{fmt(summary[b.totalKey] || 0)}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="card-gradient border border-rose-500/50">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-400 mb-1">Grand Total</p>
            <p className="text-lg font-bold text-rose-400">{fmt(summary.grand_total || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Table */}
      {customers.length === 0 ? (
        <div className="text-center py-20">
          <TrendingDown className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <p className="text-xl font-semibold text-green-400">All accounts current!</p>
          <p className="text-slate-400 mt-2">No overdue balances found.</p>
        </div>
      ) : (
        <Card className="card-gradient overflow-hidden">
          <CardHeader className="border-b border-zinc-800">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Overdue Accounts ({customers.length})
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="text-left p-4">Customer</th>
                  <th className="text-right p-4">1–30d</th>
                  <th className="text-right p-4">31–60d</th>
                  <th className="text-right p-4">61–90d</th>
                  <th className="text-right p-4">90+d</th>
                  <th className="text-right p-4 text-rose-400">Total Due</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, idx) => (
                  <React.Fragment key={c.customer_id}>
                    <tr
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => setExpanded(expanded === idx ? null : idx)}
                    >
                      <td className="p-4">
                        <p className="font-medium text-white">{c.customer_name}</p>
                        <p className="text-xs text-zinc-400">{c.phone}</p>
                      </td>
                      <td className="p-4 text-right text-amber-400">
                        {parseFloat(c.days_0_30) > 0 ? fmt(c.days_0_30) : '—'}
                      </td>
                      <td className="p-4 text-right text-orange-400">
                        {parseFloat(c.days_31_60) > 0 ? fmt(c.days_31_60) : '—'}
                      </td>
                      <td className="p-4 text-right text-red-400">
                        {parseFloat(c.days_61_90) > 0 ? fmt(c.days_61_90) : '—'}
                      </td>
                      <td className="p-4 text-right text-rose-400">
                        {parseFloat(c.days_over_90) > 0 ? fmt(c.days_over_90) : '—'}
                      </td>
                      <td className="p-4 text-right font-bold text-rose-400">
                        {fmt(c.total_outstanding)}
                      </td>
                      <td className="p-4 text-zinc-500">
                        {expanded === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>
                    {expanded === idx && (
                      <tr className="bg-zinc-900/50">
                        <td colSpan={7} className="p-4">
                          <div className="flex gap-4 text-xs text-zinc-400">
                            <span>📧 {c.email || '—'}</span>
                            <span>📞 {c.phone || '—'}</span>
                            <span>🧾 {c.invoice_count} unpaid invoice{c.invoice_count > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/billing/customers/${c.customer_id}`, '_blank')}
                              className="text-xs"
                            >
                              View Account
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`${API}/billing/customers/${c.customer_id}/statement`, '_blank')}
                              className="text-xs flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> Statement
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-700 bg-zinc-900/50 font-bold">
                  <td className="p-4 text-zinc-300">TOTALS</td>
                  <td className="p-4 text-right text-amber-400">{fmt(summary.total_0_30)}</td>
                  <td className="p-4 text-right text-orange-400">{fmt(summary.total_31_60)}</td>
                  <td className="p-4 text-right text-red-400">{fmt(summary.total_61_90)}</td>
                  <td className="p-4 text-right text-rose-400">{fmt(summary.total_over_90)}</td>
                  <td className="p-4 text-right text-rose-400">{fmt(summary.grand_total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
