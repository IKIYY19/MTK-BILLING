import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, LayoutDashboard, Network, Link, HardDrive, FileCode, Server, DollarSign, Users, Package, CreditCard, Receipt, MessageSquare, MessageCircle, MapPin, Wallet, Activity, UserCheck, Shield, FileText as FileText2, Database, TrendingUp, Wifi, Ticket, LifeBuoy, Palette, Radio, Settings as SettingsIcon } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const SEARCH_ITEMS = [
  // Main navigation
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', category: 'Main' },
  { to: '/topology', icon: Network, label: 'Topology', category: 'Main' },
  { to: '/routers', icon: Link, label: 'Routers', category: 'Main' },
  { to: '/router-link', icon: Link, label: 'Router Link', category: 'Main' },
  { to: '/devices', icon: HardDrive, label: 'Provisioning', category: 'Main' },
  { to: '/templates', icon: FileCode, label: 'Templates', category: 'Main' },
  { to: '/mikrotik-api', icon: Server, label: 'MikroTik API', category: 'Main' },
  { to: '/integrations', icon: Shield, label: 'Integrations', category: 'Main' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings', category: 'Main' },
  // Billing
  { to: '/billing', icon: DollarSign, label: 'Billing Overview', category: 'Billing' },
  { to: '/billing-customers', icon: Users, label: 'Customers', category: 'Billing' },
  { to: '/billing-plans', icon: Package, label: 'Plans', category: 'Billing' },
  { to: '/billing-subscriptions', icon: Activity, label: 'Subscriptions', category: 'Billing' },
  { to: '/billing-invoices', icon: Receipt, label: 'Invoices', category: 'Billing' },
  { to: '/billing-payments', icon: CreditCard, label: 'Payments', category: 'Billing' },
  { to: '/billing-wallet', icon: Wallet, label: 'Wallet', category: 'Billing' },
  { to: '/billing-sms', icon: MessageSquare, label: 'SMS', category: 'Billing' },
  { to: '/billing-whatsapp', icon: MessageCircle, label: 'WhatsApp', category: 'Billing' },
  { to: '/billing-map', icon: MapPin, label: 'Network Map', category: 'Billing' },
  { to: '/billing-monitoring', icon: Activity, label: 'Monitoring', category: 'Billing' },
  { to: '/billing-agents', icon: UserCheck, label: 'Agents', category: 'Billing' },
  { to: '/billing-auto-suspend', icon: Shield, label: 'Auto-Suspend', category: 'Billing' },
  { to: '/billing-reports', icon: FileText2, label: 'Reports', category: 'Billing' },
  { to: '/analytics', icon: TrendingUp, label: 'Analytics', category: 'Billing' },
  { to: '/pppoe', icon: Network, label: 'PPPoE', category: 'Billing' },
  { to: '/hotspot', icon: Wifi, label: 'Hotspot', category: 'Billing' },
  { to: '/hotspot-vouchers', icon: Ticket, label: 'Vouchers', category: 'Billing' },
  { to: '/network-services', icon: Server, label: 'Network Services', category: 'Billing' },
  { to: '/olt', icon: Radio, label: 'OLT/Fiber', category: 'Billing' },
  { to: '/radius', icon: Shield, label: 'RADIUS', category: 'Billing' },
  { to: '/tickets', icon: LifeBuoy, label: 'Support Tickets', category: 'Billing' },
  { to: '/captive-portal', icon: Palette, label: 'Portal Builder', category: 'Billing' },
  { to: '/bandwidth', icon: Activity, label: 'Bandwidth', category: 'Billing' },
  { to: '/resellers', icon: UserCheck, label: 'Resellers', category: 'Billing' },
  { to: '/billing-backup', icon: Database, label: 'Backups', category: 'Billing' },
  { to: '/inventory', icon: Package, label: 'Inventory', category: 'Billing' },
];

export function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query) {
      setResults(SEARCH_ITEMS.slice(0, 8));
      setSelectedIndex(0);
      return;
    }

    const q = query.toLowerCase();
    const filtered = SEARCH_ITEMS.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
    setResults(filtered);
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) {return;}
      
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' && results.length > 0) {
        navigate(results[selectedIndex].to);
        onClose();
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, navigate, onClose]);

  const handleSelect = (item) => {
    navigate(item.to);
    onClose();
    setQuery('');
  };

  if (!isOpen) {return null;}

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <Search className="w-5 h-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, features, settings..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 outline-none text-sm"
          />
          <kbd className="px-2 py-1 text-xs text-zinc-500 bg-zinc-800 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="p-2">
              {results.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.to}
                    onClick={() => handleSelect(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isSelected ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.category}</div>
                    </div>
                    {isSelected && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↵</kbd> Select
            </span>
          </div>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

export function SearchButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all"
    >
      <Search className="w-4 h-4" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs text-zinc-500 bg-zinc-800 rounded">⌘K</kbd>
    </button>
  );
}
