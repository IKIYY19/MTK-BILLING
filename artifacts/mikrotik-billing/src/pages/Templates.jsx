import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { FileCode, Plus } from 'lucide-react';

export function Templates() {
  const { templates, fetchTemplates, applyTemplate } = useStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const categories = ['all', 'interfaces', 'ipconfig', 'routing', 'firewall', 'isp', 'vpn', 'bandwidth', 'wireless', 'system'];

  useEffect(() => {
    fetchTemplates(selectedCategory === 'all' ? undefined : selectedCategory);
  }, [selectedCategory]);

  // Ensure templates is always an array
  const templatesArray = Array.isArray(templates) ? templates : [];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-white">Templates</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Template
        </button>
      </div>

      <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templatesArray.map((template) => (
          <div
            key={template.id}
            className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <FileCode className="w-8 h-8 text-blue-500" />
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">
                {template.category}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{template.name}</h3>
            <p className="text-sm text-slate-400 mb-4">{template.description}</p>
            <button
              onClick={() => applyTemplate(template.id)}
              className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-4 py-2 rounded-lg text-sm"
            >
              Apply to Project
            </button>
          </div>
        ))}
      </div>

      {templatesArray.length === 0 && (
        <div className="text-center py-16">
          <FileCode className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No templates found.</p>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Create Template</h3>
            <p className="text-slate-400 mb-4">
              Configure a module in a project first, then save it as a template from the project view.
            </p>
            <button
              onClick={() => setShowCreate(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
