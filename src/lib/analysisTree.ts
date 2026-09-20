import { Chess } from 'chess.js'
import { PlyEvaluation } from './stockfish'

// --------------------------------------------------------------------------
//  Types
// --------------------------------------------------------------------------

export interface MoveNode {
  id: string
  san: string
  from: string
  to: string
  fen: string
  fenBefore: string
  parent: MoveNode | null
  children: MoveNode[]
  evaluation?: PlyEvaluation
  isMainLine: boolean
}

export interface AnalysisTree {
  root: MoveNode          // sentinel – fen = starting position, san = ''
  mainLine: MoveNode[]    // flat cache of main-line nodes
}

export interface MultiPvResult {
  rank: number
  cp: number
  bestMoveUci: string
  bestMoveSan: string
  lineSans: string[]
  lineUci: string[]
}

//----------------------------------------------------------------------------------
//  buildTree — Build tree from a parsed game
//
//  Params:
//    history — the game's moves: san, from, to
//    fens — the FEN after each move
//    plyEvals — the per-ply evaluations, attached to the matching nodes
//
//  Returns:
//    the AnalysisTree (root + flat main-line cache)
//----------------------------------------------------------------------------------
export function buildTree(
  history: { san: string; from: string; to: string }[],
  fens: string[],
  plyEvals: PlyEvaluation[]
): AnalysisTree {
  // Sentinel root (position before move 1)
  const root: MoveNode = {
    id: 'root',
    san: '',
    from: '',
    to: '',
    fen: fens[0],
    fenBefore: fens[0],
    parent: null,
    children: [],
    isMainLine: true
  }

  const mainLine: MoveNode[] = []
  let prev = root

  for (let i = 0; i < history.length; i++) {
    const node: MoveNode = {
      id: `main-${i}`,
      san: history[i].san,
      from: history[i].from,
      to: history[i].to,
      fen: fens[i + 1],
      fenBefore: fens[i],
      parent: prev,
      children: [],
      evaluation: plyEvals[i],
      isMainLine: true
    }
    prev.children.push(node)
    mainLine.push(node)
    prev = node
  }

  return { root, mainLine }
}

// --------------------------------------------------------------------------
//  Add a branch move as a child of `parent`
// --------------------------------------------------------------------------

let branchCounter = 0

//----------------------------------------------------------------------------------
//  addBranch — adds a variation move under a parent node, or returns the existing child when that exact move is already there
//
//  Params:
//    parent — the node the move is played from
//    san — the move, in SAN
//    from — the move's origin square
//    to — the move's destination square
//    fen — the resulting FEN
//
//  Returns:
//    the (new or existing) child node
//----------------------------------------------------------------------------------
export function addBranch(
  parent: MoveNode,
  san: string,
  from: string,
  to: string,
  fen: string
): MoveNode {
  // Check if this exact move already exists as a child
  const existing = parent.children.find(c => c.san === san)
  if (existing) return existing

  const node: MoveNode = {
    id: `var-${branchCounter++}`,
    san,
    from,
    to,
    fen,
    fenBefore: parent.fen,
    parent,
    children: [],
    isMainLine: false
  }
  parent.children.push(node)
  return node
}

//----------------------------------------------------------------------------------
//  addPvBranch — Add a full PV line as a chain of branch nodes
//
//  Params:
//    parent — the node the line starts from
//    lineSans — the line's moves, in SAN
//
//  Returns:
//    the resulting node, or null when there is no line to add
//----------------------------------------------------------------------------------
export function addPvBranch(
  parent: MoveNode,
  lineSans: string[]
): MoveNode | null {
  if (lineSans.length === 0) return null

  try {
    const g = new Chess(parent.fen)
    let current = parent
    let firstNode: MoveNode | null = null

    for (const san of lineSans) {
      // Try SAN first, fall back to searching legal moves
      let result = g.move(san)
      if (!result) {
        // Try finding the move in legal moves (handles minor notation differences)
        const legalMoves = g.moves({ verbose: true })
        const match = legalMoves.find(m => m.san === san || m.lan === san)
        if (match) {
          result = g.move(match.san)
        }
        if (!result) break
      }
      current = addBranch(current, result.san, result.from, result.to, g.fen())
      if (!firstNode) firstNode = current
    }

    return firstNode
  } catch {
    return null
  }
}

//----------------------------------------------------------------------------------
//  getPath — Get path from root to a node (inclusive of node, exclusive of root)
//
//  Params:
//    node — the node to walk back from
//
//  Returns:
//    the nodes on the path, in play order (the sentinel root excluded)
//----------------------------------------------------------------------------------
export function getPath(node: MoveNode): MoveNode[] {
  const path: MoveNode[] = []
  let current: MoveNode | null = node
  while (current && current.san !== '') {
    path.unshift(current)
    current = current.parent
  }
  return path
}

