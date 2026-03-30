/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#5C6F2B',
        'brand-mid': '#D8C9A7',
        'brand-light': '#D8C9A7',
        'brand-accent': '#DE802B',
        'brand-bg': '#EEEEEE',
        'brand-cream': '#EEEEEE',
        primary: {
          50: '#f4f7ec',
          100: '#e6edd8',
          500: '#5C6F2B',
          600: '#4f5f24',
          700: '#434f1e',
          900: '#2c3514',
        },
        accent: {
          50: '#fcf3ea',
          100: '#f8e3d2',
          400: '#DE802B',
          500: '#DE802B',
          600: '#be6d24',
        },
      },
    },
  },
  plugins: [],
};
