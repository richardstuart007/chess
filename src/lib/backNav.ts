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

//----------------------------------------------------------------------------------------------
//  pushBackTarget — call immediately before navigating to a "deeper" page, with the URL
//  (path + search) of the page being left
//
//  Params:
//    url — the URL (path + search) of the page being left
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
//
//  Params:
//    currentSearchParams — the search params of the page being left, whose live global-filter values override the popped URL's
//    fallback — the URL to return when nothing has been pushed
//
//  Returns:
//    the URL to navigate back to
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
  const result = newQs ? `${path}?${newQs}` : path
  return result
}

//----------------------------------------------------------------------------------
//  readStack — reads the back-navigation stack from sessionStorage
//
//  Returns:
//    the stack of URLs (empty when unset, corrupt or sessionStorage is unavailable)
//----------------------------------------------------------------------------------
function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(BACK_STACK_KEY)
    const result = raw ? JSON.parse(raw) as string[] : []
    return result
  } catch {
    return []
  }
}

//----------------------------------------------------------------------------------
//  writeStack — writes the back-navigation stack to sessionStorage (silently ignores failures)
//
//  Params:
//    stack — the stack of URLs to store
//----------------------------------------------------------------------------------
function writeStack(stack: string[]): void {
  try {
    sessionStorage.setItem(BACK_STACK_KEY, JSON.stringify(stack))
  } catch {
    //
    //  Non-critical — worst case, back navigation falls back to the caller's default
    //
  }
}
