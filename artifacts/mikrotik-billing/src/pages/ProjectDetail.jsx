import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { InterfacesModule } from '../modules/InterfacesModule';
import { IPConfigModule } from '../modules/IPConfigModule';
import { RoutingModule } from '../modules/RoutingModule';
import { FirewallModule } from '../modules/FirewallModule';
import { ISPModule } from '../modules/ISPModule';
import { BandwidthModule } from '../modules/BandwidthModule';
import { VPNModule } from '../modules/VPNModule';
import { LoadBalancingModule } from '../modules/LoadBalancingModule';
import { WirelessModule } from '../modules/WirelessModule';
import { SystemModule } from '../modules/SystemModule';
import { Save, Code, ArrowLeft, Check, Sparkles } from 'lucide-react';

const MODULES = [
  { id: 'interfaces', label: 'Interfaces', short: 'Interfaces', icon: '🔌' },
  { id: 'ipconfig', label: 'IP Configuration', short: 'IP Config', icon: '🌐' },
  { id: 'routing', label: 'Routing', short: 'Routing', icon: '🛣️' },
  { id: 'firewall', label: 'Firewall & NAT', short: 'Firewall', icon: '🛡️' },
  { id: 'isp', label: 'ISP Services', short: 'ISP', icon: '📡' },
  { id: 'bandwidth', label: 'Bandwidth', short: 'QoS', icon: '⚡' },
  { id: 'vpn', label: 'VPN & Tunnels', short: 'VPN', icon: '🔒' },
  { id: 'loadbalancing', label: 'Load Balancing', short: 'Load Bal', icon: '⚖️' },
  { id: 'wireless', label: 'Wireless', short: 'WiFi', icon: '📶' },
  { id: 'system', label: 'System', short: 'System', icon: '⚙️' },
];

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentProject, selectProject, modules, updateModule, saveModules, generateScript, loading } = useStore();
  const [activeModule, setActiveModule] = useState(MODULES[0].id);
  const [saved, setSaved] = useState(false);

  useEffect(() => { selectProject(id); }, [id]);

  const handleSave = async () => {
    await saveModules();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleGenerate = async () => {
    await handleSave();
    const result = await generateScript();
    if (result) {navigate('/output');}
  };

  const moduleComponents = {
    interfaces: InterfacesModule,
    ipconfig: IPConfigModule,
    routing: RoutingModule,
    firewall: FirewallModule,
    isp: ISPModule,
    bandwidth: BandwidthModule,
    vpn: VPNModule,
    loadbalancing: LoadBalancingModule,
    wireless: WirelessModule,
    system: SystemModule,
  };

  const ActiveModuleComponent = moduleComponents[activeModule];

  if (!currentProject) {return <div className="p-8 text-zinc-400">Loading...</div>;}

  const configuredModules = MODULES.filter(m => modules[m.id] && Object.keys(modules[m.id]).length > 0).length;

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-noise" />

      {/* Header */}
      <div className="relative glass border-b border-zinc-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800/50">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{currentProject.name}</h2>
                <span className="badge badge-blue text-[10px]">{currentProject.routeros_version}</span>
              </div>
              <p className="text-sm text-zinc-400 mt-0.5">{configuredModules}/{MODULES.length} modules configured</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
              <div className="status-dot active" />
              {currentProject.routeros_version}
            </div>
            <button
              onClick={handleSave}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                saved
                  ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/20'
                  : 'btn-secondary'
              } disabled:opacity-50`}
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || configuredModules === 0}
              className="btn-primary disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              Generate Script
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Module Tabs */}
        <div className="w-56 glass border-r border-zinc-800/50 overflow-y-auto">
          <div className="p-3">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-3 py-2">Modules</div>
            <div className="space-y-0.5">
              {MODULES.map((mod) => {
                const isConfigured = modules[mod.id] && Object.keys(modules[mod.id]).length > 0;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setActiveModule(mod.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                      activeModule === mod.id
                        ? 'bg-blue-500/10 text-blue-400 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                    }`}
                  >
                    <span className="text-base">{mod.icon}</span>
                    <span className="truncate text-left">{mod.short}</span>
                    {isConfigured && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl animate-fade-in" key={activeModule}>
            {ActiveModuleComponent && (
              <ActiveModuleComponent
                config={modules[activeModule] || {}}
                onUpdate={(config) => updateModule(activeModule, config)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
