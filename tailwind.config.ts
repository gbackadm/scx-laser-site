import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: "#030303",
        graphite: "#101214",
        laser: "#e1121b",
        "laser-deep": "#9f0d13",
        steel: "#c8c9cc",
      },
      boxShadow: {
        laser: "0 0 32px rgba(225, 18, 27, 0.28)",
      },
      animation: {
        "fade-up": "fadeUp 720ms ease-out both",
        "soft-reveal": "softReveal 900ms ease-out both",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        softReveal: {
          "0%": { opacity: "0", transform: "scale(1.015)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
