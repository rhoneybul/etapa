import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Etapa design system
        etapa: {
          bg: '#000000',
          surface: '#111113',
          surfaceLight: '#1A1A1E',
          border: '#222226',
          borderLight: '#1A1A1E',
          text: '#FFFFFF',
          textMid: '#A0A0A8',
          textMuted: '#606068',
          textFaint: '#35353D',
          primary: '#D97706',
          primaryDark: '#B45309',
          good: '#22C55E',
          warn: '#EF4444',
          caution: '#F59E0B',
        },
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
