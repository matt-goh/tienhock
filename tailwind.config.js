import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      default: colors.gray,
      white: colors.white,
      gray: colors.gray,
      sky: colors.sky,
      blue: colors.blue,
      indigo: colors.indigo,
      purple: colors.purple,
      violet: colors.violet,
      rose: colors.rose,
      red: colors.red,
      yellow: colors.yellow,
      green: colors.emerald,
      teal: colors.teal,
      black: colors.black,
      amber: colors.amber,
      emerald: colors.emerald,
      orange: colors.orange,
    },
    extend: {
      fontFamily: {
        segoe: ['"Segoe UI"', "sans-serif"],
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [
    function ({ addComponents }) {
      addComponents({
        ".cell-highlight": {
          "&::before": {
            content: '""',
          },
        },
      });
    },
  ],
  corePlugins: {
    preflight: true,
  },
};
