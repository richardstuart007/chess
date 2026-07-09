/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['nextjs-shared'],
  logging: {
    fetches: { fullUrl: false }
  }
}

export default config
