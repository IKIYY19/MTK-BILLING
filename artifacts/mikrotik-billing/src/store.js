import { create } from 'zustand';
import api from './lib/api';
import { getToken } from './lib/auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Log token status when store initializes
console.log('📦 Store initializing. Token:', getToken() ? 'PRESENT' : 'ABSENT');

export const useStore = create((set, get) => ({
  // Project state
  projects: [],
  currentProject: null,
  modules: {},
  generatedScript: '',
  validation: { valid: true, errors: [] },
  loading: false,
  error: null,

  // Templates
  templates: [],

  // MikroTik connections
  connections: [],

  // Project actions
  fetchProjects: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/projects');
      set({ projects: data, loading: false, error: null });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      set({ error: error.message, loading: false, projects: [] });
    }
  },

  createProject: async (projectData) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/projects', projectData);
      set((state) => ({
        projects: [...state.projects, data],
        currentProject: data,
        loading: false,
      }));
      return data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  selectProject: async (projectId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      const modules = {};
      if (data.modules) {
        data.modules.forEach((mod) => {
          modules[mod.module_type] = mod.config_data;
        });
      }
      set({ currentProject: data, modules, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  updateProject: async (projectData) => {
    const { currentProject } = get();
    if (!currentProject) {return;}
    
    set({ loading: true });
    try {
      const { data } = await api.put(
        `/projects/${currentProject.id}`,
        projectData
      );
      set({ currentProject: data, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  deleteProject: async (projectId) => {
    set({ loading: true });
    try {
      await api.delete(`/projects/${projectId}`);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== projectId),
        currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        loading: false,
      }));
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  // Module actions
  updateModule: (moduleType, configData) => {
    set((state) => ({
      modules: {
        ...state.modules,
        [moduleType]: configData,
      },
    }));
  },

  saveModules: async () => {
    const { currentProject, modules } = get();
    if (!currentProject) {return;}

    set({ loading: true });
    try {
      for (const [moduleType, configData] of Object.entries(modules)) {
        if (Object.keys(configData).length > 0) {
          await api.post('/modules', {
            project_id: currentProject.id,
            module_type: moduleType,
            config_data: configData,
          });
        }
      }
      set({ loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  // Generator actions
  generateScript: async () => {
    const { modules, currentProject } = get();
    set({ loading: true });
    try {
      const { data } = await api.post('/generator/generate', {
        modules,
        routeros_version: currentProject?.routeros_version || 'v7',
      });
      set({
        generatedScript: data.script,
        validation: data.validation,
        loading: false,
      });
      return data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Template actions
  fetchTemplates: async (category) => {
    set({ loading: true });
    try {
      const url = category
        ? `${API_URL}/templates?category=${category}`
        : `${API_URL}/templates`;
      const { data } = await api.get(url);
      set({ templates: data, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  applyTemplate: async (templateId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/templates/${templateId}`);
      set((state) => ({
        modules: {
          ...state.modules,
          [data.category]: data.content,
        },
        loading: false,
      }));
      return data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // MikroTik connection actions
  fetchConnections: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/mikrotik');
      set({ connections: data, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  testConnection: async (connectionData) => {
    try {
      const { data } = await api.post('/mikrotik/test', connectionData);
      return data;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  pushScript: async (connectionId, script, dryRun = false) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/mikrotik/push', {
        connection_id: connectionId,
        script,
        dry_run: dryRun,
      });
      set({ loading: false });
      return data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Utility
  clearState: () => {
    set({
      currentProject: null,
      modules: {},
      generatedScript: '',
      validation: { valid: true, errors: [] },
      error: null,
    });
  },
}));
