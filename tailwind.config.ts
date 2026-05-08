import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem"
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(255 255 255 / 0.08), 0 10px 30px rgb(0 0 0 / 0.35)"
      },
      backgroundImage: {
        noise: "radial-gradient(circle at top, rgba(255,255,255,0.06), transparent 35%)"
      }
    }
  },
  plugins: []
};

export default config;
