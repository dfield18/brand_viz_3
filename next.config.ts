import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// `ANALYZE=true npm run build` writes per-route client/server HTML
// reports to .next/analyze/. Gated behind an env var so normal
// builds stay fast.
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

// withWorkflow returns a phase-function (not a plain NextConfig), so
// the analyzer wrap has to happen on the inner config before Workflow
// takes over.
export default withWorkflow(withAnalyzer(nextConfig));
