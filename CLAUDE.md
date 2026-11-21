# Gym Tracker — notes for Claude

Personal gym tracker for Stefan. Vite + React + TypeScript PWA deployed to GitHub Pages
(`base: '/gym-tracker/'`, HashRouter). Workout logs sync to the private repo `stefand94/gym-tracker-data`
via the GitHub Contents API (`src/lib/sync.ts`); the app never writes to this repo.

Stefan adds exercises and routines by asking Claude, not in the app. Weights are kg.

**Starting a session? Read `HANDOVER.md`**: recent work, open items, and how to work on this. Update it before you stop.

## Adding an exercise — `src/data/exercises.json`

```json
{
  "id": "kebab-case-unique-id",
  "name": "Display name",
  "type": "weight | bodyweight | timed | machine",
  "equipment": "Dumbbells | Barbell | Cable | Machine | Bodyweight | …",
  "weightNote": "per dumbbell",          // optional hint shown on the card
  "cue": "lower over 4–5 s",             // optional coaching cue shown on the card
  "aliases": ["other name people search"], // optional; search also folds one-arm/single, db, rdl, ez…
  "primary": ["biceps"],                  // 1 set credit each
  "secondary": ["forearms"],              // ½ set credit each
  "defaults": { "sets": 3, "reps": 10, "weight": 10 }   // timed: "seconds" instead of "reps"
}
```

- `weight`: weight × reps. `machine`: same, +/− steps of 5 kg. `bodyweight`: reps + optional added kg.
  `timed`: seconds (+ optional kg).
- Dumbbell exercises are entered **per dumbbell**; barbell as total bar weight. Say so in `weightNote`.
- Assisted machines (pull-up, dip): `weight` type, `equipment: "Machine"`, weight = kg of assistance
  (`weightNote: "assistance (less = harder)"`). Carries: `weight` type with reps = metres.
- `"warmup": true` (heavy barbell lifts) gives an exercise ramp-up sets when a workout starts: bar, ~50%, ~75%.
  They live in `WorkoutItem.warmups`, apart from `sets`, so nothing counts them (load, progress, PRs, pre-fill).
  Any weight/machine exercise can add them from its menu.
- `"sides": true` (timed, e.g. `side-plank`): each set has left and right seconds (`seconds` = left, `secondsR` = right).
  The left timer runs into the right after a 5 s switch; records, stalls and progress use the weaker side (`src/lib/sides.ts`).
- `"intervals": true` (timed, e.g. `jog-interval` / `walk-interval`): in a superset the next interval's timer starts
  as soon as one ends, no rest between. The rehab dose skips them.
- Never change an existing `id` — logged workouts reference it.
- Also add a how-to to `src/data/howto.json` under the same id: `{ "steps": [3–4 short steps], "mistake": "…" }`, in
  your own words (a test checks every bundled exercise has one). The app's How-to sheet shows it with a YouTube
  search for "<name> form"; an optional `"video": "<url>"` on the exercise replaces the search. Custom exercises can
  carry their own `howto`. Videos Stefan pins in the app live in `gym-tracker-data/exercises/videos.json`
  (`{ "<exerciseId>": { "url", "updatedAt" } }`, empty url = removed).

Muscle ids (`src/data/muscles.ts`, drawn in `src/components/BodyMap.tsx`):
neck, traps, frontDelts, sideDelts, rearDelts, chest, biceps, triceps, forearms, lats, upperBack,
lowerBack, abs, obliques, glutes, abductors, adductors, quads, hamstrings, calves.
Adding a new muscle means adding it to `muscles.ts` **and** drawing its region in `BodyMap.tsx`.

Push / pull / legs / core (picker filter, Body balance card) is derived from `primary` muscles in
`src/lib/groups.ts` — no tag to set; a new muscle also needs a group there.

## Routines live in the data repo — `stefand94/gym-tracker-data/routines/<id>.json`

