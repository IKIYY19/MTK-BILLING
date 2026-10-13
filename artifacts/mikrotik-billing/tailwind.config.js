/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          50: "hsl(var(--zinc-50) / <alpha-value>)",
          100: "hsl(var(--zinc-100) / <alpha-value>)",
          200: "hsl(var(--zinc-200) / <alpha-value>)",
          300: "hsl(var(--zinc-300) / <alpha-value>)",
          400: "hsl(var(--zinc-400) / <alpha-value>)",
          500: "hsl(var(--zinc-500) / <alpha-value>)",
          600: "hsl(var(--zinc-600) / <alpha-value>)",
          700: "hsl(var(--zinc-700) / <alpha-value>)",
          800: "hsl(var(--zinc-800) / <alpha-value>)",
          900: "hsl(var(--zinc-900) / <alpha-value>)",
          950: "hsl(var(--zinc-950) / <alpha-value>)",
        },
        white: "hsl(var(--tw-white) / <alpha-value>)",
        black: "hsl(var(--tw-black) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--tw-surface) / <alpha-value>)",
          border: "hsl(var(--tw-surface-border) / <alpha-value>)",
          text: "hsl(var(--tw-surface-text) / <alpha-value>)",
          muted: "hsl(var(--tw-surface-muted) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
