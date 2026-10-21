/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@modelcontextprotocol/sdk",
    "@mastergo/magic-mcp",
    "sharp",
    "yazl",
  ],
};

export default nextConfig;
