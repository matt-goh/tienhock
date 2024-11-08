import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html'
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      'default': colors.gray,
      white: colors.white,
      gray: colors.gray,
      sky: colors.sky,
      blue: colors.blue,
      rose: colors.rose,
      red: colors.red,
      yellow: colors.yellow,
      green: colors.green,
      teal: colors.teal,
      black: colors.black,
    }
  },
  variants: {
    extend: {},
  },
  plugins: [
    function({ addComponents }) {
      addComponents({
        '.cell-highlight': {
          '&::before': {
            content: '""',
          },
        },
      })
    },
  ],
  corePlugins: {
    preflight: true,
  },
};