# aa-stats

The code behind All Advancements No Reset stats websites, such as
[Zesskyo's](https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/).

**Want your own website?** Go to [aa-stats-template](https://github.com/zesskyo/aa-stats-template)
and follow the steps there. You never need to touch this repository.

## How it fits together

- **This repository** holds the code: `src/` (the website), `icons/` and `build.mjs`. It has no runs in it.
- **Each website is its own repository** (made from the template) and holds only that person's runs:
  `logs/`, `runs.json`, `site.json` and optional `icons/`.
- Every time a website builds, it takes the **latest code from here** and its own runs.
  Websites rebuild when their owner changes something and once a day, so a change pushed here reaches
  every website within a day. Nobody's runs ever go anywhere else.

The **Check the build** workflow builds an empty site and `example/` on every push, so a mistake shows up
here first. Websites use the `main` branch, so check that it's green after pushing.

## Working on the code

Run the build against any site folder (Node 20, nothing to install):

```
node build.mjs ../aa-stats-no-reset-zesskyo-log    # writes ../aa-stats-no-reset-zesskyo-log/dist/index.html
node build.mjs example                       # the small example site in this repository
```

Then open `dist/index.html` in a browser.

| File | What it does |
| --- | --- |
| `src/text.js` | Every word on the site. These are the defaults; a site changes its own in `site.json`. |
| `src/config.js` | Advancements, splits, which stats are shown, rules of thumb |
| `src/parse-log.js` | Reads a Hermes `play.log` (the build and the Compare page both use it) |
| `src/stats.js`, `src/splits.js` | Everything worked out about a run |
| `src/overview.js`, `src/run-page.js`, `src/compare.js` | The three tabs |
| `src/editor.js` | The owner adding, editing and deleting runs from the website (saves to the site's repository through GitHub's API) |
| `src/charts.js`, `src/progress-graph.js` | The graphs |
| `icons/` | Built-in icons; a site's own `icons/` folder can add or replace them |
