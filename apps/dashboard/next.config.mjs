/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use the workspace TS packages directly, no pre-build step. The demo surface runs the REAL detection,
  // containment, audit and simulator code server side, so those packages are transpiled too.
  transpilePackages: [
    '@crown/agent',
    '@crown/audit',
    '@crown/containment',
    '@crown/contracts',
    '@crown/detection',
    '@crown/llm',
    '@crown/simulator',
    '@crown/test-infra',
  ],
  // pg is only reachable through @crown/audit's Postgres-backed store, which the demo never constructs.
  // Keeping it external stops the bundler from tripping over its optional native bindings.
  serverExternalPackages: ['pg'],
  /**
   * Security headers. Vercel already sends HSTS; these close the three that were missing.
   *
   * The console is credential-gated and moves an autonomy dial that governs destructive action, so a
   * page that can be framed by an attacker's site is a clickjacking route to an operator control. CSP is
   * deliberately frame-ancestors only: this app renders inline styles throughout (a faithful port of the
   * design bundle), and a script-src policy written in a hurry on demo morning would break the dashboard
   * rather than protect it. Narrow and correct beats broad and untested.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  webpack: (config) => {
    // The workspace packages use NodeNext '.js' import specifiers that resolve to '.ts' sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
