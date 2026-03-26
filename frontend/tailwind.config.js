/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#dbe8ff',
          500: '#1e3a8a',
          600: '#1d4ed8',
          700: '#1e40af',
          900: '#0b1f52',
        },
        accent: {
          50: '#fffbea',
          100: '#fff3c6',
          400: '#f6c847',
          500: '#f4b400',
          600: '#dca200',
        },
      },
    },
  },
  plugins: [],
};
