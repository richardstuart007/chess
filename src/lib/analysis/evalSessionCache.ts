import { truncateFen } from '../fen'

//----------------------------------------------------------------------------------
//  evalSessionCache — plain in-memory Map, keyed by truncated FEN, holding evaluations
//  computed client-side by useMissingEvalAnalysis. Deliberately not sessionStorage and not
//  the database — a module-level singleton persists for the life of the browser tab
//  (survives client-side route navigation, since the module stays loaded) and is gone on
//  refresh/close. Never written to by anything except useMissingEvalAnalysis, and never
//  backed by a DB write, so it can't create a tpos_positions row or interact with
//  purgeStaleReachOnePositions (see chessdb_shared.ts's getFenEvalsWithFallback_shared).
//----------------------------------------------------------------------------------
const cache = new Map<string, { cp: number; depth: number }>()

//----------------------------------------------------------------------------------
//  getCachedEval — the cached evaluation for a FEN, or undefined if never computed this
//  session
//
//  Params:
//    fen — the position (truncated internally)
//
//  Returns:
//    the cached { cp, depth }, or undefined
//----------------------------------------------------------------------------------
export function getCachedEval(fen: string): { cp: number; depth: number } | undefined {
  return cache.get(truncateFen(fen))
}

//----------------------------------------------------------------------------------
//  setCachedEval — stores a freshly-computed evaluation for a FEN, for the rest of this
//  browser tab's session
//
//  Params:
//    fen — the position (truncated internally)
//    value — the evaluation to cache: cp and depth
//----------------------------------------------------------------------------------
export function setCachedEval(fen: string, value: { cp: number; depth: number }): void {
  cache.set(truncateFen(fen), value)
}
