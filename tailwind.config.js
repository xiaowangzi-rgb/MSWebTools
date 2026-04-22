/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: [
          'Archivo',
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        paper: '#F2ECDE',
        'paper-2': '#E8DFCB',
        ink: '#16161A',
        'ink-2': '#2B2A2E',
        graphite: '#0E0F12',
        'graphite-2': '#17181D',
        bone: '#EDE7D7',
        'bone-2': '#D5CEBE',
        vermillion: '#D94A2A',
        'vermillion-soft': '#E26A4D',
        amber: '#E8B14A',
        moss: '#5A6B50',
        rule: '#16161A',
        'rule-dark': '#EDE7D7',
        brand: {
          50: '#fdf4ef',
          100: '#fae1d3',
          200: '#f4bc9e',
          300: '#ec906a',
          400: '#e26a4d',
          500: '#D94A2A',
          600: '#b53a1e',
          700: '#8c2c17',
          800: '#661f10',
          900: '#3f140a',
        },
      },
      boxShadow: {
        'print': '4px 4px 0 0 rgb(22 22 26)',
        'print-sm': '2px 2px 0 0 rgb(22 22 26)',
        'print-dark': '4px 4px 0 0 rgb(237 231 215)',
        'print-dark-sm': '2px 2px 0 0 rgb(237 231 215)',
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'display': '-0.025em',
      },
      animation: {
        'rise': 'rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'rule-draw': 'ruleDraw 1.1s cubic-bezier(0.65, 0, 0.35, 1) both',
        'ink-in': 'inkIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'blink': 'blink 1s steps(2, end) infinite',
        'marquee': 'marquee 40s linear infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        ruleDraw: {
          '0%': { transform: 'scaleX(0)', transformOrigin: 'left' },
          '100%': { transform: 'scaleX(1)', transformOrigin: 'left' },
        },
        inkIn: {
          '0%': { opacity: '0', filter: 'blur(6px)', letterSpacing: '0.1em' },
          '100%': { opacity: '1', filter: 'blur(0)', letterSpacing: '-0.025em' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
