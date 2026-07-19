import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta da logo: azul-marinho + laranja
        navy: {
          950: '#081426',
          900: '#0a1a33',
          800: '#0f2547',
          700: '#16325e',
          600: '#1f4480',
        },
        accent: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        sky2: {
          400: '#58a6e8',
          500: '#3b82f6',
          600: '#2563eb',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
