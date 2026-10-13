import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, DollarSign, TrendingUp, AlertTriangle, Download, Users, Calendar, Filter, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

const API = import.meta.env.VITE_API_URL || '/api';

export function FinancialReports() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('daily');
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [debtors, setDebtors] = useState(null);
  const [tax, setTax] = useState(null);
  const [commissions, setCommissions] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'daily') {fetchDaily();}
    if (activeTab === 'monthly') {fetchMonthly();}
    if (activeTab === 'debtors') {fetchDebtors();}
    if (activeTab === 'tax') {fetchTax();}
    if (activeTab === 'commissions') {fetchCommissions();}
  }, [activeTab]);

  const fetchDaily = async () => {
    setLoading(true);
    try { const { data } = await axios.get(`${API}/portal/reports/daily?date=${date}`); setDaily(data); } catch (error) { console.error('Failed to fetch daily report:', error); toast.error('Failed to load daily report', error.response?.data?.error || error.message); }
    setLoading(false);
  };

  const fetchMonthly = async () => {
    setLoading(true);
    try { const { data } = await axios.get(`${API}/portal/reports/monthly?month=${month}&year=${year}`); setMonthly(data); } catch (error) { console.error('Failed to fetch monthly report:', error); toast.error('Failed to load monthly report', error.response?.data?.error || error.message); }
    setLoading(false);
  };

  const fetchDebtors = async () => {
    setLoading(true);
    try { const { data } = await axios.get(`${API}/portal/reports/debtors`); setDebtors(data); } catch (error) { console.error('Failed to fetch debtors report:', error); toast.error('Failed to load debtors report', error.response?.data?.error || error.message); }
    setLoading(false);
  };

  const fetchTax = async () => {
    setLoading(true);
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
    try { const { data } = await axios.get(`${API}/portal/reports/tax?start_date=${startDate}&end_date=${endDate}`); setTax(data); } catch (error) { console.error('Failed to fetch tax report:', error); toast.error('Failed to load tax report', error.response?.data?.error || error.message); }
    setLoading(false);
  };

  const fetchCommissions = async () => {
    setLoading(true);
    try { const { data } = await axios.get(`${API}/portal/reports/commissions`); setCommissions(data); } catch (error) { console.error('Failed to fetch commissions report:', error); toast.error('Failed to load commissions report', error.response?.data?.error || error.message); }
    setLoading(false);
  };

  const exportCSV = async (type) => {
    try {
      const response = await axios.get(`${API}/portal/reports/export/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${date}.csv`;
      a.click();
    } catch (error) { console.error('Failed to export CSV:', error); toast.error('Export failed', error.response?.data?.error || error.message); }
  };

  const tabs = [
    { id: 'daily', label: 'Daily Collection', icon: Calendar },
    { id: 'monthly', label: 'Monthly Revenue', icon: TrendingUp },
    { id: 'debtors', label: 'Outstanding Debtors', icon: AlertTriangle },
    { id: 'tax', label: 'Tax Report', icon: FileText },
    { id: 'commissions', label: 'Agent Commissions', icon: Users },
  ];

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-white gradient-text mb-6">Financial Reports</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <Button key={tab.id} onClick={() => setActiveTab(tab.id)}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            className={activeTab === tab.id ? 'btn-gradient-primary' : ''}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </Button>
        ))}
      </div>

      {/* Filters */}
      <Card className="card-glow mb-6">
        <CardContent className="p-4 flex items-center gap-4">
          <Filter className="w-4 h-4 text-slate-400" />
        {activeTab === 'daily' && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Date:</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); fetchDaily(); }}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm" />
          </div>
        )}
        {(activeTab === 'monthly' || activeTab === 'tax') && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Month:</label>
            <select value={month} onChange={e => { setMonth(parseInt(e.target.value)); if (activeTab === 'monthly') {fetchMonthly();} else {fetchTax();} }}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm">
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select value={year} onChange={e => { setYear(parseInt(e.target.value)); if (activeTab === 'monthly') {fetchMonthly();} else {fetchTax();} }}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm">
              {Array.from({ length: 20 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        <Button onClick={() => exportCSV(activeTab === 'commissions' ? 'debtors' : activeTab)}
          className="ml-auto btn-gradient-success flex items-center gap-1">
          <Download className="w-3 h-3" /> Export CSV
        </Button>
        </CardContent>
      </Card>

      {loading && <div className="text-slate-400">Loading...</div>}

      {/* Daily Collection */}
      {activeTab === 'daily' && daily && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Collected</div>
                <div className="text-3xl font-bold text-green-400">KES {daily.total_collected.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Payments</div>
                <div className="text-3xl font-bold text-white">{daily.payment_count}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">By Method</div>
                <div className="space-y-1">
                  {Object.entries(daily.by_method).map(([method, amount]) => (
                    <div key={method} className="text-sm"><span className="text-slate-400 capitalize">{method.replace('_', ' ')}</span>: <span className="text-white">KES {amount.toFixed(2)}</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="card-gradient overflow-hidden">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-sm">Payment Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-400">
                  <tr><th className="text-left p-3">Time</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Method</th><th className="text-left p-3">Receipt</th></tr>
                </thead>
                <tbody>
                  {daily.payments.map((p, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <td className="p-3 text-slate-300">{p.time}</td>
                      <td className="p-3 text-white">{p.customer}</td>
                      <td className="p-3 text-green-400 font-semibold">KES {p.amount.toFixed(2)}</td>
                      <td className="p-3 text-slate-300 capitalize">{p.method.replace('_', ' ')}</td>
                      <td className="p-3 text-blue-400 font-mono text-xs">{p.receipt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {daily.payments.length === 0 && <div className="p-8 text-center text-slate-500">No payments today</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Revenue */}
      {activeTab === 'monthly' && monthly && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Invoiced</div>
                <div className="text-2xl font-bold text-white">KES {monthly.total_invoiced.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Collected</div>
                <div className="text-2xl font-bold text-green-400">KES {monthly.total_collected.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Outstanding</div>
                <div className="text-2xl font-bold text-red-400">KES {monthly.outstanding.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Collection Rate</div>
                <div className="text-2xl font-bold text-blue-400">{monthly.collection_rate}</div>
              </CardContent>
            </Card>
          </div>
          {monthly.by_branch.length > 0 && (
            <Card className="card-gradient overflow-hidden">
              <CardHeader className="border-b border-zinc-800">
                <CardTitle className="text-sm">Revenue by Branch</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 text-slate-400">
                    <tr><th className="text-left p-3">Branch</th><th className="text-left p-3">Customers</th><th className="text-left p-3">Revenue</th></tr>
                  </thead>
                  <tbody>
                    {monthly.by_branch.map((b, i) => (
                      <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                        <td className="p-3 text-white">{b.branch}</td>
                        <td className="p-3 text-slate-300">{b.customer_count}</td>
                        <td className="p-3 text-green-400 font-semibold">KES {b.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Outstanding Debtors */}
      {activeTab === 'debtors' && debtors && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Debtors</div>
                <div className="text-3xl font-bold text-white">{debtors.total_debtors}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Outstanding</div>
                <div className="text-3xl font-bold text-red-400">KES {debtors.total_outstanding.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>
          <Card className="card-gradient overflow-hidden">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-sm">Debtor List</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-400">
                  <tr><th className="text-left p-3">Customer</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Outstanding</th><th className="text-left p-3">Invoices</th><th className="text-left p-3">Oldest Due</th><th className="text-left p-3">Days Overdue</th></tr>
                </thead>
                <tbody>
                  {debtors.debtors.map((d, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <td className="p-3 text-white">{d.customer.name}</td>
                      <td className="p-3 text-slate-300">{d.customer.phone}</td>
                      <td className="p-3 text-red-400 font-semibold">KES {d.outstanding.toFixed(2)}</td>
                      <td className="p-3 text-slate-300">{d.invoice_count}</td>
                      <td className="p-3 text-slate-400">{d.oldest_due || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${d.days_overdue > 30 ? 'bg-red-600/20 text-red-400' : d.days_overdue > 14 ? 'bg-amber-600/20 text-amber-400' : 'bg-blue-600/20 text-blue-400'}`}>
                          {d.days_overdue} days
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tax Report */}
      {activeTab === 'tax' && tax && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Revenue (excl. tax)</div>
                <div className="text-2xl font-bold text-white">KES {tax.total_revenue_excluding_tax.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Tax Collected ({tax.tax_rate}%)</div>
                <div className="text-2xl font-bold text-amber-400">KES {tax.total_tax.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Revenue (incl. tax)</div>
                <div className="text-2xl font-bold text-green-400">KES {tax.total_revenue_including_tax.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>
          <Card className="card-gradient overflow-hidden">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-sm">Tax Invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-400">
                  <tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Tax</th><th className="text-left p-3">Total</th><th className="text-left p-3">Date</th></tr>
                </thead>
                <tbody>
                  {tax.invoices.map((inv, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <td className="p-3 text-blue-400 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="p-3 text-white">{inv.customer}</td>
                      <td className="p-3 text-white">KES {inv.amount.toFixed(2)}</td>
                      <td className="p-3 text-amber-400">KES {inv.tax.toFixed(2)}</td>
                      <td className="p-3 text-green-400 font-semibold">KES {inv.total.toFixed(2)}</td>
                      <td className="p-3 text-slate-400">{inv.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent Commissions */}
      {activeTab === 'commissions' && commissions && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Agents</div>
                <div className="text-2xl font-bold text-white">{commissions.total_agents}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Total Commissions</div>
                <div className="text-2xl font-bold text-green-400">KES {commissions.total_commissions.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="card-gradient">
              <CardContent className="p-5">
                <div className="text-sm text-slate-400 mb-1">Pending Payout</div>
                <div className="text-2xl font-bold text-amber-400">KES {commissions.total_pending_payout.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>
          <Card className="card-gradient overflow-hidden">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-sm">Agent Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-400">
                  <tr><th className="text-left p-3">Agent</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Vouchers Sold</th><th className="text-left p-3">Total Sales</th><th className="text-left p-3">Commission</th><th className="text-left p-3">Paid</th><th className="text-left p-3">Pending</th></tr>
                </thead>
                <tbody>
                  {commissions.agents.map((a, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <td className="p-3 text-white">{a.agent.name}</td>
                      <td className="p-3 text-slate-300">{a.agent.phone}</td>
                      <td className="p-3 text-slate-300">{a.vouchers_sold}</td>
                      <td className="p-3 text-white">KES {a.total_sales.toFixed(2)}</td>
                      <td className="p-3 text-green-400 font-semibold">{a.commission_rate}% = KES {a.commission_earned.toFixed(2)}</td>
                      <td className="p-3 text-slate-300">KES {a.commission_paid.toFixed(2)}</td>
                      <td className="p-3 text-amber-400 font-semibold">KES {a.pending_payout.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
