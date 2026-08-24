/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF7EF',
        paperDark: '#F0EBDD',
        ink: {
          DEFAULT: '#1B2A4A',
          light: '#2E4066',
          soft: '#5A6B8C',
        },
        brass: {
          DEFAULT: '#C89B3C',
          light: '#E0BE6E',
          dark: '#9C761F',
        },
        sage: {
          DEFAULT: '#4A7C59',
          light: '#E8F0E8',
        },
        clay: {
          DEFAULT: '#B5533C',
          light: '#F5E4DE',
        },
        slate: {
          text: '#3D4A5C',
        },
      },
      fontFamily: {
        display: ['"Noto Serif Thai"', 'serif'],
        body: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        stamp: '0 2px 0 rgba(27,42,74,0.08), 0 8px 20px -8px rgba(27,42,74,0.25)',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
