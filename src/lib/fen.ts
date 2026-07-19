//----------------------------------------------------------------------------------
//  truncateFen — keep only the 4 positional fields (piece placement, active color,
//  castling rights, en passant target); drop halfmove clock + fullmove number, which
//  are bookkeeping, not part of what makes two positions "the same"
//----------------------------------------------------------------------------------
export function truncateFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

//----------------------------------------------------------------------------------
//  expandFen — append a hardcoded halfmove clock and fullmove number to a 4-field FEN,
//  producing a full 6-field FEN. Neither value is meaningful to this app (no 50-move-rule
//  tracking, no consumer reads fullmove number back out of a FEN), so both are fixed.
//----------------------------------------------------------------------------------
export function expandFen(fen4: string): string {
  return `${fen4} 0 1`
}
