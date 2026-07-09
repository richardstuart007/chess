import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/nextjs-shared/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {}
  }
}

export default config
