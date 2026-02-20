/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    '/api/download-server': ['./scripts/streaming-engine/streaming-server.js'],
  },
}

export default nextConfig
