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
  "primary": ["biceps"],                  // 1 set credit each
  "secondary": ["forearms"],              // ½ set credit each
  "defaults": { "sets": 3, "reps": 10, "weight": 10 }   // timed: "seconds" instead of "reps"
}
```

- `weight`: weight × reps. `machine`: same, +/− steps of 5 kg. `bodyweight`: reps + optional added kg.
  `timed`: seconds (+ optional kg).
- Dumbbell exercises are entered **per dumbbell**; barbell as total bar weight. Say so in `weightNote`.
- Never change an existing `id` — logged workouts reference it.

Muscle ids (`src/data/muscles.ts`, drawn in `src/components/BodyMap.tsx`):
neck, traps, frontDelts, sideDelts, rearDelts, chest, biceps, triceps, forearms, lats, upperBack,
lowerBack, abs, obliques, glutes, abductors, adductors, quads, hamstrings, calves.
Adding a new muscle means adding it to `muscles.ts` **and** drawing its region in `BodyMap.tsx`.

## Adding a routine — `src/data/routines.json`

```json
{ "id": "push", "name": "Push", "description": "optional subtitle",
  "blocks": [
    { "items": [{ "exerciseId": "barbell-bench-press" }] },
    { "superset": true, "items": [{ "exerciseId": "lateral-raise" }, { "exerciseId": "triceps-pushdown", "sets": 3, "reps": 12, "weight": 20 }] }
  ] }
```
Per-item `sets/reps/seconds/weight` are optional; when a workout starts, sets pre-fill from the last time the
exercise was done, then routine values, then exercise defaults.

## Checks

`npm test` (includes a check that every exercise uses valid muscle ids and every routine references real
exercises) and `npm run build`. Push to `main` to deploy.

## Reading Stefan's history

`gh api repos/stefand94/gym-tracker-data/contents/workouts/<year>` lists workout files; each is a `Workout`
(`src/types.ts`). Only sets with `done: true` count; items with `status: "skipped"` count for nothing.
