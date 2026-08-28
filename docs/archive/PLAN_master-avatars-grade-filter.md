# PLAN_master-avatars-grade-filter — chess

## Title
Master box: top-4 cards with local avatars; grade in the master "Player" filter; unified panel colours

## Decisions locked
- **4** master cards (revised 2026-08-28 from 6), ranked by `mst_grade DESC`: Carlsen, Caruana,
  Nakamura, Sindarov (derived from data, not a hardcoded name list).
- Full `PlayerProfile` cards in a **single horizontal row** (`flex gap-3`) in the Master box —
  not a 2-per-row grid.
- Avatars = static local files in `public/avatars/`, downloaded once for 6 handles (2 tracked
  players + 4 masters). No re-fetch mechanism.
- Both nav panels (Player + Master) share one background: `bg-amber-50` normally, `bg-pink-100`
  when that section group owns the current route; the old yellow active outline is removed.
- `FilterMasterPlayerSelect`: options relabelled `Name (grade)`, sorted grade-descending, widened
  `w-32 -> w-56` via a new `WIDTH_MASTER_PLAYER` constant.
- **Avatar wiring — Option B + no SQL (chosen 2026-08-28, revising the original column approach):**
  - Both card sets resolve their avatar filename from constants in `src/lib/constants.ts` — a
    shared `AVATAR_DIR` plus `MASTER_AVATARS` (`mst_chesscom_handle` → filename, top 4 masters) and
    `PLAYER_AVATARS` (`pl_player` → filename, tracked players). Images live in `public/avatars/`.
  - `tmst_master_players` gets **no `mst_avatar` column**. `tpl_players.pl_avatar` is left as-is and
    used only as a fallback for a future tracked player not in `PLAYER_AVATARS`.
  - No manual SQL at all — reverts the `mst_avatar` column, the `MasterPlayerRow.avatar` field, and
    every `UPDATE` (master and `pl_avatar`) from the earlier passes.

## Plan
- [x] Download 8 avatars into `public/avatars/` (master URLs re-fetched fresh at execution time;
      tracked URLs are the current `pl_avatar` values):
      - stricade.jpeg, astarrboy.png (tracked)
      - magnuscarlsen.jpg, fabianocaruana.png, hikaru.png, javokhir_sindarov05.jpg,
        vincentkeymer.png, gmwso.jpg (masters)
- [x] `scripts/schema.sql` — add `mst_avatar text` to `tmst_master_players` (after `mst_chesscom_handle`).
- [x] Manual SQL given in chat (run in pgAdmin4 on local + prod; confirmed before `#commit`):
      ALTER TABLE tmst_master_players ADD COLUMN mst_avatar text;
      6 x UPDATE tmst_master_players SET mst_avatar = '/avatars/{handle}.{ext}' WHERE mst_chesscom_handle = '{Handle}';
      2 x UPDATE tpl_players SET pl_avatar = '/avatars/{handle}.{ext}' WHERE pl_player = '{handle}';
- [x] `src/lib/actions/masterPlayers.ts` — `MasterPlayerRow` gains `avatar: string | null`;
      `getMasterPlayers` adds `mst_avatar` to `columns` and to the row mapper; change-history line.
- [x] `src/ui/AppNav.tsx` — replace single `masterCard` with `masterCards: MasterPlayerRow[]` =
      `getMasterPlayers('', true)` sliced to 6; render `grid grid-cols-2 gap-3` of static
      `PlayerProfile` cards (`avatar={card.avatar ?? MASTER_CARD_AVATAR}`, `ratings={{ Grade }}`);
      update numbered header + demote the `MASTER_CARD_AVATAR` comment to "fallback".
- [x] `src/lib/master/masterGamesList.ts` — `SyncedMasterPlayer` -> `{ handle; name; grade: number | null }`;
      `getSyncedMasterPlayers` does one `getMasterPlayers('')` pass to build a `handle -> {name, grade}`
      map (replacing the `getMasterHandleNameMap` call), then sorts result `grade DESC NULLS LAST`;
      header updated.
