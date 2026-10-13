import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LifeBuoy, Plus, Search, Filter, Clock, CheckCircle, AlertCircle, AlertTriangle,
  MessageSquare, User, ArrowUpRight, ArrowDownRight, ChevronDown, RefreshCw,
  Send, Paperclip, Eye, UserCheck, Tag, Hash, Trash2
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const API = import.meta.env.VITE_API_URL || '/api';

function formatTimeAgo(date) {
  if (!date) {return '—';}
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) {return `${mins}m ago`;}
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {return `${hrs}h ago`;}
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({ title, value, icon: Icon, bg, ring, textColor }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover group">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className={`stat-value ${textColor}`}>{value}</div>
      <div className="text-sm text-zinc-400 mt-1">{title}</div>
    </div>
  );
}

export function TicketSystem() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [ticketDetail, setTicketDetail] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes, techRes, catRes] = await Promise.all([
        axios.get(`${API}/tickets`).catch(() => ({ data: [] })),
        axios.get(`${API}/tickets/dashboard/stats`).catch(() => ({ data: {} })),
        axios.get(`${API}/tickets/technicians`).catch(() => ({ data: [] })),
        axios.get(`${API}/tickets/categories`).catch(() => ({ data: [] })),
      ]);
      setTickets(ticketsRes.data);
      setStats(statsRes.data);
      setTechnicians(techRes.data);
      setCategories(catRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchTicketDetail = async (id) => {
    try {
      const { data } = await axios.get(`${API}/tickets/${id}`);
      setTicketDetail(data);
      setSelectedTicket(id);
    } catch (error) { console.error('Failed to fetch ticket detail:', error); toast.error('Failed to load ticket', error.response?.data?.error || error.message); }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      t.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.ticket_number?.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'all' || t.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const priorityColors = {
    low: 'badge-zinc',
    medium: 'badge-blue',
    high: 'badge-amber',
    critical: 'badge-red',
  };

  const statusColors = {
    open: 'badge-blue',
    in_progress: 'badge-amber',
    resolved: 'badge-green',
    closed: 'badge-zinc',
  };

  return (
    <div className="relative min-h-full p-8 animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <LifeBuoy className="w-4 h-4 text-white" />
            </div>
            Support Tickets
          </h1>
          <p className="text-zinc-400 mt-1">Manage customer support requests and SLA tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowCreateForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard title="Open" value={stats.open || 0} icon={AlertCircle} bg="bg-blue-500/10" ring="ring-blue-500/20" textColor="text-blue-400" />
        <StatCard title="In Progress" value={stats.in_progress || 0} icon={Clock} bg="bg-amber-500/10" ring="ring-amber-500/20" textColor="text-amber-400" />
        <StatCard title="Resolved" value={stats.resolved || 0} icon={CheckCircle} bg="bg-emerald-500/10" ring="ring-emerald-500/20" textColor="text-emerald-400" />
        <StatCard title="SLA Breached" value={stats.overdue || 0} icon={AlertTriangle} bg="bg-rose-500/10" ring="ring-rose-500/20" textColor="text-rose-400" />
        <StatCard title="Avg Response" value={`${stats.avg_response_hours || 0}h`} icon={MessageSquare} bg="bg-violet-500/10" ring="ring-violet-500/20" textColor="text-violet-400" />
      </div>

      {/* Tabs + Search */}
      <div className="relative flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          {['all', 'open', 'in_progress', 'resolved', 'closed'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                activeTab === tab ? 'bg-cyan-600 text-white shadow-lg' : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60'
              }`}>
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."
            className="modern-input pl-10 w-full" />
        </div>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="glass rounded-2xl p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : (
        <div className="relative glass rounded-2xl overflow-hidden">
          {filteredTickets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><LifeBuoy className="w-6 h-6 text-zinc-600" /></div>
              <div className="empty-state-title">{search ? 'No tickets found' : 'No tickets yet'}</div>
              <div className="empty-state-desc">Create your first support ticket to get started</div>
            </div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Replies</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t, i) => (
                  <tr key={t.id} onClick={() => fetchTicketDetail(t.id)} className="cursor-pointer hover:bg-zinc-800/20">
                    <td>
                      <div className="min-w-0">
                        <div className="text-white font-medium text-sm truncate">{t.ticket_number}</div>
                        <div className="text-xs text-zinc-500 truncate">{t.subject}</div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-zinc-300">{t.customer_name || 'Guest'}</div>
                      <div className="text-xs text-zinc-500">{t.customer_email || ''}</div>
                    </td>
                    <td>
                      {t.category_name ? (
                        <span className="badge" style={{ backgroundColor: `${t.category_color}20`, color: t.category_color }}>{t.category_name}</span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="text-sm text-zinc-400">{t.assignee_name || <span className="text-zinc-600">Unassigned</span>}</td>
                    <td><span className={`badge ${priorityColors[t.priority] || 'badge-zinc'}`}>{t.priority}</span></td>
                    <td><span className={`badge ${statusColors[t.status] || 'badge-zinc'}`}>{t.status.replace('_', ' ')}</span></td>
                    <td className="text-sm text-zinc-400">{t.reply_count || 0}</td>
                    <td className="text-xs text-zinc-500">{formatTimeAgo(t.last_reply_at || t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ticket Detail Modal */}
      {ticketDetail && (
        <TicketDetailModal ticket={ticketDetail} technicians={technicians} onClose={() => { setTicketDetail(null); setSelectedTicket(null); }}
          onRefresh={() => fetchTicketDetail(ticketDetail.id)} onListRefresh={() => fetchData()} />
      )}

      {/* Create Ticket Modal */}
      {showCreateForm && (
        <CreateTicketModal onClose={() => setShowCreateForm(false)} categories={categories}
          technicians={technicians} onCreated={() => { setShowCreateForm(false); fetchData(); }} />
      )}
    </div>
  );
}

/* ─── Ticket Detail Modal ─── */
function TicketDetailModal({ ticket, technicians, onClose, onRefresh, onListRefresh }) {
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const sendReply = async () => {
    if (!reply.trim()) {return;}
    try {
      await axios.post(`${API}/tickets/${ticket.id}/messages`, { message: reply, is_internal: isInternal });
      setReply('');
      onRefresh();
    } catch (e) { alert('Failed to send reply'); }
  };

  const updateStatus = async (status) => {
    await axios.put(`${API}/tickets/${ticket.id}`, { status });
    onRefresh();
  };

  const assignTech = async (assigneeId) => {
    await axios.put(`${API}/tickets/${ticket.id}`, { assignee_id: assigneeId });
    onRefresh();
  };

  const closeTicket = async () => {
    if (!confirm('Are you sure you want to close this ticket?')) {return;}
    await axios.put(`${API}/tickets/${ticket.id}`, { status: 'closed' });
    onRefresh();
  };

  const deleteTicket = async () => {
    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {return;}
    try {
      await axios.delete(`${API}/tickets/${ticket.id}`);
      onClose();
      onListRefresh();
    } catch (e) {
      alert('Failed to delete ticket');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-zinc-800/50">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-mono text-zinc-500">{ticket.ticket_number}</span>
                <span className={`badge ${ticket.status === 'open' ? 'badge-blue' : ticket.status === 'in_progress' ? 'badge-amber' : ticket.status === 'resolved' ? 'badge-green' : 'badge-zinc'}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
                <span className={`badge ${ticket.priority === 'critical' ? 'badge-red' : ticket.priority === 'high' ? 'badge-amber' : ticket.priority === 'medium' ? 'badge-blue' : 'badge-zinc'}`}>
                  {ticket.priority}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white">{ticket.subject}</h3>
              {ticket.category_name && (
                <div className="flex items-center gap-2 mt-1">
                  <Tag className="w-3 h-3 text-zinc-500" />
                  <span className="text-sm text-zinc-400">{ticket.category_name}</span>
                  {ticket.sla_hours && <span className="text-xs text-zinc-600">• SLA: {ticket.sla_hours}h</span>}
                </div>
              )}
            </div>
            <button onClick={onClose} className="btn-ghost p-2">✕</button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <select onChange={e => updateStatus(e.target.value)} value={ticket.status} className="modern-input text-xs py-1.5 w-auto">
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select onChange={e => assignTech(e.target.value)} value={ticket.assignee_id || ''} className="modern-input text-xs py-1.5 w-auto">
              <option value="">Assign to...</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
              ))}
            </select>
            {ticket.status !== 'closed' && (
              <button onClick={closeTicket} className="btn-secondary text-xs py-1.5 px-3">
                Close Ticket
              </button>
            )}
            {!ticket.assignee_id && (
              <button onClick={deleteTicket} className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="p-6 border-b border-zinc-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 font-semibold">
              {ticket.customer_name?.charAt(0) || 'G'}
            </div>
            <div>
              <div className="text-sm text-white font-medium">{ticket.customer_name || 'Guest'}</div>
              <div className="text-xs text-zinc-500">{ticket.customer_email}{ticket.customer_phone ? ` • ${ticket.customer_phone}` : ''}</div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="p-6 space-y-4">
          {ticket.messages?.map((msg, i) => (
            <div key={msg.id} className={`flex gap-3 ${msg.is_internal ? 'opacity-60' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                msg.author_role === 'admin' || msg.author_role === 'technician' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
              }`}>
                {msg.author_name?.charAt(0) || 'C'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-white font-medium">{msg.author_name || 'Customer'}</span>
                  {msg.is_internal && <span className="badge badge-amber text-[10px]">Internal</span>}
                  <span className="text-xs text-zinc-600">{formatTimeAgo(msg.created_at)}</span>
                </div>
                <div className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.message}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div className="p-6 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-500" />
              <span className="text-xs text-zinc-400">Internal note</span>
            </label>
          </div>
          <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your reply..."
            className="modern-input resize-none mb-3" rows="3" />
          <div className="flex items-center gap-2">
            <button onClick={sendReply} className="btn-primary">
              <Send className="w-4 h-4" /> Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Create Ticket Modal ─── */
function CreateTicketModal({ onClose, categories, technicians, onCreated }) {
  const [form, setForm] = useState({ customer_id: '', category_id: '', subject: '', description: '', priority: 'medium', assignee_id: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/tickets`, form);
      onCreated();
    } catch (e) { alert('Failed to create ticket'); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-lg font-semibold text-white">New Support Ticket</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Subject *</label>
            <input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="modern-input" placeholder="Internet not working" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="modern-input">
                <option value="">General</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="modern-input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Assign To</label>
            <select value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })} className="modern-input">
              <option value="">Unassigned</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description *</label>
            <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="modern-input resize-none" rows="4" placeholder="Describe the issue..." />
          </div>
          <div className="flex gap-3 pt-2 border-t border-zinc-800/50">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create Ticket</button>
          </div>
        </form>
      </div>
    </div>
  );
}