The app keeps routines as synced user data (one file per routine). **Edit them there, not in
`src/data/routines.json`**, which is only the seed for a fresh install. Always set `updatedAt` to the
current ISO time when changing one (the app also takes a repo copy when it has no unsynced edit of its own).
Deleting = `"archived": true` (don't remove the file, or the app re-uploads its copy). Read/write with
`gh api repos/stefand94/gym-tracker-data/contents/routines/<id>.json` (PUT needs the current `sha`).
New routine ids must not collide with bundled seed ids. Same shape as below.

## Custom exercises — `gym-tracker-data/exercises/custom.json`

Exercises Stefan creates in the app are stored there (`custom: true`, `reviewed: false`), quick-entered
with rough muscles. To review: read the file, fix `type`, `equipment`, `primary`/`secondary`, `cue`,
`defaults`, set `reviewed: true`, bump `updatedAt`, and PUT it back (keep every entry; never change an
`id`). Optionally promote a reviewed one into `src/data/exercises.json` with the same id — bundled
entries win the lookup. Use his logged sets of it (workouts reference the id) to sanity-check.

## Routine shape (seed: `src/data/routines.json`)

```json
{ "id": "push", "name": "Push", "description": "optional subtitle",
  "blocks": [
    { "items": [{ "exerciseId": "barbell-bench-press" }] },
    { "superset": true, "items": [{ "exerciseId": "lateral-raise" }, { "exerciseId": "triceps-pushdown", "sets": 3, "reps": 12, "weight": 20 }] }
  ] }
```
No weekdays (`days` is no longer used): Home suggests the routine that best hits muscles that are behind over the
last 7 days and rested over 48 h (`src/lib/suggest.ts`); routines with leg work outside the `rehabDose` block are held
back while a rehab is unfinished. Stefan can also build and edit routines in the app (`src/screens/RoutineEditor.tsx`)
and update one from the finish screen, so read the repo copy before changing a routine.
Go-up: when every set last time hit the target reps (routine reps, else the exercise default) at one weight, the
sets pre-fill one step up (+2.5 kg barbell, +2 dumbbells, +4 kettlebell, +5 machine, 5 kg less assistance) and the
item carries `goUp` (kg); not on pain-tracked items. Personal records aren't stored: `src/lib/records.ts` works them
out from history (est. 1RM; reps for bodyweight, seconds for holds; per station; none for carries, sleds or assisted).
Stall detection (`src/lib/stall.ts`): an exercise is stuck when its last 4 sessions didn't beat the best before them
(est. 1RM; reps or seconds, weight first, for bodyweight and holds; less help on assisted machines), or reps were missed 2
sessions running at one weight. Needs 4 sessions since the last fix, counts stations apart, and skips pain-tracked work,
carries, sleds, jumps, throws and intervals. The item carries `stall`; the card offers a ~10% reset, two other sets × reps
(saved to the routine), a swap, or not now; the pick is stored as `stallFix` and detection counts from there. Go-up wins
over it. Claude sees the list as STUCK in its context.
Hamstring rehab has 4 phases; phase 4 is back to running (walk–jog intervals), and legs stay held back until it's passed.
Per-item `sets/reps/seconds/weight/station` are optional (`station` is a free-text machine/cable tag like "Upstairs 1"; weights pre-fill from the last time on the same station); when a workout starts, sets pre-fill from the last time the
exercise was done, then routine values, then exercise defaults.

## Checks

`npm run check` runs everything CI runs: types, ESLint, Prettier and the tests (which include a check that every
exercise uses valid muscle ids and every routine references real exercises); then `npm run build`. `npm run format`
fixes formatting (Prettier skips `Icons.tsx`, the data JSON and this file). Push to `main` to deploy.

## Where things live

- `src/lib/workout/`: the workout in progress, one concern per file: `plan` (starting sets, go-up, warm-ups),
  `sets` and `items` (edits), `stall` (the fixes for a stuck exercise), `layout` (blocks, supersets, the reorder sheet's moves, the rehab dose's edge), `intervals`,
  `status`. Import from `lib/workout`.
- `src/components/workout/`: the workout card (`WorkoutBlockView` → single, superset or collapsed block; tap a header to fold it).
- `src/components/ReorderSheet.tsx`: Reorder & supersets, shared by the workout and the routine editor (drag a row via
  SortableJS, whose fallback drag scrolls the sheet near its edges, or ↑/↓,
  a Superset menu per exercise); `applyLayout` in `lib/workout/layout` writes its result back.
- `src/styles/`: one stylesheet per area, imported in cascade order by `index.css`.
- `src/lib/merge.ts`: every merge — versioned lists, keyed maps, and `merge3` for workouts edited on both sides.

## Reading Stefan's history

`gh api repos/stefand94/gym-tracker-data/contents/workouts/<year>` lists workout files; each is a `Workout`
(`src/types.ts`). Only sets with `done: true` count; items with `status: "skipped"` count for nothing.
Notes are chats: `WorkoutItem.noteThread` / `Workout.noteThread` (`{ from: 'me' | 'claude', text, at }`, Claude's empty
text = read, nothing to say); `note` always holds just Stefan's messages, one per line — read that. `noteSuggestions`
are the chips Claude read out of the note, waiting for a tap. Read them; they're often why a number looks odd.

## Claude in the app

Stefan's own Anthropic API key lives only in that device's localStorage (`state.ai.key`), like the GitHub token —
never in the repo or the data repo (the site is public). Never enter either key yourself.
- `src/lib/claude.ts`: lazy-loaded SDK, `callJson` with structured output (schemas need `additionalProperties:false`,
  no min/max), cost tally. Ask uses the model picked in Settings; notes and helpers always use Haiku.
- `src/lib/aiContext.ts`: what Claude sees (catalogue, routines, 4 weeks of history with notes, muscle load, rehab).
  Stefan's standing rules are `RULES` there — add new preferences to that list.
- `src/lib/aiValidate.ts` (`checkPlan`): every plan is checked in code — unknown ids dropped, leg work held back
  during rehab, sets/reps clamped, the rehab dose appended. `src/lib/ask.ts` (Ask), `notes.ts`, `helpers.ts`
  (exercise auto-fill, picker fallback, weekly check-in cached in `state.ai.checkIn`) read Claude's answers.
- Nothing Claude proposes is saved without a tap. Custom exercises it fills in stay `reviewed: false`.
- Dev only: `window.__claudeMock = ({ prompt, today, model }) => data` answers instead of the API (no key needed).
