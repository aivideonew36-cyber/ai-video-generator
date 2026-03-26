/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ['ngrok-free.app', 'ngrok.io'],
  },
}

module.exports = nextConfig
