/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.dat$/,
      type: 'asset/source',
    })
    return config
  },
}

export default nextConfig
