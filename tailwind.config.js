/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--color-card-rgb) / <alpha-value>)',
        paper: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
        paperDark: 'var(--color-bg-muted)',
        ink: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          light: 'var(--color-primary-light)',
          soft: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          light: 'var(--color-accent-soft)',
          dark: 'var(--color-accent-dark)',
        },
        sage: {
          DEFAULT: 'var(--color-approved-text)',
          light: 'var(--color-approved-bg)',
        },
        clay: {
          DEFAULT: 'var(--color-rejected-text)',
          light: 'var(--color-rejected-bg)',
        },
        pending: {
          DEFAULT: 'var(--color-pending-text)',
          light: 'var(--color-pending-bg)',
        },
        cancelled: 'var(--color-cancelled-bg)',
        text: {
          DEFAULT: 'rgb(var(--color-text-rgb) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        },
        slate: {
          text: 'var(--color-text-muted)',
        },
      },
      fontFamily: {
        display: ['"Noto Sans Thai"', 'sans-serif'],
        body: ['"Noto Sans Thai"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        stamp: '0 1px 3px rgb(var(--color-text-rgb) / 8%)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}
