import React, { useEffect, useState } from 'react';
import { useToastStore } from '../stores/toastStore';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    border: 'border-l-emerald-500',
    bg: 'bg-zinc-900/95',
    title: 'text-emerald-400',
    text: 'text-zinc-300',
    iconBg: 'bg-emerald-500/10',
  },
  error: {
    icon: XCircle,
    border: 'border-l-rose-500',
    bg: 'bg-zinc-900/95',
    title: 'text-rose-400',
    text: 'text-zinc-300',
    iconBg: 'bg-rose-500/10',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-amber-500',
    bg: 'bg-zinc-900/95',
    title: 'text-amber-400',
    text: 'text-zinc-300',
    iconBg: 'bg-amber-500/10',
  },
  info: {
    icon: Info,
    border: 'border-l-blue-500',
    bg: 'bg-zinc-900/95',
    title: 'text-blue-400',
    text: 'text-zinc-300',
    iconBg: 'bg-blue-500/10',
  },
};

function ToastItem({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
  const Icon = config.icon;
  const DURATION = 4500;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, DURATION);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`group flex items-start gap-3 w-96 p-4 ${config.bg} backdrop-blur-xl border border-zinc-800/60 ${config.border} border-l-4 rounded-xl shadow-2xl shadow-black/40 transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${config.title}`} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className={`text-sm font-semibold ${config.title}`}>{toast.title}</p>
        {toast.message && <p className={`text-xs mt-0.5 leading-relaxed ${config.text}`}>{toast.message}</p>}
      </div>
      <button
        onClick={() => { setIsExiting(true); setTimeout(() => onDismiss(toast.id), 300); }}
        className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800/50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function Toast() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) {return null;}

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-h-[calc(100vh-48px)] overflow-hidden pointer-events-none">
      {toasts.map((toast, i) => (
        <div key={toast.id} className="pointer-events-auto" style={{ animationDelay: `${i * 50}ms` }}>
          <ToastItem toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  );
}
