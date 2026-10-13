import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Zap, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API = import.meta.env.VITE_API_URL || '/api';

export function BillingPlans() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const emptyForm = { name: '', speed_up: '10M', speed_down: '10M', price: 25, quota_gb: '', priority: 8, description: '', plan_type: 'monthly', validity_days: 30 };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchPlans(); }, []);
  const fetchPlans = async () => {
    try { const { data } = await axios.get(`${API}/billing/plans`); setPlans(data); } catch (error) { console.error('Failed to fetch plans:', error); toast.error('Failed to load plans', error.response?.data?.error || error.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API}/billing/plans/${editing.id}`, form);
      } else {
        await axios.post(`${API}/billing/plans`, form);
      }
      setShowForm(false); setEditing(null);
      setForm(emptyForm);
      await fetchPlans();
    } catch (error) {
      toast.error('Failed to save plan', error.response?.data?.error || error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this plan?')) {return;}
    try {
      await axios.delete(`${API}/billing/plans/${id}`);
      await fetchPlans();
    } catch (error) {
      toast.error('Failed to delete plan', error.response?.data?.error || error.message);
    }
  };

  const speeds = ['1M', '2M', '5M', '10M', '15M', '20M', '25M', '50M', '100M', '200M', '500M', '1G'];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white gradient-text">Service Plans ({plans.length})</h2>
          <p className="text-slate-400 mt-1">Manage internet service plans and pricing</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm); }} className="btn-gradient-primary flex items-center gap-2">
          <Plus className="w-5 h-5" /> Add Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">No plans yet. Create your first service plan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <Card key={plan.id} className="card-gradient overflow-hidden">
              <CardHeader className="border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(plan); setForm({ name: plan.name, speed_up: plan.speed_up, speed_down: plan.speed_down, price: plan.price, quota_gb: plan.quota_gb, priority: plan.priority, description: plan.description, plan_type: plan.plan_type || 'monthly', validity_days: plan.validity_days || 30 }); setShowForm(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.id)} className="text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm text-slate-400 mb-4">{plan.description}</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-zinc-800 rounded p-3 text-center">
                    <div className="text-xs text-zinc-400">Speed</div>
                    <div className="text-white font-bold">{plan.speed_up}/{plan.speed_down}</div>
                  </div>
                  <div className="bg-zinc-800 rounded p-3 text-center">
                    <div className="text-xs text-zinc-400">Price</div>
                    <div className="text-green-400 font-bold">KES {plan.price}{plan.plan_type === 'hotspot' ? '' : '/mo'}</div>
                  </div>
                  <div className="bg-zinc-800 rounded p-3 text-center">
                    <div className="text-xs text-zinc-400">Quota</div>
                    <div className="text-white font-bold">{plan.quota_gb ? `${plan.quota_gb}GB` : 'Unlimited'}</div>
                  </div>
                  <div className="bg-zinc-800 rounded p-3 text-center">
                    <div className="text-xs text-zinc-400">Priority</div>
                    <div className="text-white font-bold">{plan.priority}</div>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">{plan.active_subscribers} active subscriber{plan.active_subscribers !== 1 ? 's' : ''}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="card-glow w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle>{editing ? 'Edit Plan' : 'New Plan'}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-5 h-5" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                <div>
                  <Label htmlFor="plan-name">Plan Name *</Label>
                  <Input id="plan-name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Gold 25M" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="plan-type">Service Type</Label>
                    <select id="plan-type" value={form.plan_type} onChange={e => setForm({...form, plan_type: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                      <option value="monthly">Monthly service</option>
                      <option value="hotspot">Hotspot package</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="validity-days">Validity (days)</Label>
                    <Input id="validity-days" type="number" min="1" max="365" required value={form.validity_days} onChange={e => setForm({...form, validity_days: parseInt(e.target.value, 10) || ''})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="speed-up">Upload Speed</Label>
                    <select id="speed-up" value={form.speed_up} onChange={e => setForm({...form, speed_up: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                      {speeds.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="speed-down">Download Speed</Label>
                    <select id="speed-down" value={form.speed_down} onChange={e => setForm({...form, speed_down: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                      {speeds.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Price (KES)</Label>
                    <Input id="price" type="number" min="1" step="0.01" required value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value) || ''})} />
                  </div>
                  <div>
                    <Label htmlFor="quota">Quota (GB, blank=unlimited)</Label>
                    <Input id="quota" type="number" value={form.quota_gb || ''} onChange={e => setForm({...form, quota_gb: e.target.value ? parseInt(e.target.value) : null})} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="priority">Priority (1=highest, 8=lowest)</Label>
                  <Input id="priority" type="number" min="1" max="8" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value)})} />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea id="description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows="2" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background resize-none" />
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
                  <Button type="submit" className="btn-gradient-primary flex-1">{editing ? 'Update' : 'Create'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
