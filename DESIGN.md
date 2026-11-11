# LAST EMBER — Game Design & Technical Spec

Owner: project manager (this doc is the source of truth; if code and doc disagree, ask/flag, don't guess).

## 1. Pitch

Top-down 2D survival game in a deepening winter. Your bush plane went down in a frozen
wilderness. **Cold is the main enemy.** Gather, craft, build a walled base around your fire,
hunt, fend off wolves, and scavenge three radio parts from scattered wreckage to build a
Radio Tower and hold out until rescue. No zombies, no magic — weather, hunger and wildlife only.

- Runs in a browser, zero external assets (all graphics drawn procedurally on canvas, all sound WebAudio synth).
- Mobile first: portrait AND landscape, touch controls; also keyboard+mouse on desktop.
- Permadeath. One save slot (localStorage autosave).
- Win: build Radio Tower, keep it powered through 3 nights of the "signal" phase → rescue.
  Score = days survived either way.

## 2. Pillars

1. **Tough but fair**: every death should be traceable to a decision (stayed out too late, no fuel stockpile).
   The HUD always warns before a stat kills you.
2. **The base matters**: walls block wind and wolves, enclosed rooms hold heat, fire is life.
3. **Escalation**: each day is colder, nights longer, wolves bolder. You can't turtle forever — go for the radio.
4. **Readable on a phone**: big touch targets (>=44px), high contrast, minimal text.

## 3. World

- Tile grid, `TILE = 32` world px. Map 128 x 128 tiles, seeded procedural (value noise). Border = impassable dense forest/cliffs.
- Terrain types: `snow` (normal), `deep_snow` (move 60% speed), `ice` (frozen lake; fishing holes only here), `rock` (rocky ground; ore), `cliff` (impassable).
- One object per tile max (resource node OR structure). Objects block movement unless flagged walkable.
- Resource nodes: `tree` (wood, sticks; needs axe for wood, by hand gives sticks slowly), `dead_bush` (sticks, fiber), `rock_node` (stone, flint 60% per harvest; needs pickaxe for stone, by hand: loose stones), `iron_node` (3-4 iron ore; pickaxe), `coal_node` (3-5 coal; pickaxe), `berry_bush` (berries, regrows in 2 days), `herb` (herbs), `loose_stone`/`loose_stick` ground pickups near spawn for bootstrapping.
- POIs: `crash_site` (spawn; a few starting supplies in a crate), 3 x `wreckage` far apart (>= 40 tiles from spawn, each in a different quadrant) each holding one radio part (antenna, battery, circuit board) + loot; 2-3 `bear_den` on rock terrain guarding iron/coal clusters.
- Player spawns near map centre in a clearing.

## 4. Time & weather

- Full day = 480 real seconds. Day 1: daylight 300s / night 180s. Night grows 6s per day (cap 300s).
- Phases: dawn, day, dusk, night — smooth ambient light curve. Night is really dark: vision limited to light sources (fire radius 5 tiles, torch post 4, held torch 3.5) plus a tiny 1.5-tile personal radius.
- Ambient temperature (°C): base = `-4 - 1.2*(day-1)` at noon (floor -40), night offset -10, smooth curve. **Day-1 tutorial slack:** +8 °C on day 1, fading linearly to 0 over the first 240 s of day 2 (`TEMPERATURE.day1Bonus`), and no weather during day 1 (`WEATHER.day1ClearSeconds` 300).
- Weather states: `clear`, `snow` (-3°C, light particles), `blizzard` (-12°C, wind, visibility 4 tiles, move speed 80%, unsheltered campfires burn fuel 2x). Blizzard: first possible day 2, chance grows with day; lasts 60–150s; HUD warning 30s before ("Storm coming").

## 5. Survival stats (0–100 each)

| Stat | Drain | At zero |
|---|---|---|
| Health | from damage, zero stats, bleeding, sickness | death |
| Warmth | driven by "felt temperature" (below) | -1.5 HP/s (hypothermia); <25 → move speed 85%, screen frost vignette |
| Hunger | -100 per 14 min (x1.5 while sprinting/working, x1.3 when warmth<40) | -0.5 HP/s |
| Thirst | -100 per 9 min | -0.8 HP/s |
| Stamina | sprint -18/s, swing -6; regen +14/s (halved if hunger or thirst <20) | can't sprint, swings 40% slower |

Felt temperature = ambient + weather + heat sources (campfire +30 at centre falling linearly to 0 at 5 tiles; furnace +15/3 tiles; torch held +4) + shelter (enclosed room: +8 and wind/weather penalty removed; fire inside enclosed room gets x1.5 heat) + clothing (sum of equipped insulation) .
Felt temperature is capped at 26°C.
Warmth rate per second = `clamp((felt - 10) * 0.06, -2.5, +3)` → comfortable at felt >= 10°C. So with only the starting jacket at day-1 noon (felt 8 °C) it is -0.12/s, but day-1 dusk/night (felt ≈ -2 °C) is ≈ -0.7/s, and from day 2 on it is -0.4 to -1.0/s: a player with no fire has warmth 0 after ≈ 5.5 min and is dead before dawn of day 2 (idle median 363 s). Clothing and fire are mandatory.

Health regen: +0.25 HP/s only if hunger>50, thirst>50, warmth>50, not bleeding.

Status effects:
- **Bleeding** (wolf/bear hits 35% chance): -0.6 HP/s until bandage used.
- **Food poisoning** (raw meat 40%, unboiled snow-water 15%): 60s, -0.3 HP/s, hunger drain x2.
- **Eating snow** directly: +8 thirst, -10 warmth.
- **Wet/exhausted**: out of scope.

Sleep: bed/bedroll usable at night only when felt temp >= 5°C and no hostile within 8 tiles. Time runs x12, hunger/thirst drain x0.5, restores stamina, +HP. Interrupted by damage, fire dying (felt < 0), or dawn.

## 6. Items (stack 20 unless noted)

Resources: wood, stick, stone, flint, fiber, rope, hide, bone, fat, iron_ore, iron_ingot, coal, herb, cloth (from crates), radio_antenna, radio_battery, radio_circuit (unique).
Food/drink: berries (+8 hunger, +2 thirst), raw_meat (+15 hunger, poison risk), cooked_meat (+35), jerky (+40, from drying rack; better than cooked meat but takes 2 minutes and a rack), raw_fish (+10, risk), cooked_fish (+28), snow_water (dirty: +25 thirst, risk), clean_water (+40 thirst), herbal_tea (+35 thirst, +15 warmth, cures poisoning).
Containers: tin_pot (unique tool; needed to melt/boil at a fire).
Medical: bandage (stops bleeding, +10 HP).
Tools/weapons (non-stacking, durability): 
| item | dmg | use | durability |
|---|---|---|---|
| hands | 4 | slow gather | – |
| stone_axe | 10 | trees x3 | 60 |
| stone_pickaxe | 8 | rock/ore | 60 |
| spear | 18 (reach 1.8 tiles) | weapon | 50 |
| bow (+arrow ammo, 6 arrows per craft) | 22 ranged 7 tiles | weapon | 80 |
| torch | 6, light+heat, scares wolves | burns 180s when equipped | – |
| iron_axe | 16, trees x6 | | 200 |
| iron_pickaxe | 12 | | 200 |
| iron_spear | 30 | | 150 |
Clothing (3 slots head/body/feet; insulation °C): fur_hat +4, fur_coat +9, fur_boots +4, (start with) worn_jacket +4 in body slot.

Inventory: 16 slots + 5-slot hotbar + 3 clothing slots. Tough: no weight, but slots are scarce.

## 7. Crafting

Hand recipes (anywhere): rope (3 fiber), stone_axe (2 stick, 2 stone, 1 fiber), stone_pickaxe (2 stick, 3 stone, 1 fiber), spear (2 stick, 1 flint, 1 fiber), torch (1 stick, 1 fat OR 1 fiber+1 coal), bandage (1 cloth OR 2 fiber+1 herb OR 1 hide+1 fiber), campfire kit etc. are *buildings* (see §8).
Workbench: bow (3 stick, 2 rope), arrow x6 (1 stick, 1 flint), fur_hat (2 hide, 1 rope), fur_coat (5 hide, 2 rope), fur_boots (3 hide, 1 rope), tin_pot is found in crash-site crate only, iron tools (need iron_ingot: axe 2 ingot+2 stick+1 rope, pick 3+2+1, spear 2+2+1).
Campfire (must be lit; cooking takes time, UI is instant "cook" consuming 1 fuel-second budget — keep simple: instant craft at lit fire): cooked_meat, cooked_fish, snow_water (needs tin_pot; "gather snow" is free), clean_water (snow_water → boil), herbal_tea (clean_water + herb).
Furnace (lit): iron_ingot (2 iron_ore + 1 coal).

## 8. Building (grid placement, one per tile)

| structure | cost | hp | notes |
|---|---|---|---|
| campfire | 3 stick, 3 stone | 40 | fuel in seconds: stick 20, wood 60, coal 150; max 600. Lit while fuel>0. Light 5 tiles, heat. Cooking station. Needs flint in inventory to light first time (flint not consumed). |
| wood_wall | 2 wood | 80 | blocks movement, wind |
| stone_wall | 3 stone, 1 wood | 200 | |
| door | 2 wood, 1 rope | 60 | player walks through; creatures don't |
| workbench | 4 wood, 2 stone | 60 | crafting station (within 2 tiles) |
| chest | 4 wood | 60 | 12 slots storage |
| bedroll | 3 fiber, 2 hide | 20 | walkable; sleep |
| furnace | 8 stone, 2 coal | 120 | fuel like campfire (coal/wood only); smelting; heat +15 |
| drying_rack | 4 stick, 2 rope | 30 | raw_meat → jerky in 120s, up to 3 at once |
| snare | 2 stick, 1 rope | 10 | walkable; each dawn 50% chance to hold a rabbit (1 raw_meat, 1 hide) if >= 6 tiles from a lit fire |
| spike_barricade | 3 stick, 1 wood | 60 | blocks; creatures touching/attacking take 8 dmg/s |
| torch_post | 2 stick, 1 fat | 20 | light 4 tiles, burns 300s then needs fat/coal refuel; wolves avoid lit radius unless enraged |
| fishing_hole | 1 stick (needs pickaxe or axe; only on ice) | – | interact: 6s cast, 55% raw_fish; 8% line snaps |
| radio_tower | 6 iron_ingot, 6 wood, 2 rope + antenna, battery, circuit | 300 | see §10 |

Enclosure: a set of walkable tiles is a **room** if flood-fill from it (4-neighbour, blocked by walls/doors/cliffs/other blocking structures) stays within 60 tiles and never escapes. Recompute on any structure add/remove. Rooms are drawn with a wooden floor tint; when the player is inside, shown normally; exposes `isSheltered(tx,ty)`.
Structures can be damaged by wolves/bears (they attack walls/doors when they have aggro and no path). Repair: interact with matching material in inventory (1 unit = +50% hp). Dismantle: hold interact in build mode → refund 50%.
Placement: in build mode a ghost follows the tile in front of the player (or tapped/hovered tile within 3 tiles); green = valid, red = invalid; confirm with action button/tap.

## 9. Creatures (no zombies, no monsters)

| creature | hp | speed (tiles/s) | behaviour | drops |
|---|---|---|---|---|
| rabbit | 6 | 4.2 | wanders, flees within 5 tiles | 1 raw_meat, 1 hide(50%) |
| deer | 30 | 4.6 | herd 2–4, flees within 7 tiles (sneak = no sprint → 4 tiles) | 3 raw_meat, 2 hide, 1 bone, 1 fat |
| wolf | 28 | 3.9 (player walk 3.2, sprint 4.8) | packs. Day: keeps distance, attacks only if player HP<40 or adjacent to their kill. Night: hunts player within 10 tiles; circles, lunges (dmg 9, cd 1.4s). Fears lit fire/torch: won't enter lit radius of fire while pack < boldness threshold. Flees at hp<30%. | 2 raw_meat, 1 hide, 1 bone, 1 fat |
| bear | 120 | 3.6 | territorial around den (6 tiles); charges, dmg 25, cd 2s; returns home when you leave 12 tiles. Hibernates? No — always dangerous. | 6 raw_meat, 3 hide, 2 bone, 3 fat |

Wolf escalation: pack size at night = `1 + floor(day/2)` (cap 6); from day 5 wolves will attack structures; from day 8 fire no longer deters packs >= 4.
Spawning: off-screen, >= 14 tiles from player; population caps (rabbits 14, deer 8, wolves by pack rule, bears = dens). Despawn far wolves at dawn.
Combat: melee = arc in facing direction with reach; brief knockback + hit flash; i-frames 0.5s for player after being hit. Bow: hold/tap fires arrow at target direction (auto-aim to nearest hostile within 30° cone on touch).

## 10. Endgame

1. Find 3 radio parts (wreckage sites; marked on compass only after you get within 20 tiles, or after reading the "flight map" found in the starting crate which shows rough directions as HUD arrows).
2. Build Radio Tower (iron needed → furnace → ore/coal near bear dens).
3. Interact to start transmitting. Needs a lit campfire or furnace within 4 tiles ("power" — abstracted as thermoelectric generator) continuously; every second without power pauses progress. Progress: 3 full nights. Each signal night spawns an enraged wolf pack (+2 size, ignores fire) that targets the tower and you. Tower destroyed → must rebuild (parts drop on ground).
4. After third dawn: rescue plane flyover cutscene (simple), victory screen with stats.

Death screen: cause of death, days survived, stats, "Try again" (new seed).

## 11. Controls & UI

Touch: 
- Left 45% of screen: floating virtual joystick (appears where thumb lands). Push to edge = sprint.
- Right side: big **Action** button (context: attack / gather / interact with the highlighted target; label/icon changes), smaller **Bag**, **Build**, and **Use** (use/eat currently selected hotbar item) buttons.
- Hotbar (5 slots) bottom centre; tap to select; selected tool is what Action uses.
- Tapping the world (not on UI): in build mode chooses the ghost tile; otherwise ignored (avoid mis-taps).
Desktop: WASD/arrows move, Shift sprint, Space or left click = action, E = interact, F = use item, I/Tab = bag, B = build, 1–5 hotbar, Esc closes panels, mouse sets facing.
Target highlighting: nearest interactable in a ~1.4-tile cone in facing direction gets an outline; Action applies to it.
HUD: top-left 5 compact stat bars with icons (pulse red under 25); top-centre day number + clock dial + temperature readout + weather icon; status-effect icons; toast messages; storm warning banner. Panels (bag/craft, build menu, chest, fire/furnace fuel, death, victory, title/pause) are DOM overlays, scrollable, usable with one thumb, never requiring hover.
First-run onboarding: short objective tracker ("Gather sticks and stones" → "Build a campfire" → "Light it / add fuel" → "Craft an axe" → "Build walls around your fire" → "Find the wreckage"), dismissible.
Safe areas: respect `env(safe-area-inset-*)`; prevent page scroll/zoom/long-press selection; handle resize/orientation; pause when tab hidden.

## 12. Art & audio direction

- Palette: snow `#e8eef4`/`#d5dfe9`, shadows blue-grey `#8a9bb0`, pines `#1f4037`/`#2f5d50`, rock `#6b7280`, wood `#8b5a2b`, fire `#ff9f1c`/`#ffbf69`/`#e71d36`, UI dark `#101820` w/ 85% opacity panels, text `#f4f1de`, danger `#e63946`, good `#7bd389`.
- Chunky, slightly rounded shapes with soft drop shadows, drawn into cached offscreen sprites at startup (no per-frame path building for static things). Player: small parka figure with facing + walk bob. Night: darkness layer with warm radial light cut-outs and flicker. Snow particles in screen space; blizzard = dense, diagonal, plus white fog overlay.
- Audio: WebAudio synth only — footstep crunch, chop, mine, fire crackle loop (volume by distance), wind (by weather), wolf howl at dusk, hit, eat, craft, UI click. Starts after first user gesture. Mute toggle.

## 13. Tech architecture

- Vanilla JS ES modules, no framework, no runtime dependencies. `index.html` + `src/**`. Dev: any static server (`npm run dev`). Build: `npm run build` → esbuild bundle inlined into ONE self-contained `dist/index.html` (inline JS+CSS, no external requests).
- Canvas 2D for world; DOM for HUD/panels. DevicePixelRatio aware (cap 2). Fixed-step simulation (60 Hz, max 5 steps/frame), render interpolation optional.
- **Single serialisable state object** `game.state` (plain data only: player, world tiles/objects, creatures, time, weather, flags, stats). Non-serialisable runtime stuff lives on `game` (canvas, caches, input, audio).
- **Systems**: each `src/systems/<name>.js` exports `{ name, init(game), update(game, dt), onLoad?(game) }`, registered in order in `src/systems/index.js`. Systems communicate via state + `game.events` (tiny pub/sub: `on(evt, fn)`, `emit(evt, payload)`).
- **Pure logic is DOM-free** (world gen, inventory, crafting, temperature model, enclosure flood-fill, AI steering helpers, save migrate) so it runs under `node --test`. Rendering/UI/input/audio are the only DOM-touching modules.
- **Data-driven**: `src/data/{items,recipes,structures,creatures,balance}.js` hold all numbers from this doc. No magic numbers in systems.
- Deterministic seeded RNG (`mulberry32`) for world gen; `game.state.seed`.
- Save: `localStorage['last-ember-save-v1']`, autosave each dawn, on pause/visibility hidden, and every 60s; all access in try/catch (may be unavailable); version field + migrate fn.
- Debug: `window.__game` exposed; URL param `?debug=1` shows FPS + cheat keys; `?seed=123` fixes seed. Tests (Playwright) drive the game through `window.__game`.
- Performance budget: 60 fps on a mid phone; draw only visible tiles (+1 margin); spatial lookup of objects by tile index; creature cap ~40.

Suggested layout:
```
index.html  package.json  scripts/build.mjs  scripts/serve.mjs
src/main.js  src/game.js  src/events.js  src/rng.js  src/input.js  src/audio.js  src/save.js
src/data/*.js
src/world/{gen,world,enclosure}.js
src/systems/{index,time,weather,survival,player,gather,crafting,building,structures,creatures,combat,endgame,tutorial}.js
src/logic/{inventory,temperature,...}.js      (pure)
src/render/{renderer,sprites,lighting,particles}.js
src/ui/{hud,panels,touch,...}.js   src/ui/style.css
tests/unit/*.test.js   tests/e2e/*.mjs
ARCHITECTURE.md   (maintained by engineers: real APIs, state shape, how to add a system/item/structure)
```

## 14. Definition of done (PM acceptance)

- Fresh load → title → playable within 2 taps on a 390x844 phone viewport and on 1280x800 desktop; no console errors.
- A competent player can: gather, craft tools, build & light a fire, wall a room, cook, drink, sleep, hunt, survive blizzards, find parts, build the tower, win. An idle player dies on night 1.
- Save/reload restores everything. Death and victory flows work. `npm test` green. `dist/index.html` works opened standalone.


## Appendix A. Balance log (headless playtest bot, `tests/sim/`)

**Tooling.** `npm run sim` = 4 profiles x 10 seeds x 14 days (`idle`, `sloppy`, `competent`, `rusher`; options `--profile a,b --seeds N --first S --days D --set key=val --scenario late`). `npm run test:sim` = fast subset (~15 s) that asserts the targets below. `node tests/sim/baseline.mjs` re-runs the ORIGINAL numbers for before/after tables. `node tests/sim/worldcheck.mjs 40 15` = resource census near spawn. The bot plays through the real input/interaction/crafting/build paths (touch joystick intents, Action button, `game.crafting.craft`, build menu + tap-to-place, `useStack`); it only *reads* state. Every sim-day the run is saved and loaded; the full state must be identical after load. All gameplay randomness uses one seeded stream (`state.rngA`, `game.rand()`), so runs reproduce.

**Before -> after (10 seeds, 14 days, same bot, seeded RNG):**

| profile | before (original numbers) | after (final numbers) |
|---|---|---|
| idle | dead at 218 s (all 10), warmth 0 at ~150 s | dead 349-363 s (8 hypothermia, 2 wolf); warmth 0 not before ~330 s |
| sloppy | median 1271 s (day 3), 0/10 reach day 6 | median 1726 s (day 4), 0/10 reach day 6, 9/10 reach day 3 |
| competent | median day 14, 7/10 die; first hunt 600 s, shelter 177 s, bedroll 1624 s | median day 12, 9/10 die by day 14 (6 wolf, 3 cold); 10/10 reach day 6, 9/10 day 9; first hunt 181 s, shelter 118 s, bedroll 963 s |
| rusher | median 1290 s (day 3) | median 1703 s (day 4); 7/10 find >=1 radio part, none finish |

Competent milestones (median, seconds of game time): first axe 8, pickaxe 19, campfire lit 43, workbench 56, shelter complete 118 (first dusk is at ~260), bow 148, first meal 364, bedroll+first sleep ~1200, drying rack + snares ~1000. Daytime split days 2-8 (awake): food/hunting 27%, drinking/warming at the fire 27%, fuel + wood 12%, building/crafting 10%. Stats do dip: warmth < 25 for ~140 s per run, thirst < 25 ~100 s, health < 25 ~22 s.

**Number changes and why**
| value | old | new | evidence |
|---|---|---|---|
| day-1 ambient bonus | none | +8 °C day 1, fade over first 240 s of day 2; day-1 weather-free 120 s -> 300 s | idle warmth hit 0 at 152 s; now >= 330 s and still dead before dawn. Later days unchanged (sloppy stays at day 3-5) |
| worn_jacket | +3 | +4 | tuning of the same slack |
| rock_node flint chance | 35% | 60% | arrows/flint were the hunting bottleneck: the bot spent ~120 s per day mining flint and starved |
| arrow craft | x4 | x6 | same |
| bandage | cloth / fiber+herb | + hide+fiber | bleeding (until bandaged) was a top-3 killer; cloth only exists in crates, herbs are ~0-2 within 15 tiles |
| iron_node / coal_node yield | 2-3 / 2-4 | 3-4 / 3-5 | worst seeds had 6 iron nodes (15 ore = 7 ingots, barely the tower); now >= 21 ore |
| snare dawn chance | 35% | 50% | snares were not worth the rope vs. bow hunting |
| jerky hunger | 25 | 40 | cooking is instant, so a rack that makes weaker food was strictly useless |

**Checked and left alone:** resource density (30 seeds: >= 13 trees, >= 5 dead bushes (fiber), >= 3 boulders, >= 2 berry bushes within 15 tiles), hunger/thirst rates, wolf escalation, wall/spike numbers, 16 slots (the bot filled the bag with 3 stacks of sticks/stone and had to manage it: slots do create choices), durability (a stone axe = 60 durability = about 15 trees).

**Bugs found and fixed (regression tests in tests/unit/determinism.test.js and tests/sim/sim.test.js)**
* Creature AI, drops, snares, fishing, poison, arrow recovery used `Math.random`: sims were not reproducible and a save/load did not continue the random stream. Now one seeded stream in `state.rngA`.
* `Math.random` monkey-patches in 3 existing unit tests replaced by `game.rand`.
* `game.building.list(type)` returns a `Set` (not an array): fine in the game, a trap for tools; documented here.
* Save -> load round trip: full-state comparison is exact except `survival.rate` (the smoothed HUD trend arrow, recomputed on load) - cosmetic.
* Build mode left in 'dismantle' silently replaces the Action target (the player can no longer chop or gather and gets no hint). Bot-side guard added; a human might hit it by leaving dismantle mode on (untested). Candidate UI fix for the QA engineer: cancel dismantle mode when the build bar closes.

**What the bot cannot do (bot limits, not game limits)**
It does not fish, craft herbal tea, use torches/torch posts, scout with the flight map, run forward camps, or sneak up on deer. It never finishes the endgame: it collects 2-3 radio parts by day 6-9 and sometimes smelts a few ingots and crafts iron tools, but wolves or cold end the run first (days 9-14). The tower/signal code is exercised only by the existing headless 3-night endgame unit test, not by the bot. Stone-wall upgrade is slow (one wall at a time), so the bot usually faces day-8+ packs behind wood.

**Remaining balance risks for a human playtester**
1. Wolves at day 8+ (packs of 5+ ignoring fire) kill a wooden base quickly. Is stone wall + spikes + a spear enough, and is a signal night (+2 wolves) winnable? Not demonstrated by the bot.
2. Rabbits are nearly unreachable with a spear (the bot only hunts with the bow); is the bow-first progression clear to a new player? Flint/arrows gate food.
3. Cooking and water boiling are instant and free; fuel is the only cost. Fishing (6 s cast, 55%) is likely the best food source where a lake is close.
4. Day 1 is tight: first dusk at ~260 s after start; the bot has a closed shelter at ~120 s, a human may not.
5. A bear on an iron cluster is the main danger of iron runs (the bot killed bears in 4-5 of 10 competent runs while mining; hp cost not measured); a first bear fight at full hp is untested with humans.
