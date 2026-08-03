/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light mode colors
        background: {
          light: '#f8fafc',
          DEFAULT: '#ffffff',
        },
        surface: {
          light: '#f1f5f9',
          DEFAULT: '#ffffff',
          elevated: '#ffffff',
        },
        text: {
          primary: '#1e293b',
          secondary: '#64748b',
          muted: '#94a3b8',
        },
        border: {
          light: '#e2e8f0',
          DEFAULT: '#cbd5e1',
        },
        // Dark mode colors
        dark: {
          background: {
            light: '#0f172a',
            DEFAULT: '#020617',
          },
          surface: {
            light: '#1e293b',
            DEFAULT: '#0f172a',
            elevated: '#1e293b',
          },
          text: {
            primary: '#f8fafc',
            secondary: '#cbd5e1',
            muted: '#64748b',
          },
          border: {
            light: '#334155',
            DEFAULT: '#475569',
          },
        },
      },
    },
  },
  plugins: [],
} 