# PR-strength
An app where you can keep track of weights and reps used recently.

**Open the app:** https://bergumguro-prog.github.io/PR-strength/

## Install on your phone
- **iPhone (Safari):** open the link → Share button → *Add to Home Screen*.
- **Android (Chrome):** open the link → ⋮ menu → *Install app* / *Add to Home screen*.

After installing, the app opens full-screen and works offline.

## Features
- **Log workout:** choose a previously added exercise or add a new one, then add as many sets as you like, each with its own weight and reps.
- **View PRs:** every exercise with three columns:
  - **Most weight**: the heaviest set, with the reps done at that weight
  - **Most reps**: the set with the most reps, with the weight used
  - **Most recent**: the sets and weights from the latest workout
- Tap an exercise to see its full history, delete a workout, or rename/delete the exercise.
- **Backup (⋯ menu):** data is stored only on the device. Export a JSON backup and import it on a new phone.

## Development
Plain HTML/CSS/JS with no build step. Serve the folder locally, e.g. `python3 -m http.server`, and open http://localhost:8000.
When you change the app's files, bump `CACHE` in `sw.js` so installed copies pick up the update.
