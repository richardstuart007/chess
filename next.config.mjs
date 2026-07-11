/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['nextjs-shared'],
  serverExternalPackages: ['stockfish'],
  logging: {
    fetches: { fullUrl: false }
  }
}

export default config
