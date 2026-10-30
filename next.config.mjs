/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["maplibre-gl"],
  experimental: {
    serverComponentsExternalPackages: ["geotiff"]
  }
};

export default nextConfig;
