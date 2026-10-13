import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const SPEED_PROFILES = {
  '1M': { 'max-limit': '1M/1M', 'limit-at': '256k/256k' },
  '2M': { 'max-limit': '2M/2M', 'limit-at': '512k/512k' },
  '5M': { 'max-limit': '5M/5M', 'limit-at': '1M/1M' },
  '10M': { 'max-limit': '10M/10M', 'limit-at': '2M/2M' },
  '20M': { 'max-limit': '20M/20M', 'limit-at': '5M/5M' },
  '50M': { 'max-limit': '50M/50M', 'limit-at': '10M/10M' },
  '100M': { 'max-limit': '100M/100M', 'limit-at': '20M/20M' },
};

export function BandwidthModule({ config, onUpdate }) {
  const [activeTab, setActiveTab] = useState('simple');

  const applySpeedProfile = (speed) => {
    const profile = SPEED_PROFILES[speed];
    if (profile) {
      const simple_queues = config.simple_queues || [];
      const updated = simple_queues.map(q => ({ ...q, ...profile }));
      onUpdate({ ...config, simple_queues: updated });
    }
  };

  // Simple Queues
  const addSimpleQueue = () => {
    const simple_queues = config.simple_queues || [];
    onUpdate({ ...config, simple_queues: [...simple_queues, { name: '', target: '', 'max-limit': '', priority: 8, comment: '' }] });
  };

  const updateSimpleQueue = (idx, field, value) => {
    const simple_queues = [...(config.simple_queues || [])];
    simple_queues[idx] = { ...simple_queues[idx], [field]: value };
    onUpdate({ ...config, simple_queues });
  };

  const removeSimpleQueue = (idx) => {
    onUpdate({ ...config, simple_queues: config.simple_queues.filter((_, i) => i !== idx) });
  };

  // Queue Trees
  const addQueueTree = () => {
    const queue_trees = config.queue_trees || [];
    onUpdate({ ...config, queue_trees: [...queue_trees, { name: '', parent: 'global', 'packet-mark': '', 'max-limit': '', priority: 8, comment: '' }] });
  };

  const updateQueueTree = (idx, field, value) => {
    const queue_trees = [...(config.queue_trees || [])];
    queue_trees[idx] = { ...queue_trees[idx], [field]: value };
    onUpdate({ ...config, queue_trees });
  };

  const removeQueueTree = (idx) => {
    onUpdate({ ...config, queue_trees: config.queue_trees.filter((_, i) => i !== idx) });
  };

  // PCQ
  const updatePCQ = (field, value) => {
    const pcq = config.pcq || {};
    onUpdate({ ...config, pcq: { ...pcq, [field]: value } });
  };

  const generatePCQ = () => {
    onUpdate({
      ...config,
      pcq: {
        ...(config.pcq || {}),
        types: ['download', 'upload'],
        rate: config.pcq?.rate || '1M',
        'pcq-classifier': 'dst-address',
      },
    });
  };

  const tabs = [
    { id: 'simple', label: 'Simple Queues' },
    { id: 'tree', label: 'Queue Trees' },
    { id: 'pcq', label: 'PCQ Profiles' },
  ];

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Bandwidth Management</h3>

      {/* Speed Profile Presets */}
      <div className="bg-slate-800 p-4 rounded mb-6">
        <h4 className="text-white font-semibold mb-3">Speed Profile Presets</h4>
        <div className="flex flex-wrap gap-2">
          {Object.keys(SPEED_PROFILES).map((speed) => (
            <button
              key={speed}
              onClick={() => applySpeedProfile(speed)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded"
            >
              {speed}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'simple' && (
        <div>
          <button onClick={addSimpleQueue} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Simple Queue
          </button>
          {config.simple_queues?.map((queue, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <input
                  placeholder="Name"
                  value={queue.name}
                  onChange={(e) => updateSimpleQueue(idx, 'name', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Target (192.168.1.100/32)"
                  value={queue.target}
                  onChange={(e) => updateSimpleQueue(idx, 'target', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Max Limit (10M/10M)"
                  value={queue['max-limit']}
                  onChange={(e) => updateSimpleQueue(idx, 'max-limit', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Limit At (2M/2M)"
                  value={queue['limit-at'] || ''}
                  onChange={(e) => updateSimpleQueue(idx, 'limit-at', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <input
                  placeholder="Priority (0-8)"
                  type="number"
                  min="0"
                  max="8"
                  value={queue.priority || ''}
                  onChange={(e) => updateSimpleQueue(idx, 'priority', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Parent Queue"
                  value={queue.parent || ''}
                  onChange={(e) => updateSimpleQueue(idx, 'parent', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <input
                  placeholder="Packet Marks"
                  value={queue['packet-marks'] || ''}
                  onChange={(e) => updateSimpleQueue(idx, 'packet-marks', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <div className="flex gap-2">
                  <input
                    placeholder="Comment"
                    value={queue.comment || ''}
                    onChange={(e) => updateSimpleQueue(idx, 'comment', e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                  <button onClick={() => removeSimpleQueue(idx)} className="text-red-500 hover:text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'tree' && (
        <div>
          <button onClick={addQueueTree} className="mb-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Queue Tree
          </button>
          {config.queue_trees?.map((queue, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded mb-4 grid grid-cols-5 gap-4">
              <input
                placeholder="Name"
                value={queue.name}
                onChange={(e) => updateQueueTree(idx, 'name', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Parent (global/parent)"
                value={queue.parent}
                onChange={(e) => updateQueueTree(idx, 'parent', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Packet Mark"
                value={queue['packet-mark']}
                onChange={(e) => updateQueueTree(idx, 'packet-mark', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Max Limit"
                value={queue['max-limit']}
                onChange={(e) => updateQueueTree(idx, 'max-limit', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Priority"
                  type="number"
                  value={queue.priority || ''}
                  onChange={(e) => updateQueueTree(idx, 'priority', e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button onClick={() => removeQueueTree(idx)} className="text-red-500 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'pcq' && (
        <div>
          <div className="bg-slate-800 p-4 rounded mb-4">
            <h4 className="text-white font-semibold mb-4">PCQ Configuration</h4>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <input
                placeholder="Rate (1M)"
                value={config.pcq?.rate || ''}
                onChange={(e) => updatePCQ('rate', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <input
                placeholder="Limit At (32k)"
                value={config.pcq?.['limit-at'] || ''}
                onChange={(e) => updatePCQ('limit-at', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
              <select
                value={config.pcq?.['pcq-classifier'] || 'dst-address'}
                onChange={(e) => updatePCQ('pcq-classifier', e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="src-address">Source Address (Upload)</option>
                <option value="dst-address">Destination Address (Download)</option>
              </select>
            </div>
            <button
              onClick={generatePCQ}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
            >
              Generate PCQ (Download + Upload)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
