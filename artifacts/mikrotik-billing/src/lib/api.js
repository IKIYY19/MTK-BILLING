import axios from "axios";
import { getToken } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRedirecting = false;

function clearSessionAndRedirect() {
  if (isRedirecting) return;
  isRedirecting = true;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  sessionStorage.clear();
  window.location.href = "/login";
}

// Handle all auth failure responses
api.interceptors.response.use(
  (res) => {
    isRedirecting = false;
    return res;
  },
  (error) => {
    const status = error.response?.status;
    const errMsg = error.response?.data?.error || "";

    const isAuthFailure =
      status === 401 ||
      (status === 403 &&
        (errMsg === "Invalid or expired token" ||
          errMsg.toLowerCase().includes("jwt") ||
          errMsg.toLowerCase().includes("token") ||
          errMsg.toLowerCase().includes("malformed") ||
          errMsg.toLowerCase().includes("expired")));

    if (isAuthFailure) {
      clearSessionAndRedirect();
    }
    return Promise.reject(error);
  },
);

// Convenience exports
export const get = (url, params) => api.get(url, { params });
export const post = (url, data) => api.post(url, data);
export const put = (url, data) => api.put(url, data);
export const del = (url) => api.delete(url);

export default api;
export { API_URL };