- [x] `src/ui/filters/FilterMasterPlayerSelect.tsx` — option label
      `grade != null ? ` + "`${name} (${grade})`" + ` : name`; `{ value:'', label:'All' }` stays
      first; `width` default -> `WIDTH_MASTER_PLAYER`; header updated.
- [x] `src/lib/constants.ts` — add `export const WIDTH_MASTER_PLAYER = 'w-56'` beside the other `WIDTH_*`.
- [x] `src/app/owner/constants/page.tsx` — add the `WIDTH_MASTER_PLAYER` mirror entry (import,
      `ConstantSection`, description, `consumers: ['FilterMasterPlayerSelect.tsx: FilterMasterPlayerSelect']`).
- [x] `src/ui/dataflow/sections.tsx` — update the two `pl_avatar` notes (Rules/gotchas + Chess.com
      API section) to state avatars are downloaded once into `public/avatars/` and the columns store
      a local path.
- [x] `.claude/CLAUDE.md` — mark the "Store the player avatar image on the app" outstanding item as
      partially done (8 handles migrated; all-masters + auto-refresh still open).

## Plan — Option B rework (2026-08-28)
- [x] `scripts/schema.sql` — revert: remove `mst_avatar text` from `tmst_master_players`.
- [x] `src/lib/actions/masterPlayers.ts` — revert: drop `avatar` from `MasterPlayerRow`, drop
      `mst_avatar` from `getMasterPlayers` `columns` + mapper, remove the change-history line added
      for it.
- [x] `src/lib/constants.ts` — add `MASTER_AVATAR_DIR = '/avatars/'` and a `MASTER_AVATARS`
      `Record<string,string>` map (handle → filename) for the 6 master handles.
- [x] `src/ui/AppNav.tsx` — build each master card's avatar from
      `MASTER_AVATARS[m.chesscomHandle] ? MASTER_AVATAR_DIR + MASTER_AVATARS[m.chesscomHandle] : MASTER_CARD_AVATAR`
      instead of `m.avatar`; update the header NOTES/CHANGE HISTORY wording.
- [x] `src/app/owner/constants/page.tsx` — add `MASTER_AVATAR_DIR` + `MASTER_AVATARS` mirror
      entries (import, `ConstantSection` rows, descriptions, `consumers: ['AppNav.tsx: AppNav']`).
- [x] `src/ui/dataflow/sections.tsx` — adjust wording: `mst_avatar` column no longer exists; the 6
      master cards resolve their avatar via the `MASTER_AVATARS` constants map.
- [x] `.claude/CLAUDE.md` — adjust the outstanding-item wording: no `mst_avatar` column; masters use
      a constants map, tracked players use `pl_avatar`.
- [x] Manual SQL: masters `ALTER`/`UPDATE`s dropped; only the 2 `tpl_players` `pl_avatar` `UPDATE`s remain.

## Plan — top-4 + horizontal row (2026-08-28)
- [x] `src/ui/AppNav.tsx` — `masterCards` slice `6 → 4`; card container
      `grid grid-cols-2 gap-3 → flex gap-3` (one horizontal row); updated header NOTES/CHANGE HISTORY
      wording (top 6 → top 4, grid → row) + the fetch comment.
- [x] `src/lib/constants.ts` — trimmed `MASTER_AVATARS` to the 4 rendered handles (MagnusCarlsen,
      FabianoCaruana, Hikaru, Javokhir_Sindarov05); dropped the VincentKeymer / GMWSO entries;
      section comment "top 6" → "top 4".
- [x] `public/avatars/` — deleted now-unused `vincentkeymer.png` and `gmwso.jpg`.
- [x] `src/app/owner/constants/page.tsx` — `MASTER_AVATARS` description "6 top-grade" → "4 top-grade".
- [x] `src/ui/dataflow/sections.tsx` + `.claude/CLAUDE.md` — "6 master cards" → "4 master cards"
      (and the manual-download count 8 → 6, "~143" → "~145" masters remaining).
