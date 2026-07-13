'use client'

import { useState } from 'react'

//----------------------------------------------------------------------------------------------
//  STEPS — structured data flow for all 3 pipeline steps
//----------------------------------------------------------------------------------------------
const STEPS = [
  {
    num: '1',
    title: 'Game Sync',
    input: [
      'chess.com REST API — /pub/player/{username}/games/{year}/{month}',
    ],
    processing:
      'Downloads new games for all players. Parses PGN headers to extract opening name, ECO code, result, player ratings, time class (blitz/rapid/bullet) and termination type. Skips games already in the database.',
    output: [
      'tgr_gamesraw — one row per game per player: raw PGN and full JSON response from chess.com',
      'tgd_gamesdecon — parsed game fields: ECO, opening, result, ratings, time class, termination',
      'tplr_player_ratings — latest rating per player per time class',
    ],
  },
  {
    num: '2a',
    title: 'Build Game Positions (tgam)',
    input: [
      'tgd_gamesdecon — PGN and game result for each game not yet in tgam_game_positions',
    ],
    processing:
      'Replays each game using chess.js and writes one row per tracked-player move directly to tgam_game_positions, FEN text included — self-contained, no dependency on tpos_positions. Skips games already processed.',
    output: [
      'tgam_game_positions — per-player, per-game record: position FEN, move played (SAN + UCI), resulting FEN, move number',
    ],
  },
  {
    num: '2b',
    title: 'Sync Position Tree (tpos)',
    input: [
      'tgam_game_positions — rows with gam_pos_id / gam_resulting_pos_id still NULL',
    ],
    processing:
      'Idempotent derivation of tpos_positions from tgam_game_positions: inserts any missing tpos_positions row, backfills gam_pos_id/gam_resulting_pos_id by FEN match, recomputes pos_reached for positions just touched. Safe to re-run any time.',
    output: [
      'tpos_positions — unique FEN positions reached across all games, with pos_reached',
      'tgam_game_positions.gam_pos_id / gam_resulting_pos_id — backfilled',
    ],
  },
  {
    num: '3',
    title: 'Purge Stale Positions',
    input: [
      'tpos_positions — positions with pos_reached <= MIN_REACH_TO_KEEP whose occurrences are all older than PURGE_REACH_GRACE_DAYS',
    ],
    processing:
      'Deletes low-value positions once they age past the grace period without repeating: teva_evaluations, then tgam_game_positions (dual-reference rule — full delete only when the before-position is in scope, else just null the resulting reference), then the tpos_positions rows themselves. Stamps tgd_gamesdecon.gd_positions_purged on any game left with zero tgam rows, so Build Game Positions never mistakes a purged game for an unprocessed one. Runs before Evaluate Positions so Stockfish time is never spent on positions about to be deleted. Also runs unattended via /api/analysis/cron. Deliberate exception to the "no destructive SQL in automation" rule — see project .claude/CLAUDE.md.',
    output: [
      'teva_evaluations / tgam_game_positions / tpos_positions — rows removed',
      'tgd_gamesdecon.gd_positions_purged — set true on emptied games (resurrection guard)',
    ],
  },
  {
    num: '4',
    title: 'Evaluate Positions',
    input: [
      'tpos_positions — unique FEN positions not yet in teva_evaluations, pos_reached > MIN_REACH_TO_KEEP',
    ],
    processing:
      'Evaluates each unique board position from the tree with Stockfish, skipping positions with pos_reached <= MIN_REACH_TO_KEEP (purge candidates — evaluating them risks wasted work). Normalises the centipawn score to white\'s perspective and records the best move. Date-independent — always ordered by pos_reached DESC, so the most commonly reached positions get evaluated first regardless of when they occurred. Run in batches; repeat until processed = 0. Also runs unattended via a local scheduled task hitting /api/analysis/cron.',
    output: [
      'teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI), search depth',
    ],
  },
  {
    num: '4b',
    title: 'Update CP Change',
    input: [
      'tgam_game_positions — gam_cp_change still NULL, whose before/after positions both now have a teva_evaluations row',
    ],
    processing:
      "Computes gam_cp_change (centipawn loss from the tracked player's perspective) for each move once both its before and after positions have been evaluated. Scoped to gam_cp_change IS NULL — never re-touches already-computed rows. Decoupled from Evaluate Positions (own trigger, own status). Also runs unattended via /api/analysis/cron.",
    output: [
      'tgam_game_positions.gam_cp_change — per-move centipawn loss, computed',
    ],
  },
]

const ROW_COUNT_SQL =
  `SELECT tbl, cnt FROM (
  SELECT 1 ord, 'tgr_gamesraw'         tbl, COUNT(*) cnt FROM tgr_gamesraw
  UNION ALL SELECT 2, 'tgd_gamesdecon',         COUNT(*) FROM tgd_gamesdecon
  UNION ALL SELECT 3, 'tpos_positions',         COUNT(*) FROM tpos_positions
  UNION ALL SELECT 4, 'tgam_game_positions',    COUNT(*) FROM tgam_game_positions
  UNION ALL SELECT 5, 'teva_evaluations',       COUNT(*) FROM teva_evaluations
) t ORDER BY ord;`

//----------------------------------------------------------------------------------------------
//  PipelineHelp — wider structured help popover for the Analysis Pipeline page
//----------------------------------------------------------------------------------------------
export default function PipelineHelp() {
  const [open, setOpen] = useState(false)

  return (
    <span className='inline-block'>
      <button
        onClick={() => setOpen(o => !o)}
        className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'
        type='button'
      >
        Help
      </button>

      {open && (
        <div className='absolute z-20 mt-1 left-0 w-[min(2000px,90vw)] max-h-[85vh] overflow-y-auto p-4 bg-blue-50 border border-blue-200 rounded-md shadow-xl text-xs'>

          <div className='flex justify-between items-center mb-3'>
            <p className='font-semibold text-blue-800 text-sm'>Analysis Pipeline — Data Flow</p>
            <button
              onClick={() => setOpen(false)}
              className='ml-4 text-gray-400 hover:text-gray-700 text-base leading-none font-bold'
              type='button'
            >
              ×
            </button>
          </div>

          <div className='space-y-3'>
            {STEPS.map(step => (
              <div key={step.num} className='bg-white border border-blue-100 rounded'>
                <div className='bg-blue-100 px-3 py-1.5 rounded-t'>
                  <p className='font-semibold text-blue-800'>Step {step.num} — {step.title}</p>
                </div>
                <table className='w-full text-xs border-collapse'>
                  <tbody>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 w-24 px-3 py-2 border-b border-gray-100 whitespace-nowrap'>Input</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>
                        {step.input.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2 border-b border-gray-100'>Processing</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>{step.processing}</td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2'>Output</td>
                      <td className='text-gray-700 px-3 py-2'>
                        {step.output.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <div className='bg-white border border-blue-100 rounded p-3'>
              <p className='font-semibold text-gray-600 mb-2'>Row Count SQL</p>
              <pre className='text-gray-700 font-mono text-xs whitespace-pre overflow-x-auto leading-relaxed'>{ROW_COUNT_SQL}</pre>
            </div>
          </div>

        </div>
      )}
    </span>
  )
}
