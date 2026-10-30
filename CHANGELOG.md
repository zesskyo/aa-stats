# Changelog

Websites pick up changes on their next build (when the owner saves something, or daily at 05:23 UTC). Older changes: the commit history.

## 2026-10-30

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
