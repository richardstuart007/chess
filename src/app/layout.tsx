import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { DevLayoutHeader } from 'nextjs-shared/DevLayoutHeader'
import AppShell from '@/src/ui/AppShell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'Next Chess',
  description: 'Analyze your chess.com games with Stockfish'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const DB_LOCATION = process.env.POSTGRES_DATABASE_LOCATION ?? 'unknown'
  const IS_DEV = process.env.NEXT_PUBLIC_APPENV_ISDEV === 'true'

  return (
    <html
      lang='en'
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='min-h-full flex flex-col bg-background text-foreground'>
        <NuqsAdapter>
          {IS_DEV && <DevLayoutHeader dbLocation={DB_LOCATION} />}
          <main className='w-full flex-1 px-4 py-6'>
            <AppShell>{children}</AppShell>
          </main>
        </NuqsAdapter>
      </body>
    </html>
  )
}
