import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

/**
 * API Helper Functions with Error Handling
 * Use these instead of direct axios calls for consistent error handling
 */

// Get auth token from localStorage
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Generic API call with error handling
export const apiCall = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `${API}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`API Error [${method} ${endpoint}]:`, error);
    
    // Handle different error types
    if (error.response) {
      // Server responded with error status
      return {
        success: false,
        error: error.response.data?.error || error.response.data?.message || 'Server error',
        status: error.response.status,
      };
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'Network error - please check your connection',
        status: 0,
      };
    } else {
      // Something else happened
      return {
        success: false,
        error: error.message || 'Unexpected error',
        status: -1,
      };
    }
  }
};

// Convenience methods
export const api = {
  get: (endpoint) => apiCall('get', endpoint),
  post: (endpoint, data) => apiCall('post', endpoint, data),
  put: (endpoint, data) => apiCall('put', endpoint, data),
  delete: (endpoint) => apiCall('delete', endpoint),
};

// Specific API functions for common operations
export const resellerAPI = {
  getAll: () => api.get('/resellers'),
  getById: (id) => api.get(`/resellers/${id}`),
  create: (data) => api.post('/resellers', data),
  update: (id, data) => api.put(`/resellers/${id}`, data),
  delete: (id) => api.delete(`/resellers/${id}`),
};

export const customerAPI = {
  getAll: () => api.get('/customers'),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const invoiceAPI = {
  getAll: () => api.get('/billing/invoices'),
  getById: (id) => api.get(`/billing/invoices/${id}`),
  create: (data) => api.post('/billing/invoices', data),
  update: (id, data) => api.put(`/billing/invoices/${id}`, data),
  delete: (id) => api.delete(`/billing/invoices/${id}`),
};

export const paymentAPI = {
  getAll: () => api.get('/payments'),
  create: (data) => api.post('/payments', data),
};

export default api;
