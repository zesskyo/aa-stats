# Changelog

Websites pick up changes on their next build (when the owner saves something, or daily at 05:23 UTC). Older changes: the commit history.

## 2026-11-10

- Runs are numbered by when they were played (when the log started; a run without a log, its date), so the numbers always go in order. The files keep the number they were saved under; adding a run no longer asks for a number

## 2026-11-09

- Leaderboard page, new look: Thunderless and Thunderful tabs; the top three (1st, then 2nd, then 3rd tallest), with how long the record has stood; the rest of the board with run numbers, dates, proof links and (Thunderless) 100%; notes on hover; Show obsolete runs puts every runner's slower times in among the board by time (as on speedrun.com); recently added runs. Square corners
- The leaderboard is edited on its owner's stats site (Add to leaderboard, and an edit button on every run, for the owner only) instead of the spreadsheet, and every site loads its latest version when the page opens
- Leaderboard checks: against the leaderboard itself; an approved world record is added to it

## 2026-11-04

- Leaderboard page on every site: All and Thunderful boards from the leaderboard spreadsheet, each runner's earlier times, proof links, videos that play on the page, records' runs opened on the site, and the world record history with how long each stood
- Leaderboard checks: times and dates on the spreadsheet checked against the runs' logs and stats sites, listed in an issue
- Compare: Earlygame, Midgame and Endgame open to their parts and steps (Any%'s, Outer End's, the Midgame checklist, Endgame's), each with how long it took and the difference; Post-endgame when there is one; all the run stats
- Compare: world records to pick from: the WR, the Thunderful WR and former WRs
- World records: a daily check of the stats sites on the leaderboard for faster runs, each opened as an issue to approve (comment `approve`); records keep their video and notes from the runner's stats site, and link to it ("Runner's stats")
- Run stats and average stats: click one (elytra distance, deaths, skulls, TNT per debris, shulker boxes, creepers) for the lowest and highest of the runs, each opening its run
- Run page: the run stats are centred
- Skulls graph: the last skull's icon stays on the chart; its label is "Killed: N"
- Beacon Blocks counts gold only, blocks and ingots (an ingot is a ninth), up to 164: it's done when there's that much gold (a run that finished the beacon with other minerals is done when all of them together were enough); only gold picked up (3 blocks or more, close together) counts as working on it
- Overview: PB history, a graph of every run's time with the PB, the last 5 runs' average and the sum of best as they went
- Taiga split: Giant Tree Taiga and Giant Tree Taiga Hills (mega taiga) are among its biomes to get
- Timer: Midgame's checklist keeps each item's progress over time, so Current Pace can go by how far through it you are (shells, gold blocks and biomes included)

## 2026-11-02

- Timer: a campfire put down with 3 or fewer of the Midgame checklist left starts Endgame straight away (others wait for the honey, as pre-placed hives do)

## 2026-10-30

- Timer: a campfire starts Endgame only once the honey's collected (pre-placed hives no longer start it early); Debris isn't a small trip picked as the biggest so far
- Timer: Debris's count in Midgame only shows after debris mined or time deep down in the last 2 minutes (not for TNT used for Uneasy Alliance)
- Beacon Blocks: only 3 blocks or more picked up close together count as working on it (a few ingots on their own don't)

## 2026-10-29

- Any%: a structure counts once you've spent 20 seconds in it, so passing through a corner of a bastion on the way to a fortress no longer makes the bastion the first
- Debris is part of Endgame: Endgame starts with it when it's done on the way back to base; it's Endgame's first sub-split, and Setup and the others leave its time out
- Endgame's sub-splits are listed in the order they were done (run page, timer); Endgame page and Overview have Debris with them
- Main splits: Earlygame (Any%, Outer End, Enchanting), Midgame, Endgame, Post-endgame; Debris sits in whichever it's done in
- Enchanting ends on leaving the enchanting table (ghost file)
- Endgame starts on getting back to base: out of the portal or landed; a campfire near spawn (also "nether bees" in the Nether) means base is spawn
- Raid sub-split ends at the second Bad Omen, or when the last raid mob is killed if that's later
- Overview: Earlygame, Midgame, Endgame cards open to show what's in them; new split pages for Elytra Obtain, A Complete Catalogue, Adventuring Time
- Average stats: VVF rate, runs in the past week or month (click to switch), last 5 average
- Stats tab opens the latest run
- Earlygame icon: stone pickaxe
- Timer checklist: anything with 3 or fewer left is shown wherever you are; Adventuring Time once 2 rare biomes or fewer are left
- `check-splits.mjs`: "Endgame start" in truth.json

## 2026-10-28

- Post-endgame icon: the run's last advancement (was a star for most); cycles through the runs' last advancements where one icon stands for all runs
- Mushroom Island: done once the runner has the mushrooms the stews need, crafted there or not
- Thunderless, then waiting for thunder: counts with the Thunderless time, marked "Thunderful at …"
- Invalid and counted-anyway runs no longer mention the channeling trident
- Saving on the website: the run's page opens straight away; saves right after each other no longer fail
- Add run: no run number, date or seed boxes (read from the world; seed asked only when missing)
- One drop for a world folder on Add run and Compare
- Flatter layout; colour palette setting (gold, diamond, amethyst)
- Snowy waits for a cure under way

## 2026-10-27

- Temperate: wheat fed to animals counts
- No Debris split before Enchanting is done
- Early Endgame starts on getting back to base
- Nether Misc done once all but a zombified piglin is
- God Apple split: the enchanted golden apple icon

## 2026-10-26

- Debris ends with the debris, merges quick restocks, starts below y 25 (ghost file)
- Any% ends on reaching the outer End
- TNT dropped and picked up isn't counted twice
- Split pages: worst time in red
- World folder upload; duplicate run warning
- `check-splits.mjs`: compare split times before and after a rule change

## 2026-10-25

- Map: dimension changes on the ghost's teleports
- Logs from Hermes before 0.14: biomes worked out from the seed and ghost file
- Midgame checklist: Ocean, Temperate, Adventuring Time, Cats; timed in Post-endgame too
- Uneasy Alliance: the ghast's trip to the Overworld counts
- Thunderless with a Channeling book and a trident

## 2026-10-24

- Sub-splits for Any%, Outer End and Endgame; Midgame checklist splits
- Split pages, Statistics screen, page addresses (#/run/12, …)
- Skulls, shells, tridents and more counted from the inventory
- Thunderless needs a channeling trident; "count anyway" option

## 2026-10-23

- Times use SpeedRunIGT's retimed IGT
