// Tailwind CSS v4 runs as a PostCSS plugin — no tailwind.config.js
// needed (design tokens live in src/app/globals.css).
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
