export default function Home() {
  return (
    <div className='flex min-h-full flex-col items-center justify-center gap-4 px-6 py-24 text-center'>
      <span className='text-5xl'>♞</span>
      <h1 className='text-4xl font-bold tracking-tight'>Chess</h1>
      <p className='max-w-md text-lg text-foreground/70'>
        Deep, Stockfish-powered analysis of your chess.com games — coming soon.
      </p>
    </div>
  )
}
