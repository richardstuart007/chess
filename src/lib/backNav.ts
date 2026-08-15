import { SESSION_STORAGE_PREFIX } from './constants'

const BACK_STACK_KEY = `${SESSION_STORAGE_PREFIX}back_stack`

//
//  player is genuinely present on every page in the app's navigation graph (Home, Openings,
//  Habits, Position Detail, Analyze all carry ?player=), so it always takes its current live
//  value on pop, never the value frozen in the popped snapshot. eco/opening/dateFrom are
//  deliberately NOT included here even though they're also "global filters" shared via
//  useGlobalFilter.ts — they only exist on pages that actually have those filters
//  (Games/Habits/Graph/Openings/Termination), not on Position Detail or Analyze. Overriding
//  them from a page that doesn't carry them at all would delete legitimate values from the
//  popped target instead of restoring them, so they're left as pure historical snapshots —
//  restored exactly as captured at push time, same as any other param in a popped URL (e.g.
//  Position Detail's own tab/move).
//
const GLOBAL_FILTER_BACK_KEYS = ['player']

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(BACK_STACK_KEY)
    return raw ? JSON.parse(raw) as string[] : []
  } catch {
    return []
  }
}

function writeStack(stack: string[]): void {
  try {
    sessionStorage.setItem(BACK_STACK_KEY, JSON.stringify(stack))
  } catch {
    // Non-critical — worst case, back navigation falls back to the caller's default
  }
}

//----------------------------------------------------------------------------------------------
//  pushBackTarget — call immediately before navigating to a "deeper" page, with the URL
//  (path + search) of the page being left
//----------------------------------------------------------------------------------------------
export function pushBackTarget(url: string): void {
  const stack = readStack()
  stack.push(url)
  writeStack(stack)
}

//----------------------------------------------------------------------------------------------
//  popBackTarget — call from a "← Back" click. Pops the last pushed URL (if any, else
//  fallback), then overrides its global-filter params with their current live values from
//  currentSearchParams (the page being left) before returning the URL to navigate to.
//----------------------------------------------------------------------------------------------
export function popBackTarget(currentSearchParams: URLSearchParams, fallback: string): string {
  const stack = readStack()
  const popped = stack.pop()
  writeStack(stack)
  if (!popped) return fallback

  const [path, qs] = popped.split('?')
  const params = new URLSearchParams(qs ?? '')
  for (const key of GLOBAL_FILTER_BACK_KEYS) {
    const current = currentSearchParams.get(key)
    if (current) params.set(key, current)
    else params.delete(key)
  }
  const newQs = params.toString()
  return newQs ? `${path}?${newQs}` : path
}
