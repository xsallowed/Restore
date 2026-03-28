/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f1fb',
          100: '#b5d4f4',
          500: '#2e6da4',
          600: '#185fa5',
          700: '#1b3a5c',
          900: '#0c447c',
        },
        bronze: { 50: '#f5edd8', 600: '#7b5e2a' },
        silver: { 50: '#d5e8f0', 600: '#185fa5' },
        gold:   { 50: '#d6ede0', 600: '#1e6b3a' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
