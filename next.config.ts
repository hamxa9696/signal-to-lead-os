import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that must not be bundled for the browser.
  serverExternalPackages: ["postgres", "puppeteer-core", "@sparticuz/chromium"],
  // Ship the compressed Chromium binary with the functions that render PDFs.
  outputFileTracingIncludes: {
    "/topics/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
