import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

const themes = [
  {
    id: "royal",
    name: "Royal Blue",
    description: "Professional blue/violet gradients",
  },
  {
    id: "emerald",
    name: "Emerald Green",
    description: "Fresh green/teal gradients",
  },
  {
    id: "sunset",
    name: "Sunset Orange",
    description: "Warm orange/red gradients",
  },
  {
    id: "purple",
    name: "Deep Purple",
    description: "Creative purple/pink gradients",
  },
  { id: "ocean", name: "Ocean Cyan", description: "Calm cyan/blue gradients" },
  {
    id: "midnight",
    name: "Midnight Dark",
    description: "Pure dark, minimal accents",
  },
  { id: "slate", name: "Slate Gray", description: "Minimalist gray tones" },
  { id: "rose", name: "Rose Pink", description: "Elegant pink/rose gradients" },
  {
    id: "techy",
    name: "Techy Terminal",
    description: "Matrix green terminal aesthetic with CRT effects",
  },
];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || "royal";
  });
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("mode");
    return saved || "light";
  });
  const [eyeFilter, setEyeFilter] = useState(() => {
    const saved = localStorage.getItem("eyeFilter");
    return saved === "true";
  });
  const [eyeIntensity, setEyeIntensity] = useState(() => {
    const saved = localStorage.getItem("eyeIntensity");
    return saved ? parseInt(saved) : 60;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(mode);
    localStorage.setItem("mode", mode);
  }, [mode]);

  useEffect(() => {
    if (eyeFilter) {
      document.documentElement.classList.add("eye-filter");
      document.documentElement.style.setProperty("--eye-intensity", eyeIntensity / 100);
    } else {
      document.documentElement.classList.remove("eye-filter");
      document.documentElement.style.setProperty("--eye-intensity", "0");
    }
    localStorage.setItem("eyeFilter", String(eyeFilter));
    localStorage.setItem("eyeIntensity", String(eyeIntensity));
  }, [eyeFilter, eyeIntensity]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode, eyeFilter, setEyeFilter, eyeIntensity, setEyeIntensity, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
