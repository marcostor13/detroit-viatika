/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        heading: ['"Zilla Slab"', 'serif'],
      },
      colors: {
        primary: '#D31212',
        accent: '#9B1B22',
        secondary: '#4F4F4F',
        tertiary: '#6B6B6B',
        quaternary: '#FFFFFF',
        background: '#F5F7FA',
        divider: '#E0E0E0',
        success: '#05CD99',
        warning: '#FFB547',
        error: '#EE5D50',
        brand: {
          100: '#F5F7FA',
          200: '#E0E0E0',
        }
      },
      borderRadius: {
        'xl': '20px',
        '2xl': '30px',
        '3xl': '40px',
      },
      boxShadow: {
        'soft': '0 2px 4px rgba(0,0,0,0.05)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
