import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import { gridColors } from "../../packages/explorer/src/grid-theme";
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/explorer/src/**/*.{ts,tsx}",
  ],
  theme: { extend: { colors: gridColors } },
  plugins: [animate],
} satisfies Config;
