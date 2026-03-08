/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        luna: {
          100: "#A7EBF2",
          200: "#54ACBF",
          300: "#26658C",
          400: "#023859",
          500: "#011C40",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(167,235,242,.14), 0 20px 60px rgba(1,28,64,.55)",
      },
    },
  },
  plugins: [],
};