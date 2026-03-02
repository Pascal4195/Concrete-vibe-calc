/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'Courier New', 'monospace'],
      },
      colors: {
        neon: '#00FF41',
        neonDim: '#00CC33',
        terminal: '#0D0D0D',
        amber: '#FFB800',
      },
      animation: {
        blink: 'blink 1s step-end infinite',
        fadeIn: 'fadeIn 0.4s ease-out forwards',
        logEntry: 'logEntry 0.3s ease-out forwards',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        logEntry: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
