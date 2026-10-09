import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: [
    "@synehq-oos/ui",
    "@synehq-oos/explorer",
    "@synehq-oos/explorer-contracts",
    "@synehq-oos/kelvo-client",
    "@synehq-oos/charts",
  ],
};
export default config;
