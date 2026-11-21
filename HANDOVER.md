# Handover

Where the gym tracker stands, for the next session to pick up. Read `CLAUDE.md` first: it has the data shapes, the
rules for exercises and routines, and where everything lives. This file covers what changed recently, what's open, and
how to work on it.

_Last updated 2026-11-21._

## State

- The newest commit is the SortableJS reorder drag and the workout-card usability pass (below). Check with `git log` and
  `gh run list` whether it has been pushed and deployed.
- `npm run check` passes: types, ESLint, Prettier and 146 tests. `npm run build` passes too (the warning that the
  main chunk is over 500 kB is expected).
- Stefan uses the app on his phone as an installed PWA, often while driving this session over Remote Control. Keep
  replies short and plain, and ask one clear question when something is his call.

## Recently built (newest first)

1. **SortableJS reorder drag, workout-card usability pass** (2026-11-21).
   - On his iPhone the hand-made drag grabbed a row but the sheet wouldn't scroll, so he couldn't steer the drop. He
     picked SortableJS: `ReorderSheet` creates it with `forceFallback` and auto-scroll on the `.sheet`, then undoes
     Sortable's DOM move in `onEnd` and applies `moveBlock` to React state. Tried with synthetic touch-type pointer
     events (the sheet scrolls both ways, rows land right). **Stefan still needs to confirm it on his phone.**
   - From a usability review he picked: the current set stays on screen (go-up, stuck and station tags share one line;
     warm-ups fold to "Warm-up 2/3 ✓" once work sets start; after a tick the screen scrolls only if the next set is
     hidden behind the header or the nav); reps get −/+ like kg (weight × reps rows use `.set-row.pair`, narrower
     buttons); a grouped ⋯ menu (Sets / Exercise / Order, then Skip and Remove); folded supersets list one name per
     line; "Keep last weight" in a quiet grey; the header Finish stays grey until 80% of sets are done; a 44 px fold
     chevron; tap a running hold to stop and log it.
   - He did **not** pick turning the rest timer on by default; leave it.
   - Known, not fixed: opening `/routines/<id>` straight from a not-found route shows an empty editor (the route has
     no key). Minor.
2. **Reorder sheet, folding cards, two-sided holds** (from Stefan's app notes, 2026-11-21).
   - Drag-and-drop on the cards (`@dnd-kit`, `BlockDnd.tsx`) is gone: it swapped the list for compact rows mid-drag,
     so things jumped under the finger. Now a **Reorder** button (next to Add exercise, and in each exercise's menu)
     opens `ReorderSheet`: a fixed compact list, drag by the grip or tap ↑/↓, and a Superset menu per exercise
     ("With X", "Join superset B", "Take it out"). Cancel discards. The routine editor uses the same sheet. The
     rehab dose can move but gets no Superset menu and is never offered as a partner.
   - Any open card folds by tapping its header or chevron, the current one included.
   - `"sides": true` timed exercises (side plank) log left and right seconds apart; the exercise editor has a switch
     for custom ones. Older side-plank logs (one number) still read fine.
   - Also from his workout notes: Russian twist cue (one rep = one side); the note reader now drops a message he
     takes back ("scrap that").
   - All tried in the browser on a mobile viewport with a made-up workout. Not yet tried on his phone (touch drag).
3. **Stall detection** (`src/lib/stall.ts`, `src/lib/workout/stall.ts`, `src/components/workout/StallSheet.tsx`).
   A "Stuck" tag on the workout card when the last 4 sessions didn't beat the best before them, or reps were missed 2
   sessions running at one weight. The fixes are a ~10% reset, two other sets × reps (saved to the routine), a swap, or
   "Not now". Progress shows a note and greys the stuck points. Claude sees a STUCK list (`aiContext.ts`), and the
   weekly check-in mentions it. `CLAUDE.md` has the full rules.
   - **Not yet seen on real data.** As of 2026-11-21 nothing in his history is flagged: his most-done exercises have
     about 2 sessions, and the rules need 4. The first real tags should appear after a few more weeks of training.
     If one looks wrong, check `findStall` against his synced workouts (read-only).
   - Swap reuses the existing Replace picker and wasn't tried in the browser. Reset, the rep schemes and the Progress
     note were tested in the browser with made-up workouts.
4. **Codebase tidy** (`a5c756f`). Workout logic is split by concern in `src/lib/workout/`, the workout card in
   `src/components/workout/`, and the CSS in `src/styles/`. ESLint and Prettier were added, and CI lints before
   deploying.
5. **Fixes** (`943715b`). The rehab dose keeps its own blocks when moved. Sync merges fixes made in the repo
   (`merge3`) instead of overwriting them. Walk–jog intervals chain from when the last one ended.
6. **Go-up nudges, personal records, warm-up sets, hamstring rehab phase 4** (`870f540`).

## Open items and ideas

None of these have been started. Ask Stefan before starting any of them.

- **Carries as lengths: skipped** (2026-11-21). He does farmer carries on a track of roughly 10 m, so metres stay.
  If he asks again: reps = lengths, with a per-station length.

- **Sharing with a friend: declined for now** (Stefan said "not now" on 2026-11-17). Anyone can already open the URL
  and get their own local copy. But the app is tailored to Stefan:
  - the sync settings default to his data repo;
  - Claude's prompts say "Stefan" and apply his `RULES`;
  - the seed routines include the hamstring rehab, which holds back leg work.

  The plan, if he asks: a profile in Settings (name, editable rules, rehab on or off), a blank sync owner by default,
  and general seed routines for new installs, with nothing changing for him. A friend would need their own private
  data repo and token to sync.

- **Other ideas already pitched to him:** a 45-minute time check while working out (weekday cap), and a plate
  calculator. Possibly effort per set (RPE) and a calendar view. Not worth doing: a body-weight log, and lock-screen
  alerts.
- **Haiku "stopped working"** (2026-11-17) fixed itself within minutes, with no code change. It was most likely an
  outage or rate limit on Anthropic's side. If it happens again, ask for the exact on-screen message first: credits,
  the key, rate limits and network each show a different message (`toAiError` in `src/lib/claude.ts`).

## How to work on it

- **Before every push:** `npm run check`, then `npm run build`. Use `npm run format` to fix formatting. Prettier skips
  `Icons.tsx`, `src/data/*.json` and `CLAUDE.md`; leave their formatting alone.
- **Deploy:** push to `main`, then follow the run with `gh run watch`. Commit messages are one descriptive line (see
  `git log`) and end with the `Co-Authored-By` line for the model in use.
- **Trying the UI:** run the dev server through the preview tools, on a mobile viewport. Put made-up history in
  localStorage, never Stefan's real data, and clear it afterwards. Test Claude features with `window.__claudeMock`
  (dev only).
- **Reading his data:** reading `stefand94/gym-tracker-data` with `gh api` is fine. Download it to the scratchpad, not
  this repo. Changing it (routines, custom exercises) follows the rules in `CLAUDE.md`: set `updatedAt` to now, PUT
  with the current `sha`, and never change an `id`. Ask before changes he hasn't asked for.
- **Keys:** never enter, store or ask for his GitHub token or Anthropic API key. They live only in that device's
  localStorage. This repo and the site are public, so keep personal details out of commits and this file.
- **New preferences** go in `RULES` in `src/lib/aiContext.ts`. Exercises and routines follow `CLAUDE.md`.
