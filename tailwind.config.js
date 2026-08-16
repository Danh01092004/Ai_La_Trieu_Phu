/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          900: '#050817',
          800: '#0a0f2c',
          700: '#101841',
          600: '#182155',
        },
        royal: {
          500: '#2b3ea8',
          400: '#3a52d6',
          300: '#5b74f0',
        },
        purpleglow: {
          600: '#5b21b6',
          500: '#7c3aed',
          400: '#a855f7',
        },
        gold: {
          600: '#b8860b',
          500: '#e0aa1e',
          400: '#f5c542',
          300: '#ffd966',
          200: '#ffe89e',
        },
      },
      fontFamily: {
        display: ['"Oswald"', '"Bebas Neue"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 25px rgba(245,197,66,0.55), 0 0 60px rgba(245,197,66,0.25)',
        neon: '0 0 20px rgba(91,116,240,0.6), 0 0 45px rgba(124,58,237,0.35)',
        glass: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      backgroundImage: {
        'radial-glow': 'radial-gradient(circle at 50% 35%, rgba(91,116,240,0.35), transparent 60%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 20px rgba(245,197,66,0.4)' },
          '50%': { boxShadow: '0 0 45px rgba(245,197,66,0.85)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        shimmer: 'shimmer 3s linear infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        spinSlow: 'spinSlow 22s linear infinite',
      },
    },
  },
  plugins: [],
}
