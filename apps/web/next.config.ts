import type { NextConfig } from "next";
import { normalizeBasePath } from "./src/paths";
const config: NextConfig = {
  basePath: normalizeBasePath(process.env.NEXT_PUBLIC_OOS_BASE_PATH),
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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
