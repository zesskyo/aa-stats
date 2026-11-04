# aa-stats

Code for Minecraft 1.16 All Advancements stats websites, e.g. [Zesskyo's AA No Reset Log](https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/).

- Your own website: use [aa-stats-template](https://github.com/zesskyo/aa-stats-template). You don't need to touch this repository.
- Changes: [CHANGELOG.md](CHANGELOG.md)

## How it fits together

- This repository: the code (`src/`, `icons/`, `build.mjs`). No runs.
- Each website: its own repository (from the template) with only its runs: `logs/`, `runs.json`, `site.json`, optional `icons/`.
- Websites build from this repository's `main` whenever their owner saves something, and daily at 05:23 UTC.
- *Check the build* builds an empty site and `example/` on every push: check it's green after pushing.

## World records

- The records are the same on every site, so they live here: `wr/` (the WR) and `wr/archive/<date runner>/` (former ones), each a run's `wr.log`, `wr.ghost`, `wr.stats.json`, and `wr.json` (`runner`, `date`, `seed`, `video`, `notes`, and `site` + `run`: the run on the runner's own stats site).
- *World records* (daily at 04:41 UTC, or from the Actions tab) looks through the stats sites the leaderboard links to (and any in `wr/sites.json`) for a run faster than the WR, or than the Thunderful WR with Very Very Frightening. Each one found gets an issue.
- To make it a record, comment `approve` on its issue: its files are copied in from its site (the WR before it moves to `wr/archive/`), and every site shows it from its next build. Only the repository's owner can approve; close the issue to leave it.
- It also keeps each record's `video` and `notes` up to date from its stats site.
- By hand: `node wr-watch.mjs scan`, `node wr-watch.mjs install <stats site url> <run number>`.

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
