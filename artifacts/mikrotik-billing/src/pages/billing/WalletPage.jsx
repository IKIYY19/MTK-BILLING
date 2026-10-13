import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Wallet, Plus, Minus, DollarSign, Clock, AlertTriangle, CheckCircle, Smartphone } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

export function WalletPage() {
  const toast = useToast();
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showTopup, setShowTopup] = useState(false);
  const [topupForm, setTopupForm] = useState({ customer_id: '', amount: '', method: 'mpesa' });
  const [topupResult, setTopupResult] = useState(null);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const { data } = await axios.get(`${API}/advanced/wallet/all`);
      setWallets(data);
    } catch (error) { console.error('Failed to fetch wallets:', error); toast.error('Failed to load wallets', error.response?.data?.error || error.message); }
  };

  const selectWallet = async (w) => {
    setSelectedWallet(w);
    try {
      const { data } = await axios.get(`${API}/advanced/wallet/${w.customer_id}`);
      setTransactions(data.transactions || []);
    } catch (error) { console.error('Failed to fetch wallet transactions:', error); toast.error('Failed to load transactions', error.response?.data?.error || error.message); }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    setTopupResult(null);
    try {
      const { data } = await axios.post(`${API}/advanced/wallet/${topupForm.customer_id}/topup`, {
        amount: parseFloat(topupForm.amount),
        method: topupForm.method,
        reference: `TOPUP-${Date.now()}`,
      });
      setTopupResult(data);
      fetchWallets();
      if (selectedWallet?.customer_id === topupForm.customer_id) {selectWallet(selectedWallet);}
    } catch (e) {
      setTopupResult({ error: e.response?.data?.error || e.message });
    }
  };

  const runDailyDeductions = async () => {
    try {
      const { data } = await axios.post(`${API}/advanced/wallet/daily-run`);
      alert(`Deducted: ${data.deducted.length}, Suspended: ${data.suspended.length}`);
      fetchWallets();
    } catch (error) { console.error('Failed to run daily deductions:', error); toast.error('Daily deductions failed', error.response?.data?.error || error.message); }
  };

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  const activeWallets = wallets.filter(w => w.status === 'active').length;
  const suspendedWallets = wallets.filter(w => w.status === 'suspended').length;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-green-400" /> Prepaid Wallet System
          </h2>
          <p className="text-sm text-slate-400">Daily deductions, auto-suspend when empty</p>
        </div>
        <div className="flex gap-3">
          <button onClick={runDailyDeductions} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4" /> Run Daily Deductions
          </button>
          <button onClick={() => setShowTopup(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Top Up Wallet
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Total Balance</div>
          <div className="text-2xl font-bold text-green-400">KES {totalBalance.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Active</div>
          <div className="text-2xl font-bold text-white">{activeWallets}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Suspended</div>
          <div className="text-2xl font-bold text-red-400">{suspendedWallets}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Customers</div>
          <div className="text-2xl font-bold text-white">{wallets.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wallet List */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700"><h3 className="text-white font-semibold">Customer Wallets</h3></div>
          <div className="max-h-96 overflow-y-auto">
            {wallets.map(w => (
              <div key={w.id} onClick={() => selectWallet(w)}
                className={`p-3 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 ${
                  selectedWallet?.id === w.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''
                }`}>
                <div className="flex items-center justify-between">
                  <div className="text-white text-sm">{w.customer_name}</div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    w.status === 'active' ? 'bg-green-600/20 text-green-400' :
                    w.status === 'suspended' ? 'bg-red-600/20 text-red-400' :
                    'bg-slate-600/20 text-slate-400'
                  }`}>{w.status}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-green-400 font-semibold">KES {w.balance.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">Daily: KES {w.daily_rate.toFixed(2)}</div>
                </div>
                {w.expires_at && (
                  <div className="text-xs text-slate-500 mt-1">Expires: {new Date(w.expires_at).toLocaleDateString()}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-white font-semibold">
              {selectedWallet ? `Transactions - ${selectedWallet.customer_name}` : 'Select a wallet'}
            </h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No transactions</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Amount</th>
                  <th className="text-left p-3">Method</th>
                  <th className="text-left p-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-t border-slate-700">
                    <td className="p-3 text-slate-400 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`flex items-center gap-1 ${
                        t.type === 'credit' ? 'text-green-400' : t.type === 'debit' ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {t.type === 'credit' ? <Plus className="w-3 h-3" /> : t.type === 'debit' ? <Minus className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {t.type}
                      </span>
                    </td>
                    <td className={`p-3 font-semibold ${t.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.type === 'credit' ? '+' : '-'}KES {t.amount.toFixed(2)}
                    </td>
                    <td className="p-3 text-slate-300 capitalize">{t.method.replace('_', ' ')}</td>
                    <td className="p-3 text-white">KES {t.balance_after.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Topup Modal */}
      {showTopup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-full max-w-md p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-400" /> Top Up Wallet
            </h3>
            <form onSubmit={handleTopup} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Customer</label>
                <select required value={topupForm.customer_id} onChange={e => setTopupForm({...topupForm, customer_id: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                  <option value="">Select customer</option>
                  {wallets.map(w => <option key={w.customer_id} value={w.customer_id}>{w.customer_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Amount (KES)</label>
                <input type="number" required value={topupForm.amount} onChange={e => setTopupForm({...topupForm, amount: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Payment Method</label>
                <select value={topupForm.method} onChange={e => setTopupForm({...topupForm, method: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              {topupResult && (
                <div className={`p-3 rounded text-sm ${topupResult.error ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400'}`}>
                  {topupResult.error || `Topped up KES ${topupResult.wallet?.balance.toFixed(2)}`}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowTopup(false)} className="flex-1 px-4 py-2 bg-slate-700 text-white rounded">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded">Top Up</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
