declare module 'stockfish' {
  interface StockfishEngine {
    sendCommand: (cmd: string) => void
    listener?: (line: string) => void
  }
  function initEngine(enginePath?: string): Promise<StockfishEngine>
  export default initEngine
}
