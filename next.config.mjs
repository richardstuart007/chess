/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['nextjs-shared'],
  serverExternalPackages: ['stockfish'],
  outputFileTracingExcludes: {
    '/api/analysis/**': [
      'node_modules/stockfish/bin/stockfish.wasm',
      'node_modules/stockfish/bin/stockfish.js',
      'node_modules/stockfish/bin/stockfish-18.wasm',
      'node_modules/stockfish/bin/stockfish-18.js',
      'node_modules/stockfish/bin/stockfish-18-single.wasm',
      'node_modules/stockfish/bin/stockfish-18-single.js',
      'node_modules/stockfish/bin/stockfish-18-lite.wasm',
      'node_modules/stockfish/bin/stockfish-18-lite.js',
      'node_modules/stockfish/bin/stockfish-18-asm.js'
    ]
  },
  logging: {
    fetches: { fullUrl: false }
  }
}

export default config
