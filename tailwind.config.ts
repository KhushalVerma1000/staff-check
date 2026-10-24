import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Re-pointed palettes: every legacy blue/gray/slate class now resolves to the new cobalt + cool-neutral scale.
        blue: { 50:'#EAF0FE',100:'#DCE6FD',200:'#C7D5FB',300:'#9DB6F7',400:'#6C8DF0',500:'#4672EE',600:'#2F5BEA',700:'#2549C4',800:'#1F43C2',900:'#1B3694',950:'#122360' },
        gray: { 50:'#F9FAFB',100:'#F2F4F7',200:'#E4E7EC',300:'#D0D5DD',400:'#98A2B3',500:'#667085',600:'#475467',700:'#344054',800:'#1D2939',900:'#101828',950:'#0C111D' },
        slate: { 50:'#F9FAFB',100:'#F2F4F7',200:'#E4E7EC',300:'#D0D5DD',400:'#98A2B3',500:'#667085',600:'#475467',700:'#344054',800:'#1D2939',900:'#101828',950:'#0C111D' },
        red: { 50:'#FDECEA',100:'#FDE3E0',200:'#F9C5C0',300:'#F2968D',400:'#E5584B',500:'#D63A2D',600:'#C2271B',700:'#B42318',800:'#912018',900:'#7A271A',950:'#4A130C' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: '0.5rem',
        sm: '0.375rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
