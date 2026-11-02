import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that must not be bundled for the browser.
  serverExternalPackages: ["postgres", "puppeteer-core", "@sparticuz/chromium"],
  // Ship the compressed Chromium binary with the functions that render PDFs.
  // Old pages now live inside Trends / Results; keep old bookmarks working.
  async redirects() {
    return [
      { source: "/signals", destination: "/trends/signals", permanent: false },
      { source: "/geo", destination: "/trends/ai-search", permanent: false },
      { source: "/signal-index", destination: "/trends/signal-index", permanent: false },
      { source: "/forecast", destination: "/trends/forecast", permanent: false },
      { source: "/review", destination: "/performance#fix-these", permanent: false },
    ];
  },
  outputFileTracingIncludes: {
    "/topics/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
