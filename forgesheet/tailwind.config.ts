import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          ember: "#c96f32",
          brass: "#9c7b3c",
          soot: "#17181d",
          coal: "#23262e",
          smoke: "#2f3440",
          mist: "#e9e2d0",
          parchment: "#f5efdf",
          moss: "#50624f",
          sky: "#94b3c8",
          rune: "#7f9a89"
        }
      },
      boxShadow: {
        forge: "0 24px 80px rgba(9, 10, 12, 0.35)",
        panel: "0 16px 32px rgba(10, 12, 16, 0.2)"
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at top left, rgba(255,255,255,0.06), transparent 30%), radial-gradient(circle at bottom right, rgba(201,111,50,0.12), transparent 28%), linear-gradient(140deg, rgba(255,255,255,0.03), transparent 55%)"
      },
      keyframes: {},
      animation: {}
    }
  },
  plugins: [],
};

export default config;
