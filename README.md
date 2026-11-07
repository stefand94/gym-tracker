# Gym Tracker

A personal workout tracker that runs as an installable web app on GitHub Pages.

**App:** https://stefand94.github.io/gym-tracker/

- Start a saved routine (Push / Pull / Legs / Arms) or an empty workout, add or remove exercises on the day
- Weight × reps per set, pre-filled from last time; change one set or all remaining sets at once
- Tick sets as you go — the exercise ticks itself off when every set is done — or tick the whole exercise; skip exercises
- Supersets shown as rounds (A1, A2, A1, A2…)
- Front/back body map per exercise, per workout, and a 7 / 30 / 90-day heatmap of what you have (and haven't) trained
- Progress chart per exercise: top weight, estimated 1RM, volume
- Works offline; installs to the home screen (Safari → Share → Add to Home Screen)

## Data

Workouts are saved on the device and synced to the private repo
[`stefand94/gym-tracker-data`](https://github.com/stefand94/gym-tracker-data), one JSON file per workout under
`workouts/YYYY/`. Connect it in **Settings** with a fine-grained personal access token that has
**Contents: Read and write** on that repo only. Settings also has JSON export/import as a backup.

## Development

```bash
npm install
npm run dev      # http://localhost:5173/gym-tracker/
npm test
npm run build
```

Pushing to `main` builds and deploys via GitHub Actions.

Exercises and routines live in `src/data/exercises.json` and `src/data/routines.json` — see `CLAUDE.md`.
