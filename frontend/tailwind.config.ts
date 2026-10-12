import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: { 50: '#FEFCF8', 100: '#FBF8F1', 200: '#F4EFE2', 300: '#EAE3D0' },
        gold: {
          50: '#FEF8E3', 100: '#FCEFBC', 200: '#F9E085', 300: '#F5CF4F',
          400: '#F0BE22', 500: '#E3A908', 600: '#BF8A05', 700: '#946A06',
        },
        mustard: { 400: '#CDAA3D', 500: '#B38F1F', 600: '#8F6F14', 700: '#6E5510' },
        ink: {
          950: '#171512', 900: '#1F1D1A', 800: '#2B2824', 700: '#3D3932', 600: '#5A554B',
          500: '#6B6559', 400: '#A39D90', 300: '#C7C1B3',
        },
        line: { DEFAULT: '#E6E0D1', strong: '#D3CAB5' },
        success: { DEFAULT: '#26683F', soft: '#E6F2EA' },
        danger: { DEFAULT: '#B3372C', soft: '#FBEAE7' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,29,26,0.05), 0 1px 1px rgba(31,29,26,0.03)',
        pop: '0 12px 32px -12px rgba(31,29,26,0.22), 0 2px 6px rgba(31,29,26,0.06)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fadeIn 150ms ease-out' },
    },
  },
  plugins: [],
} satisfies Config
