# Gym Tracker — notes for Claude

Personal gym tracker for Stefan. Vite + React + TypeScript PWA deployed to GitHub Pages
(`base: '/gym-tracker/'`, HashRouter). Workout logs sync to the private repo `stefand94/gym-tracker-data`
via the GitHub Contents API (`src/lib/sync.ts`); the app never writes to this repo.

Stefan adds exercises and routines by asking Claude, not in the app. Weights are kg.

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
Per-item `sets/reps/seconds/weight/station` are optional (`station` is a free-text machine/cable tag like "Upstairs 1"; weights pre-fill from the last time on the same station); when a workout starts, sets pre-fill from the last time the
exercise was done, then routine values, then exercise defaults.

## Checks

`npm test` (includes a check that every exercise uses valid muscle ids and every routine references real
exercises) and `npm run build`. Push to `main` to deploy.

## Reading Stefan's history

`gh api repos/stefand94/gym-tracker-data/contents/workouts/<year>` lists workout files; each is a `Workout`
(`src/types.ts`). Only sets with `done: true` count; items with `status: "skipped"` count for nothing.
Notes: `WorkoutItem.note` (with `noteSuggestions`, the chips Claude read out of it; `[]` = read, nothing to do)
and `Workout.note` for the whole session. Read them; they're often why a number looks odd.

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
