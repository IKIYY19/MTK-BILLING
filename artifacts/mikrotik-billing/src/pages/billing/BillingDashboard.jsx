import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  DollarSign, Users, Package, FileText, CreditCard, TrendingUp,
  AlertTriangle, Clock, ArrowRight, Activity, Plus, UserPlus, Receipt
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── Stat Card with Sparkline ─── */
function StatCard({ label, value, icon: Icon, gradient, bg, ring, textColor, sub, trend }) {
  const numValue = typeof value === 'number' ? value : parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  return (
    <Card className="card-hover group">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`w-5 h-5 ${textColor}`} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className={`stat-value ${textColor}`}>
          {typeof value === 'string' ? value : <AnimatedNumber value={numValue} prefix={value < 0 ? '-' : ''} />}
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-zinc-400">{label}</div>
          {sub && <div className="text-xs text-zinc-500">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Animated Number ─── */
function AnimatedNumber({ value, prefix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 600;
    const steps = 25;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += value / steps;
      setDisplay(Math.round(current * 100) / 100);
      if (current >= value) { clearInterval(timer); setDisplay(value); }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{typeof value === 'number' && value % 1 !== 0 ? display.toFixed(2) : Math.round(display)}</span>;
}

/* ─── Skeleton ─── */
function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/30">
      <div className="flex items-center gap-3">
        <div className="skeleton w-9 h-9 rounded-xl" />
        <div>
          <div className="skeleton w-28 h-4 rounded mb-1.5" />
          <div className="skeleton w-20 h-3 rounded" />
        </div>
      </div>
      <div className="skeleton w-16 h-5 rounded-full" />
    </div>
  );
}

export function BillingDashboard() {
  const [stats, setStats] = useState(null);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/billing/dashboard`),
      axios.get(`${API}/billing/invoices`),
      axios.get(`${API}/billing/payments`),
    ]).then(([s, i, p]) => {
      setStats(s.data);
      setRecentInvoices((i.data.data || i.data).slice(0, 5));
      setRecentPayments((p.data.data || p.data).slice(0, 5));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const s = stats || {};
  const currency = s.currency_symbol || '$';
  const statCards = [
    { label: 'Monthly Revenue', value: s.monthly_revenue ?? 0, icon: DollarSign, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', textColor: 'text-emerald-400', prefix: currency, trend: s.revenue_trend ?? undefined },
    { label: 'MRR', value: s.mrr ?? 0, icon: TrendingUp, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20', textColor: 'text-blue-400', prefix: currency },
    { label: 'ARPU', value: s.arpu ?? 0, icon: Activity, gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20', textColor: 'text-violet-400', prefix: currency },
    { label: 'Active Customers', value: s.active_customers ?? 0, icon: Users, gradient: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20', textColor: 'text-cyan-400', sub: `of ${s.total_customers ?? 0}` },
    { label: 'Active Subs', value: s.active_subscriptions ?? 0, icon: Package, gradient: 'from-green-500 to-green-600', bg: 'bg-green-500/10', ring: 'ring-green-500/20', textColor: 'text-green-400', sub: `of ${s.total_subscriptions ?? 0}` },
    { label: 'Suspended', value: s.suspended_subscriptions ?? 0, icon: Clock, gradient: 'from-red-500 to-red-600', bg: 'bg-red-500/10', ring: 'ring-red-500/20', textColor: 'text-red-400' },
    { label: 'Outstanding', value: s.total_outstanding ?? 0, icon: AlertTriangle, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', textColor: 'text-amber-400', prefix: currency },
    { label: 'Overdue Invoices', value: s.overdue_invoices ?? 0, icon: FileText, gradient: 'from-orange-500 to-orange-600', bg: 'bg-orange-500/10', ring: 'ring-orange-500/20', textColor: 'text-orange-400' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white gradient-text">Billing Dashboard</h2>
        <p className="text-slate-400 mt-1">Manage customers, invoices, payments and revenue</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="card-glow mb-8">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-300">Quick Actions</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate('/billing-customers')} className="btn-gradient-success flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> New Customer
            </Button>
            <Button onClick={() => navigate('/billing-invoices')} className="btn-gradient-primary flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Generate Invoices
            </Button>
            <Button variant="outline" onClick={() => navigate('/billing-payments')} className="flex items-center gap-2 text-green-400">
              <CreditCard className="w-4 h-4" /> Record Payment
            </Button>
            <Button variant="outline" onClick={() => navigate('/billing-wallet')} className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Top Up Wallet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card className="card-gradient">
          <CardHeader className="border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-500" /> Recent Invoices
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/billing-invoices')} className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center">
                <div className="empty-state-icon">
                  <FileText className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="empty-state-desc">No invoices yet</div>
              </div>
            ) : (
              <div className="space-y-0">
                {recentInvoices.map((inv, i) => (
                  <div key={inv.id} className="flex items-center justify-between py-3 border-b border-zinc-800/30 last:border-0 animate-slide-in-right" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800/50 flex items-center justify-center">
                        <span className="text-xs font-semibold text-zinc-400">{inv.invoice_number?.slice(-2) || '??'}</span>
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium">{inv.customer?.name || 'Unknown'}</div>
                        <div className="text-xs text-zinc-500">{inv.invoice_number}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white font-semibold">KES {(inv.total ?? 0).toFixed(2)}</div>
                      <span className={`badge ${inv.status === 'paid' ? 'badge-green' : inv.status === 'partial' ? 'badge-blue' : 'badge-amber'}`}>{inv.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card className="card-gradient">
          <CardHeader className="border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-zinc-500" /> Recent Payments
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/billing-payments')} className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {recentPayments.length === 0 ? (
              <div className="py-8 text-center">
                <div className="empty-state-icon">
                  <CreditCard className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="empty-state-desc">No payments recorded</div>
              </div>
            ) : (
              <div className="space-y-0">
                {recentPayments.map((pay, i) => (
                  <div key={pay.id} className="flex items-center justify-between py-3 border-b border-zinc-800/30 last:border-0 animate-slide-in-right" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium">{pay.customer?.name || 'Unknown'}</div>
                        <div className="text-xs text-zinc-500 capitalize">{pay.method?.replace('_', ' ')} • {pay.receipt_number}</div>
                      </div>
                    </div>
                    <div className="text-emerald-400 font-semibold text-sm">+KES {(pay.amount ?? 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
