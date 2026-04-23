/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the dashboard small — no image optimisation server, no telemetry leaks.
  images: { unoptimized: true },
};

export default nextConfig;
