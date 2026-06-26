/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        surface: '#1E293B',
        'surface-light': '#334155',
        primary: '#22C55E',
        'primary-hover': '#16A34A',
        foreground: '#F8FAFC',
        muted: '#94A3B8',
        danger: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 4px 6px rgba(0,0,0,0.1)',
        modal: '0 20px 25px rgba(0,0,0,0.15)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        300: '300ms',
      },
    },
  },
  plugins: [],
}
