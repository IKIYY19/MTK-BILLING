import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Copy, Download, ArrowLeft, AlertTriangle, CheckCircle2, Terminal, FileText } from 'lucide-react';

export function ScriptOutput() {
  const { generatedScript, validation, loading } = useStore();
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([generatedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mikrotik-config-${Date.now()}.rsc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!generatedScript && !loading) {
    return (
      <div className="p-8 text-center">
        <div className="empty-state">
          <div className="empty-state-icon"><Terminal className="w-7 h-7 text-zinc-600" /></div>
          <div className="empty-state-title">No script generated yet</div>
          <div className="empty-state-desc">Configure modules in a project first, then generate</div>
          <button onClick={() => navigate(-1)} className="btn-primary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  const lines = generatedScript?.split('\n').length || 0;

  return (
    <div className="relative min-h-full animate-fade-in">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="btn-ghost">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white">Generated Script</h2>
              <p className="text-sm text-zinc-400 mt-0.5">{lines} lines of RouterOS CLI</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCopy} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              copied ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/20' : 'btn-secondary'
            }`}>
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={handleDownload} className="btn-success">
              <Download className="w-4 h-4" />
              Download .rsc
            </button>
          </div>
        </div>

        {/* Validation */}
        {validation && (
          <div className={`glass rounded-2xl p-4 mb-6 flex items-center gap-3 ${
            validation.valid
              ? 'border-l-4 border-l-emerald-500'
              : 'border-l-4 border-l-amber-500'
          }`}>
            {validation.valid ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <div>
              <div className={`text-sm font-semibold ${validation.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {validation.valid ? 'Validation Passed' : 'Validation Warnings'}
              </div>
              {!validation.valid && validation.errors.length > 0 && (
                <ul className="text-xs text-zinc-400 mt-1 space-y-0.5">
                  {validation.errors.slice(0, 3).map((err, i) => (
                    <li key={i}>• {err.module}: {err.error}</li>
                  ))}
                  {validation.errors.length > 3 && (
                    <li className="text-zinc-500">+{validation.errors.length - 3} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Script Output */}
        <div className="glass-strong rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/50">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400 font-mono">mikrotik-config.rsc</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            </div>
          </div>
          <pre className="p-6 text-sm text-emerald-400 font-mono overflow-auto max-h-[calc(100vh-300px)] leading-relaxed">
            {generatedScript}
          </pre>
        </div>
      </div>
    </div>
  );
}