- [x] Note: Master box is ~half viewport width; 4 full cards in one row may be tight — verify fit in
      the browser and, if cramped, follow up on a compact card variant or wider Master box.

## Plan — tracked-player avatars local too, no SQL (2026-08-28)
- [x] `src/lib/constants.ts` — renamed `MASTER_AVATAR_DIR` → `AVATAR_DIR` (now shared); added a
      `PLAYER_AVATARS` `Record<string,string>` map: `stricade` → `stricade.jpeg`,
      `astarrboy` → `astarrboy.png`. Section comment rewritten to cover both maps.
- [x] `src/ui/AppShell.tsx` — in `PlayerHeader`, resolve each card's avatar as
      `PLAYER_AVATARS[p.player] ? AVATAR_DIR + PLAYER_AVATARS[p.player] : (db?.pl_avatar ?? undefined)`
      instead of the bare `db?.pl_avatar`; import added. No `pl_avatar` UPDATEs — nothing to run.
- [x] `src/ui/AppNav.tsx` — `MASTER_AVATAR_DIR` import/usage → `AVATAR_DIR`; stale "top 6" comment
      fixed to "top 4".
- [x] `src/app/owner/constants/page.tsx` — section renamed "Master Card Avatars" → "Card Avatars";
      `MASTER_AVATAR_DIR` entry → `AVATAR_DIR` (consumers now `AppNav` + `AppShell: PlayerHeader`);
      added a `PLAYER_AVATARS` entry (`consumers: ['AppShell.tsx: PlayerHeader']`).
- [x] `src/ui/dataflow/sections.tsx` + `.claude/CLAUDE.md` — rewrote the avatar notes: both card
      sets resolve from constants (`PLAYER_AVATARS` / `MASTER_AVATARS` + shared `AVATAR_DIR`), no
      CDN request; `pl_avatar` is fallback-only for future tracked players.
- [x] No manual SQL anywhere in this plan — the whole feature is code + static files only.

## Plan — panel background colours (2026-08-28)
- [x] `src/ui/AppNav.tsx` — `TabGroup`: both boxes render identically — `bg-amber-50` normally,
      `bg-pink-100` when `isGroupActive`. Dropped the `bg-blue-50` (Player) / `bg-amber-50` (Master)
      call-site values, the `boxClassName` prop, and the `outline outline-2 outline-yellow-400`
      selected style. `className={isGroupActive ? 'bg-pink-100' : 'bg-amber-50'}`. Header comment
      updated. `PlayerProfile` cards inside untouched.

## Changes

### public/avatars/ (new)
- Added 6 downloaded avatar images (one-time fetch from chess.com, not re-fetched):
  `stricade.jpeg`, `astarrboy.png` (tracked players); `magnuscarlsen.jpg`, `fabianocaruana.png`,
  `hikaru.png`, `javokhir_sindarov05.jpg` (top-4 masters). Master URLs were pulled fresh from
  `GET https://api.chess.com/pub/player/{lowercase-handle}` → `avatar` field; tracked URLs were the
  existing `pl_avatar` values. (`vincentkeymer.png` + `gmwso.jpg` were downloaded during the first
  pass and then deleted when the set dropped from 6 to 4.)

### scripts/schema.sql
- No net change. (`mst_avatar text` was added in the first pass, then reverted for Option B — the
  6 master cards are a fixed curated set and get no column.)

### src/lib/actions/masterPlayers.ts
- No net change. (`MasterPlayerRow.avatar` + `mst_avatar` column read were added then reverted for
  Option B.)

### src/ui/AppNav.tsx
- Master box now renders the top 4 masters by grade instead of a single Carlsen card:
  `masterCard` state → `masterCards: MasterPlayerRow[]`, fetched via `getMasterPlayers('', true)`
  sliced to 4; `masterCardContent` is a `flex gap-3` single horizontal row of static
  `PlayerProfile` cards with `{ Grade }` badges.
