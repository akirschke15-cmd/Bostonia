import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep space backgrounds
        space: {
          50: '#e2e8ff',
          100: '#c7d2fe',
          200: '#a5b4fc',
          300: '#818cf8',
          400: '#6366f1',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
          800: '#1e1b4b',
          900: '#0f0a2a',
          950: '#080514',
        },
        // Nebula purple - primary
        primary: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        // Cosmic pink - accent
        accent: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
          950: '#500724',
        },
        // Cyan stardust
        stardust: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        // Warm nebula orange/gold
        nova: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-cal)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'pulse-subtle': 'pulse-subtle 2s infinite',
        'twinkle': 'twinkle 3s ease-in-out infinite',
        'nebula-pulse': 'nebula-pulse 8s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'twinkle': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        'nebula-pulse': {
          '0%, 100%': { opacity: '0.5', filter: 'blur(40px)' },
          '50%': { opacity: '0.8', filter: 'blur(60px)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.6)' },
        },
      },
      backgroundImage: {
        'nebula-gradient': 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 50%, rgba(6, 182, 212, 0.2) 100%)',
        'cosmic-radial': 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
        'stardust': 'radial-gradient(ellipse at 20% 30%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
};

export default config;
