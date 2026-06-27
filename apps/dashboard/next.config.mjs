/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use the workspace TS packages (contracts, llm) directly — no pre-build step.
  transpilePackages: ['@crown/contracts', '@crown/llm'],
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