- Each card's avatar is resolved from the `MASTER_AVATARS` constants map:
  `avatarFile = MASTER_AVATARS[m.chesscomHandle]`, `src = avatarFile ? AVATAR_DIR + avatarFile
  : MASTER_CARD_AVATAR`. No DB column involved.
- `MASTER_CARD_AVATAR` comment demoted to "fallback for any handle not in the MASTER_AVATARS map".
- Updated the numbered header NOTES + added a CHANGE HISTORY section.

### src/ui/AppNav.tsx (panel colours)
- `TabGroup` now renders both the Player and Master boxes identically: `bg-amber-50` in the normal
  state, `bg-pink-100` when the group owns the current route (`isGroupActive`). Removed the per-box
  `bg-blue-50`/`bg-amber-50` distinction, the `boxClassName` prop (both call sites), and the
  `outline outline-2 outline-yellow-400` active-group outline — the pink background is now the sole
  active-group indicator. Header comment updated.

### src/ui/AppShell.tsx
- `PlayerHeader` resolves each tracked-player card's avatar from the `PLAYER_AVATARS` constants map
  (`avatarFile = PLAYER_AVATARS[p.player]`, `src = avatarFile ? AVATAR_DIR + avatarFile
  : (db?.pl_avatar ?? undefined)`) instead of the bare `db?.pl_avatar` — so no request goes to
  chess.com's CDN for the current 2 players. Import added.

### src/lib/master/masterGamesList.ts
- `SyncedMasterPlayer` type gains `grade: number | null`.
- `getSyncedMasterPlayers` — builds a `handle → { name, grade }` map from one `getMasterPlayers('')`
  pass (instead of `getMasterHandleNameMap()`), attaches `grade`, and sorts the result
  grade-descending (NULLS last) in JS. Header updated with a change-history line.
- Import line adds `getMasterPlayers` alongside `getMasterHandleNameMap` (latter still used elsewhere).

### src/ui/filters/FilterMasterPlayerSelect.tsx
- Option labels are now `` `${name} (${grade})` `` when grade is present, else `name`; "All" stays first.
- `width` default `'w-32'` → `WIDTH_MASTER_PLAYER` (imported from `@/src/lib/constants`).
- Header updated (description, `width` param note, CHANGE HISTORY).

### src/lib/constants.ts
- Added `export const WIDTH_MASTER_PLAYER = 'w-56'` beside `WIDTH_PLAYER`.
- Added a "Card avatars" section: `AVATAR_DIR = '/avatars/'` (shared), a `MASTER_AVATARS`
  `Record<string,string>` map (4 `mst_chesscom_handle` → filename), and a `PLAYER_AVATARS` map
  (2 `pl_player` → filename). Native extensions kept.

### src/app/owner/constants/page.tsx
- Added `WIDTH_MASTER_PLAYER` to the imports, a `ConstantSection` row (with description + consumer
  `FilterMasterPlayerSelect.tsx: FilterMasterPlayerSelect`), and a `FUNCTION_DESCRIPTIONS` entry for
  `FilterMasterPlayerSelect.tsx: FilterMasterPlayerSelect`.
- Added `AVATAR_DIR` + `MASTER_AVATARS` + `PLAYER_AVATARS` to the imports and a "Card Avatars"
  `ConstantSection` (`AVATAR_DIR` consumed by `AppNav.tsx: AppNav` + `AppShell.tsx: PlayerHeader`,
  `MASTER_AVATARS` by `AppNav`, `PLAYER_AVATARS` by `AppShell.tsx: PlayerHeader`).

### src/ui/dataflow/sections.tsx
- Rules/gotchas: avatar note rewritten — both card sets download once into `public/avatars/` and
  resolve the file from constants at render time (`PLAYER_AVATARS` for tracked in `AppShell`,
  `MASTER_AVATARS` for masters in `AppNav`, shared `AVATAR_DIR`); no CDN request; `pl_avatar` is
  fallback-only for a future tracked player.
