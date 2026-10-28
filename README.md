# aa-stats

Code for Minecraft 1.16 All Advancements stats websites, e.g. [Zesskyo's AA No Reset Log](https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/).

- Your own website: use [aa-stats-template](https://github.com/zesskyo/aa-stats-template). You don't need to touch this repository.
- Changes: [CHANGELOG.md](CHANGELOG.md)

## How it fits together

- This repository: the code (`src/`, `icons/`, `build.mjs`). No runs.
- Each website: its own repository (from the template) with only its runs: `logs/`, `runs.json`, `site.json`, optional `icons/`.
- Websites build from this repository's `main` whenever their owner saves something, and daily at 05:23 UTC.
- *Check the build* builds an empty site and `example/` on every push: check it's green after pushing.

## Development

- Build a site (Node 20, nothing to install): `node build.mjs <site folder>` → `<site folder>/dist/index.html`
- Example site: `node build.mjs example`
- Split rule changes (`src/splits.js`, `RULES` in `src/config.js`):
  - `node check-splits.mjs <site folder> --save before.json`, change, then `--diff before.json`: the runs whose splits moved
  - `truth.json` in the site folder (`{"29": {"Midgame": "3:25:28", "Debris start": "3:25:28"}}`, IGT): how far off each split is

| File | |
| --- | --- |
| `src/text.js` | All the site's words (defaults; a site overrides them in `site.json`) |
| `src/config.js` | Advancements, splits, stats shown, rules |
| `src/parse-log.js` | Reads a Hermes `play.log` (build and Compare page) |
| `src/run-meta.js` | A run's details from `runs.json` (build and editor) |
| `src/stats.js`, `src/splits.js` | Everything worked out about a run |
| `src/overview.js`, `src/run-page.js`, `src/compare.js`, `src/split-page.js` | The pages |
| `ghost.mjs`, `src/travel-map.js` | Travel map: reads the ghost file at build time, draws it on the run page |
| `src/seed-map.js`, `src/biomes.js`, `wasm/` | The map's biomes and structures from the seed: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT), built by `wasm/build.sh` |
| `src/editor.js` | Adding, editing and deleting runs from the website (GitHub API) |
| `src/charts.js`, `src/progress-graph.js` | Graphs |
| `icons/` | Built-in icons; a site's `icons/` adds or replaces them |
