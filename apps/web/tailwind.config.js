/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#15242E' },
        school: { 800: '#1F4358' },
        basalt: { 600: '#A7462F' },
        mist: { 50: '#F3F6F7' },
        paper: { 0: '#FFFFFF' },
        line: { 300: '#C9D4DA' },
        success: { 50: '#EDF7F1', 700: '#246B45' },
        warning: { 50: '#FFF7E6', 800: '#7A4B00' },
        error: { 50: '#FFF1F1', 700: '#A32929' },
      },
      fontFamily: {
        sans: ['Be Vietnam Pro', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
