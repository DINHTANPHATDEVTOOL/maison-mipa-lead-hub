/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf8f2',
          100: '#f6f0e3',
          200: '#eddcc5',
          300: '#e1c39e',
          400: '#d2a373',
          500: '#c5874f',
          600: '#b26e3f',
          700: '#945435',
          800: '#794430',
          900: '#64392b',
          950: '#381c15',
        },
        surface: {
          dark: '#0f1117',
          card: '#181b24',
          border: '#262b3a',
          hover: '#1e2230',
        }
      },
    },
  },
  plugins: [],
};
