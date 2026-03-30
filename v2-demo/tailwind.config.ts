import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        radio: '0 24px 60px rgba(4, 10, 22, 0.45)'
      },
      colors: {
        accent: {
          950: '#050b16'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