//----------------------------------------------------------------------------------
//  replayToNode — Replay a path to get a Chess instance at that position
//
//  Params:
//    node — the node to replay to
//    startFen — the position to start from instead of the standard start (optional)
//
//  Returns:
//    the Chess instance positioned after the node's move
//----------------------------------------------------------------------------------
export function replayToNode(node: MoveNode, startFen?: string): Chess {
  const path = getPath(node)
  const g = startFen ? new Chess(startFen) : new Chess()
  for (const n of path) {
    g.move(n.san)
  }
  return g
}

//----------------------------------------------------------------------------------
//  findMainLineAncestor — Find the main-line ancestor (walk up until isMainLine)
//
//  Params:
//    node — the node to start from
//
//  Returns:
//    the closest main-line ancestor, or the node itself when none is found
//----------------------------------------------------------------------------------
export function findMainLineAncestor(node: MoveNode): MoveNode {
  let current: MoveNode | null = node
  while (current && !current.isMainLine) {
    current = current.parent
  }
  return current ?? node
}

//----------------------------------------------------------------------------------
//  isOnMainLine — Check if a node is on the main line
//
//  Params:
//    node — the node to check (null counts as on the main line)
//
//  Returns:
//    true when the node is on the main line
//----------------------------------------------------------------------------------
export function isOnMainLine(node: MoveNode | null): boolean {
  if (!node) return true
  let current: MoveNode | null = node
  while (current) {
    if (!current.isMainLine) return false
    current = current.parent
  }
  return true
}

//----------------------------------------------------------------------------------
//  getMainLineIndex — Get main-line index for a node (-1 if not on main line)
//
//  Params:
//    node — the node to look up
//    tree — the analysis tree
//
//  Returns:
//    the node's index in tree.mainLine, or -1
//----------------------------------------------------------------------------------
export function getMainLineIndex(node: MoveNode, tree: AnalysisTree): number {
  return tree.mainLine.indexOf(node)
}

//----------------------------------------------------------------------------------
//  collectNodesFromMove — Walk the whole tree (main line + every variation) and return every node
//  whose full-move number is >= minMove — shared by ChessBoardView_shared and
//  MasterGameView_master's move-play-count badge lookups
//
//  Params:
//    root — the tree's root node
//    minMove — the lowest full-move number to include
//
//  Returns:
//    the matching nodes
//----------------------------------------------------------------------------------
export function collectNodesFromMove(root: MoveNode, minMove: number): MoveNode[] {
  const result: MoveNode[] = []
  //----------------------------------------------------------------------------------------------
  //  walk — recursively visits a node and its children, collecting every node from minMove onward into result
  //
  //  Params:
  //    node — the node to visit
  //    ply — the node's 1-indexed ply (0 for the root)
  //----------------------------------------------------------------------------------------------
  function walk(node: MoveNode, ply: number) {
    if (ply > 0) {
      const moveNum = Math.floor((ply - 1) / 2) + 1
      if (moveNum >= minMove) result.push(node)
    }
    for (const child of node.children) {
      walk(child, ply + 1)
    }
  }
  walk(root, 0)
  return result
}

//----------------------------------------------------------------------------------
//  getMoveNumberAndColor — Full move number + side to move for a 1-indexed ply (ply 1 = White's first
//  move, ply 2 = Black's first move, ...) — shared by getCurrentMoveLabel below
//  and runAnalysis's progress display (ChessBoardView_shared/MasterGameView_master).
//
//  Params:
//    ply — the 1-indexed ply (1 = White's first move, 2 = Black's first move, ...)
//
//  Returns:
//    moveNumber — the full-move number
//    isWhite — true when the ply is White's move
//----------------------------------------------------------------------------------
export function getMoveNumberAndColor(ply: number): { moveNumber: number; isWhite: boolean } {
  const moveNumber = Math.floor((ply - 1) / 2) + 1
  const isWhite = (ply - 1) % 2 === 0
  return { moveNumber, isWhite }
}

//----------------------------------------------------------------------------------
//  getCurrentMoveLabel — "16.Ng6" / "16...Ng6" for whatever position is currently on the board
//  (matching MoveTree_shared.tsx's own move-number notation), "Starting
//  position" at the root (no move played yet) — shared by ChessBoardView_shared
//  and MasterGameView_master's "Position Analysis {label}" heading
//
//  Params:
//    currentNode — the node on the board, or null at the start
//    currentPly — the node's 1-indexed ply
//
//  Returns:
//    e.g. '16.Ng6' / '16...Ng6', or 'Starting position' at the root
//----------------------------------------------------------------------------------
export function getCurrentMoveLabel(currentNode: MoveNode | null, currentPly: number): string {
  if (!currentNode) return 'Starting position'
  const { moveNumber, isWhite } = getMoveNumberAndColor(currentPly)
  return `${moveNumber}${isWhite ? '.' : '...'}${currentNode.san}`
}
