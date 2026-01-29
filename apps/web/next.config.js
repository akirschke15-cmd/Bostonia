/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@bostonia/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: `${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/auth/:path*`,
      },
      {
        source: '/api/users/:path*',
        destination: `${process.env.USER_SERVICE_URL || 'http://localhost:3002'}/api/users/:path*`,
      },
      {
        source: '/api/characters/:path*',
        destination: `${process.env.CHARACTER_SERVICE_URL || 'http://localhost:3003'}/api/characters/:path*`,
      },
      {
        source: '/api/conversations/:path*',
        destination: `${process.env.CHAT_SERVICE_URL || 'http://localhost:3004'}/api/conversations/:path*`,
      },
      {
        source: '/api/payments/:path*',
        destination: `${process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005'}/api/payments/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
