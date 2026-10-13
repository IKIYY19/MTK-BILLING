import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "/api";

const defaults = {
  company_name: "",
  company_logo: "",
  primary_color: "#3b82f6",
  secondary_color: "#1e293b",
  branding_title: "",
};

const BrandingContext = createContext(defaults);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(defaults);
  const lastFetchTs = useRef(0);

  const fetchBranding = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {return;}

    axios
      .get(`${API}/tenants/current`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(({ data }) => {
        setBranding({
          company_name: data.company_name || "",
          company_logo: data.logo_url || "",
          primary_color: data.primary_color || "#3b82f6",
          secondary_color: data.secondary_color || "#1e293b",
          branding_title: data.company_name || "",
        });
      })
      .catch((e) => {
        console.error(
          "BrandingContext: Failed to load tenant branding",
          e.message,
        );
      });
  }, []);

  useEffect(() => {
    fetchBranding();

    const interval = setInterval(() => {
      const ts = parseInt(localStorage.getItem("auth_change_ts") || "0");
      if (ts > lastFetchTs.current) {
        lastFetchTs.current = ts;
        fetchBranding();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchBranding]);

  const appName =
    branding.branding_title || branding.company_name || "MikroTik Billing";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--brand-primary",
      branding.primary_color,
    );
    document.documentElement.style.setProperty(
      "--brand-secondary",
      branding.secondary_color,
    );
  }, [branding.primary_color, branding.secondary_color]);

  return (
    <BrandingContext.Provider value={{ ...branding, appName }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
