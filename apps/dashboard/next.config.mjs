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
