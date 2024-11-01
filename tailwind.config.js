export const purge = ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'];
export const media = false;
import colors from 'tailwindcss/colors';

export const theme = {
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
};
  
export const variants = {
  extend: {},
};

export const plugins = [function({ addComponents }) {
  addComponents({
    '.cell-highlight': {
      '&::before': {
        content: '""',
      },
    },
  })
},];
