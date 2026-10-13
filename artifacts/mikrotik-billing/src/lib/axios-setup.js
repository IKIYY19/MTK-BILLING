/**
 * Global Axios Interceptor
 * Attaches auth token to EVERY request automatically
 */

import axios from 'axios';
import { getToken } from './auth';

// REQUEST interceptor - adds token to every request
// Also intercepts demo/offline fake tokens and clears them immediately
axios.interceptors.request.use((config) => {
  const token = getToken();
  const requestPath = getRequestPath(config);
  const isPublicCustomerAuthRequest =
    /\/(?:api\/)?portal\/auth\/(?:login|token-login|forgot-pin|reset-pin)(?:\/|$)/i.test(requestPath);
  const isCustomerPortalApi =
    /\/api\/portal\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?:\/|$)/i.test(requestPath) ||
    /\/api\/portal\/auth\/(?:me|change-pin)(?:\/|$)/i.test(requestPath);

  // If a stale offline/demo token is stored, clear it now and redirect to login
  if (token === 'demo-token-offline') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    if (!isPublicCustomerAuthRequest) {
      window.location.href = '/login';
      return Promise.reject(new Error('Stale offline token cleared'));
    }
  }

  if (isCustomerPortalPage() && isCustomerPortalApi) {
    const customerToken = localStorage.getItem('customerToken');
    if (customerToken) {
      config.headers.Authorization = 'Bearer ' + customerToken;
    } else {
      delete config.headers.Authorization;
    }
  } else if (isPublicCustomerAuthRequest) {
    delete config.headers.Authorization;
  } else if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const isCustomerPortalPage = () =>
  typeof window !== 'undefined' &&
  /^\/portal\/(?!login(?:\/|$))/.test(window.location.pathname);

const getRequestPath = (config) => {
  try {
    return new URL(
      config.url || '',
      config.baseURL || window.location.origin,
    ).pathname;
  } catch {
    return config.url || '';
  }
};

let _isRedirecting = false;

function clearSessionAndRedirect() {
  if (_isRedirecting) return;
  _isRedirecting = true;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  sessionStorage.clear();
  window.location.href = '/login';
}

function clearCustomerSessionAndRedirect() {
  if (_isRedirecting) return;
  _isRedirecting = true;
  localStorage.removeItem('customerToken');
  localStorage.removeItem('customer');
  window.location.href = '/portal/login';
}

// RESPONSE interceptor - handles all auth failure scenarios
axios.interceptors.response.use(
  (res) => {
    // Reset redirect flag on successful response
    _isRedirecting = false;
    return res;
  },
  (error) => {
    const status = error.response?.status;
    const errMsg = error.response?.data?.error || '';

    const isAuthFailure =
      status === 401 ||
      (status === 403 && (
        errMsg === 'Invalid or expired token' ||
        errMsg.toLowerCase().includes('jwt') ||
        errMsg.toLowerCase().includes('token') ||
        errMsg.toLowerCase().includes('malformed') ||
        errMsg.toLowerCase().includes('expired')
      ));

    if (isAuthFailure) {
      const requestPath = error.config ? getRequestPath(error.config) : '';
      if (!/\/(?:api\/)?portal\/auth\//i.test(requestPath)) {
        if (isCustomerPortalPage()) {
          clearCustomerSessionAndRedirect();
        } else {
          clearSessionAndRedirect();
        }
      }
    }

    return Promise.reject(error);
  }
);

// Make token status available in browser console for debugging
if (typeof window !== 'undefined') {
  window.getAuthStatus = () => {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    return { hasToken: !!token, tokenPreview: token ? token.substring(0, 40) + '...' : null, user: user ? JSON.parse(user) : null };
  };
}

export default axios;