- Chess.com API section: `/player/{username}` bullet notes the `avatar` image is downloaded once
  and thereafter resolved from `PLAYER_AVATARS` / `MASTER_AVATARS`, so nothing goes back to
  chess.com's CDN.

### .claude/CLAUDE.md
- "Store the player avatar image on the app" outstanding item marked partially done: both the 2
  tracked players (`PLAYER_AVATARS`) and the 4 master cards (`MASTER_AVATARS`) resolve from
  constants + `public/avatars/`, no CDN request; `pl_avatar` fallback-only, `tmst_master_players`
  has no avatar column; no add-time hook, no coverage for the other ~145 masters, no refresh —
  still open.

### top-4 + horizontal row (2026-08-28) — net effect
- `AppNav` Master box now shows **4** cards (Carlsen, Caruana, Nakamura, Sindarov) in a single
  `flex gap-3` horizontal row (was 6 in a 2-col grid). `MASTER_AVATARS` trimmed to those 4 handles;
  `public/avatars/vincentkeymer.png` + `gmwso.jpg` deleted. Wording updated across the constants
  page, dataflow notes, and `.claude/CLAUDE.md`. `public/avatars/` now holds 6 files (2 tracked + 4
  master).

### tracked-player avatars local too (2026-08-28) — net effect
- `AppShell`'s tracked-player cards now resolve their avatar from the new `PLAYER_AVATARS`
  constants map (2 entries), mirroring the master cards. `MASTER_AVATAR_DIR` renamed to the shared
  `AVATAR_DIR`. **No manual SQL anywhere in this plan** — the `pl_avatar` UPDATEs were dropped;
  the column stays untouched as a fallback for future tracked players.

### Option B rework (2026-08-28) — net effect
- The `mst_avatar` schema column, its manual `ALTER`/6×`UPDATE` SQL, and the `MasterPlayerRow.avatar`
  field were all backed out. Master-card avatars come entirely from the `MASTER_AVATARS` map in
  `constants.ts`.
- Unaffected by the rework: `FilterMasterPlayerSelect` grade labels + width, `getSyncedMasterPlayers`
  grade merge/sort, `WIDTH_MASTER_PLAYER`, and the `public/avatars/` image files.

## Testing
- [ ] Open a non-owner page (e.g. `/` or `/mastergames`). The **Master** box shows 4 cards —
      Carlsen, Caruana, Nakamura, Sindarov — in a single horizontal row, each with a real photo and
      a `Grade: NNNN` badge. No broken/placeholder silhouette images. Check the row isn't
      unreadably cramped at normal window width.
- [ ] The **Player** box still shows the tracked-player cards (stricade, astarrboy) with their
      photos — now served from `/avatars/` via the `PLAYER_AVATARS` map (no SQL needed). Confirm no
      network request to `images.chesscomfiles.com` fires for them.
- [ ] Go to the **Masters Games** list (`/mastergames`). The **Player** filter dropdown is visibly
      wider (`w-56`); its options read `Name (2823)` etc., "All" is first, and the players are
      ordered highest grade first. Selecting one still filters the list correctly.
- [ ] Check `/owner/constants` — `WIDTH_MASTER_PLAYER` (value `w-56`) and the new "Card Avatars"
      section (`AVATAR_DIR`, `MASTER_AVATARS` with 4 entries, `PLAYER_AVATARS` with 2) all appear;
      the Functions tabs for `FilterMasterPlayerSelect`, `AppNav`, and `AppShell: PlayerHeader` list
      them as consumers.
- [ ] Both nav panels (Player + Master) show a **amber** background on a page where neither is the
      active section, and the active one turns **pink** — e.g. on `/` the Player box is pink and the
      Master box amber; on `/mastergames` it flips. No yellow outline on either.
- [ ] `npx tsc --noEmit` passes and `npm run build` completes cleanly.
- [ ] No manual SQL — nothing to run in pgAdmin4 for this feature.
