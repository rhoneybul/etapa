import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Align with Etapa's brand accent so the finance dashboard doesn't
        // feel like a second product.
        brand: {
          DEFAULT: "#E8458B",
          fg: "#ffffff",
        },
        // Runway zones — reused across KPI tiles + banners.
        zone: {
          green: "#10b981",
          amber: "#f59e0b",
          red:   "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
export default config;
