/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        navy: {
          800: '#0F172A',
          900: '#0B1120',
          950: '#060B14',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(14, 165, 233, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'card': '0 10px 30px -4px rgba(15, 23, 42, 0.06), 0 4px 8px -2px rgba(0, 0, 0, 0.03)',
        'glow-low': '0 0 25px rgba(16, 185, 129, 0.25)',
        'glow-medium': '0 0 25px rgba(245, 158, 11, 0.25)',
        'glow-high': '0 0 25px rgba(239, 68, 68, 0.25)',
      },
    },
  },
  plugins: [],
}
