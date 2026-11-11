# Last Ember — Architecture (the real contracts)

`DESIGN.md` says *what* the game is; this file says *how the code is wired*. If code and this file disagree, fix the file.
Vanilla JS ES modules, no runtime deps. Commands: `npm run dev` (static server :8080), `npm test` (node --test), `npm run test:e2e`
(Playwright smoke, writes `tests/e2e/out/*.png`), `npm run build` (-> single `dist/index.html`).
URL params: `?seed=N`, `?debug=1` (FPS/pos overlay + cheat keys), `?touch=1|0` (force touch UI on/off). `window.__game` is always exposed.

## 1. Layout and ownership

```
index.html  src/main.js  (wiring only)
src/game.js   events.js   rng.js   input.js   save.js   state.js   debug.js
src/data/     balance items recipes structures creatures terrain      <- plain data; append/extend freely
src/world/    gen.js (seeded generation)   world.js (World API)
src/logic/    inventory clock collision targeting                     <- PURE (no DOM), unit-tested
src/systems/  index.js (registry) time player targeting  + yours
src/render/   renderer lighting sprites objects icons  sprites/*.js   <- DOM (canvas)
src/ui/       index hud hotbar panels touch title slots style.css  panels/*.js
tests/unit/*.test.js   tests/e2e/smoke.mjs
```
**Seams (append one line, rarely conflict):** `src/systems/index.js` (systems) · `src/render/sprites/index.js` (sprite files) ·
`src/ui/panels/index.js` (panels) · `src/data/*.js` (tables) · `src/logic/*` (new pure modules) · `STATUS_DEFS` in `ui/hud.js`.
Each system lives in its own file and owns its own slice of `game.state` and its own events. Do not edit another engineer's system; talk through events/state.

## 2. State (`game.state`) — plain JSON only

```
state = {
  version, seed,
  world:     { w:128, h:128, terrain:'0012…' (1 char/tile: 0 snow 1 deep_snow 2 ice 3 rock 4 cliff),
               objects:{ [ty*w+tx]: obj }, spawn:{tx,ty}, pois:[{type,tx,ty,part?,quadrant?}] },
  player:    { x,y (world px, circle centre), vx,vy, facing (rad, 0=E, PI/2=S), moving, sprinting, bob,
               health,hunger,thirst,warmth,stamina (0..100), status:{}, invuln },
  inventory: { bag:[16], hotbar:[5], clothing:[3 = head|body|feet], selected },   // slot = null | {id,n,dur?}
  flags:{}, stats:{ daysSurvived, createdAt, playSeconds },
  time:      { day, t, speed, phase, light, ambient, clock, phaseT, phaseLen },   // owned by systems/time.js
  <yourSystem>: …                                                                 // from your system's defaults()
}
```
* Add your slice by giving your system `defaults: () => ({...})` (key = `system.stateKey ?? system.name`). It is created for new games AND filled in for old saves. Never edit `state.js` for a slice.
* Objects (`world.objects`): `{ type, tx, ty, variant?, hp?, depleted?, loot?, part?, …your fields }`. `type` must exist in `STRUCTURES` or `NODES` (`objectDef(type)`).
* Everything must survive `JSON.parse(JSON.stringify(state))` (no Map/Set/functions/NaN). Runtime caches live on `game`, rebuilt in `onLoad`.
* Persistent randomness: world gen uses `rng.js` (`createRng(seed)`); gameplay randomness may use `Math.random()`.

## 3. The `game` object (`src/game.js`)

| field | meaning |
|---|---|
| `state`, `world` | current state; `world` = World API wrapper over `state.world` (re-created on load) |
| `events` | pub/sub (§5) |
| `systems` | the ordered array from `systems/index.js` |
| `mode` | `'title' \| 'playing' \| 'over'`; `paused`, `hidden` (tab hidden); `running` = playing && !paused && !hidden |
| `input` | `{ intent, press(name), selectHotbar(i), worldTap(sx,sy), releaseAll(), touch }` (§7) |
| `ui` | `{ toast, setBanner, setObjective, setActionLabel, panels, hud, hotbar, touch }` (§9). A no-op stub exists headless |
| `renderer`, `view`, `camera` | `view={w,h,dpr,scale}` css px; `camera={x,y,w,h,scale}` world px (top-left + visible size); `renderer.screenToWorld/worldToScreen` |
| `target` | current interactable (§8) |
| `speedModifiers[]` | `fn(game)->multiplier`, multiplied into player speed (weather, cold slowness, …) |
| `targetProviders[]` | `fn(game,px,py)->[{kind,x,y,name,verb,radius,ref}]` extra targetables (creatures, …) |
| `lightProviders[]` | `fn(game,push)` extra light sources (§6) |
| `params`, `canvas`, `tick`, `time` | URL params, canvas, fixed ticks run, simulated seconds |
| `debug` | `{teleport(tx,ty), give(id,n), setTime(day,t), tp(poiIdx), kit()}` |

Methods: `newGame(seed?)`, `loadGame()`, `save()`, `hasSave()`, `pause()/resume()`, `toTitle()`, `end('death'|'victory', info)` (clears save, emits `game:over`, UI shows the game-over panel),
`attachState(state)`, `step(n)` (run n fixed ticks — used by tests; headless: `createGame()` works in node with no DOM).
Loop (`startLoop`): fixed 1/60 s, max 5 steps/frame, rendering every rAF, no simulation while hidden/paused/title.
Tick order: `input.update()` → every system `update(game, 1/60)` in registry order → `input.endTick()` (clears edge flags).

## 4. Systems (`src/systems/index.js`)

```js
export default {
  name: 'survival',
  defaults: () => ({ … }),            // optional state slice (state.survival)
  init(game) {},                       // once at boot: subscribe to events, push providers/modifiers, register panels/sprites
  onLoad(game) {},                     // after EVERY state attach (new/load): rebuild runtime caches from state
  update(game, dt) {},                 // fixed step
  // optional render hooks (called by render/renderer.js every frame):
  drawGround(game, ctx, cam) {},       // under objects, world-space ctx (floors, decals)
  drawables(game, cam, push) {},       // push({ y /*ground y*/, draw(ctx) }) -> y-sorted with trees & player (creatures, projectiles)
  drawFx(game, ctx, cam) {},           // world-space above entities, before darkness
  lights(game, push) {},               // push({x,y,radius(TILES),flicker,color?:'r,g,b',intensity?,glow?})
  drawScreen(game, ctx, w, h) {},      // screen-space after darkness (weather particles, frost vignette); ctx scaled to css px
}
```
Register: create `src/systems/<name>.js`, then add one import and one array entry in `systems/index.js` (order matters: time → player → targeting are first; put new gameplay systems after them).
Built-in: `time` (day/clock/phase/ambient), `player` (movement), `targeting` (`game.target`).
Rules: no magic numbers (put them in `data/balance.js`); no DOM in `update`; talk to others via `state` + `game.events`.

## 5. Events (`game.events`: `on(evt,fn)->off`, `once`, `off`, `emit(evt,payload)`; handler errors are isolated)

| event | payload | emitted by |
|---|---|---|
| `state:loaded` | state | game (after newGame/loadGame, systems' `onLoad` already ran) |
| `game:new` `{seed}` · `game:loaded` · `game:title` · `game:pause` · `game:resume` · `game:hidden` | | game |
| `game:over` | `{kind:'death'\|'victory', cause?, stats, day}` | `game.end()` (emit via `end`, don't emit directly) |
| `tick` | tick number | game (every fixed step; prefer `update`) |
| `time:phase` | `{phase, prev, day}` and `time:dawn\|day\|dusk\|night` `{day}` | time |
| `time:newDay` | `{day}` (at sunrise) | time (also triggers autosave) |
| `world:objectChanged` | `{tx,ty,obj|null,prev|null}` | world set/remove (enclosure/room recompute listens here) |
| `target:changed` | target or null | targeting |
| `input:toggleBag` `input:toggleBuild` `input:escape` `input:hotbar{index}` `input:worldTap{sx,sy,wx,wy}` | | input (work while paused) |
| `build:toggle` | `{open}` | ui (after the build panel toggles; building system should listen) |
| `hotbar:changed` | `{index}` | hotbar |
| `panel:open` `panel:close` | `{id}` | panels |

Add new events freely; document them here (one row).

## 6. World API (`game.world`, `src/world/world.js`, pure)

`w,h,TILE` · `inBounds(tx,ty)` · `toTile(px)` · `worldToTile(x,y)->{tx,ty}` · `tileToWorld(tx,ty)->{x,y}` (top-left) · `tileCenter(tx,ty)` · `spawnPx()`
Terrain: `terrainAt(tx,ty)->'snow'|'deep_snow'|'ice'|'rock'|'cliff'` (out of bounds = cliff) · `terrainDef` · `terrainCode` · `setTerrain(tx,ty,id)` · `terrainSpeed(tx,ty)`.
Objects (max 1/tile): `objectAt(tx,ty)` · `setObject(tx,ty,obj)` (sets obj.tx/ty, replaces) · `removeObject(tx,ty)` · `forEachObject(fn)` · `objectList()` · `forEachObjectInRect(tx0,ty0,tx1,ty1,fn)`.
Movement: `isBlocked(tx,ty,{creature?})` — cliff, out-of-bounds, or object whose def has `blocks` (or, with `{creature:true}`, `blocksCreatures`, e.g. door) · `isBlockedAtPx`.
`pois()` -> `[{type:'crash_site'|'wreckage'|'bear_den', tx,ty, part?, quadrant?}]`.
`logic/collision.moveCircle(world,x,y,dx,dy,r)->{x,y,hitX,hitY}` — circle vs tile rects, sliding; creatures should reuse it.
Generation (`generateWorld(seed)`) guarantees: border cliffs; clearing at spawn; crash-site crate (`loot` on the object) 2 tiles from spawn; 3 wreckage in 3 different quadrants ≥40 tiles away, each carrying one of the radio parts (`obj.part`, `obj.loot`); 2–3 bear dens on rock with iron/coal clusters; loose stones/sticks, trees, bushes near spawn; every POI reachable (paths are carved if needed).
Node/pickup/POI defs are in `data/structures.js` `NODES` (gather yields, hp, verb, regrow days).

## 7. Input (`src/input.js`, `src/ui/touch.js`)

`game.input.intent` (poll in `update`; edge flags are true only for the first tick after the event):
`moveX,moveY` (len ≤ 1) · `sprint` · `actionPressed/actionHeld` · `interactPressed` · `usePressed` · `hotbarSelect` (-1|0..4) · `toggleBag/toggleBuild/escape` · `pointer{sx,sy,wx,wy,active,down}` · `aimActive` (mouse moved recently → facing follows pointer) · `worldTap{sx,sy,wx,wy}|null` (touch tap on the world, for build ghost) · `uiBlocked` (a modal panel is open: ignore movement/actions).
Keyboard: WASD/arrows, Shift sprint, Space/left click action, E interact, F use, I/Tab bag, B build, 1–5 hotbar, Esc.
Touch (shown when touch is detected): floating joystick in the left 45% (push to the edge = sprint), Action (big) / Use / Bag / Build on the right, hotbar bottom-centre, taps on the right zone → `worldTap`. Pointer Events + per-pointer capture ⇒ multi-touch (move while holding Action). Scrolling/zoom/selection/context-menu are blocked; safe-area insets honoured in CSS.
Tests/e2e can drive input by writing `game.input.intent.moveX = 1` then `game.step(n)`.
What the **Action/Interact/Use** intents *do* is the job of gameplay systems (gather/combat/building/consume) — read `game.target` + `state.inventory` selected stack.

## 8. Targeting (`systems/targeting.js`, `logic/targeting.js`)

Each tick `game.target = null | { kind, x, y, name, verb, radius, obj?, tx?, ty?, def?, ref? }`: nearest candidate within `PLAYER.interactCone` (1.4 tiles, ±55°, or <0.75 tile at any angle) among world objects whose def has `interactable: true` and not `obj.depleted`, plus anything from `game.targetProviders`. The renderer outlines `target.obj` (or draws a ring for non-object targets); the action button label follows `target.verb` (`game.ui.setActionLabel`).

## 9. Rendering

Order: terrain (+edge feather, macro shade) → `drawGround` → y-sorted drawables (objects, player, `drawables`) → target outline → `drawFx` → darkness/lighting → `drawScreen`. Camera follows the player, clamped to the map, snapped to device pixels. View scale: ~12 tiles on the short side (1.0–1.75). Canvas is DPR-aware (cap 2).
* **Time of day** (`systems/time.js`, `logic/clock.js`): day = 480 s, night 180 s growing +6 s/day (cap 300); `t` = seconds since sunrise; phases dawn(30s)/day/dusk(30s)/night; `state.time.light` 0.06..1 drives the darkness layer; `state.time.speed` multiplies time (sleep → 12). Ambient °C = `ambientTemperature(day, light)` (weather offsets are the weather system's job, added in HUD via `state.weather?.offset` / `state.weather?.type`).
* **Light sources**: from a system's `lights(game, push)` or `game.lightProviders`. `push({ x, y /*world px*/, radius /*TILES*/, flicker /*0..0.2*/, color?, intensity?, glow? })`. The player has a built-in 1.5-tile light. Example (campfire system): iterate fires, `push({x:cx,y:cy,radius:5,flicker:0.1})`.
* **Sprites** (`render/sprites.js`): `registerSprite(name,{w,h,ax,ay,variants,draw(ctx,variant,rng)})` in world px (1 tile=32; origin top-left; ctx pre-scaled by cache resolution); `getSprite/drawSprite(ctx,name,variant,x,y)`. Object ground point = `(tx*32+16, ty*32+27)`. The renderer draws an object with the sprite named `obj.type` (variant `obj.variant`), or `<type>:empty` when `obj.depleted`. Add a file in `render/sprites/`, call `registerSprite`, append `import './yourfile.js'` to `render/sprites/index.js`. Use helpers in `sprites/util.js` (shadow, boulder, smoothPoly, PAL).
* **Animated/stateful objects** (lit campfire): `registerObjectDrawer(type, (ctx,obj,x,y,game,time)=>{})` from `render/objects.js` (x,y = ground point).
* **Item icons** (`render/icons.js`): generated from `item.shape`/`item.color`; override with `registerIcon(id,(ctx,size,item)=>{})`; DOM: `ui/slots.js paintSlot(el, stack)`.

## 10. UI

`game.ui.toast(msg, kind='info'|'good'|'bad', ms)` · `setBanner(text|null)` (storm warning) · `setObjective(text|null)` · `setActionLabel(text)`. HUD binds to `state.player.{health,hunger,thirst,warmth,stamina}` (bars pulse red < 25), `state.time`, `state.player.status` keys (chips; add labels in `STATUS_DEFS`), `game.target` (hint chip). Hotbar is bound to `state.inventory.hotbar/selected`.
**Panels** (`ui/panels.js`): modal DOM overlays, scrollable, ≥44px targets, never need hover.
```js
// src/ui/panels/craft.js
export default { id:'craft', title:'Crafting', modal:true, pauses:false,
  render(game, body, payload, ctl) { body.innerHTML = '…'; return { update(){ /* called every frame while open */ }, destroy(){} }; } };
// append to src/ui/panels/index.js:  import craft from './craft.js'; …PANELS = [ …, craft ]
```
Open from anywhere: `game.ui.panels.open('craft', payload)`; `close/toggle/closeAll/isOpen/modalOpen`. `modal:true` sets `intent.uiBlocked`. Existing: `bag` (basic move/equip), `build` (placeholder), `pause`, `gameover`. Esc closes the top panel, else opens pause. Title screen (`ui/title.js`): New game / Continue (reflects `game.hasSave()`).

## 11. Inventory (`src/logic/inventory.js`, pure)

Container = `{bag:[…], hotbar:[…], clothing:[…], selected}` or a chest `createContainer(12)` (`{bag:[12]}`); slot = `null | {id,n,dur?}`; slot ref = `{a:'bag'|'hotbar'|'clothing', i}` (`ref(a,i)`).
`createInventory()`, `createContainer(n)`, `add(inv,id,n,{dur?})->leftover` (stacks to `item.stack`, tools never stack and carry `dur`; tools prefer hotbar) · `canAdd(inv,id,n)` / `canAddCount` · `count/has` · `remove(inv,id,n)->bool` (all-or-nothing) · `removeAt(inv,ref,n)->stack` · `hasAll/removeAll(inv,[{item,n}])` (recipes/costs) · `move(inv,from,to,n?)` (merge/split/swap) · `swap` · `equip(inv,ref)` (clothing → matching slot, old piece returns) · `accepts` · `getSlot` · `selectedStack` / `selectHotbar` · `insulation(inv)` (°C sum) · `wear(inv,ref,amount)->'ok'|'broken'|null` · `makeStack(id,n,dur?)`.

## 12. Data tables (`src/data/*`, all numbers from DESIGN §3–§10)

* `balance.js` — `TILE, MAP, LOOP, CAMERA, INVENTORY, TIME, TEMPERATURE, WEATHER, SURVIVAL, PLAYER, LIGHT, BUILD, FIRE, COMBAT, WOLF, SPAWN, ENDGAME, WORLD_GEN, SAVE, STATE_VERSION`. Units: tiles, seconds, tiles/s.
* `items.js` — `ITEMS[id]` fields documented at top (`kind, stack, fuel, food{hunger,thirst,warmth,health,poison,cures}, tool{class,dmg,reach,dur,mult,ammo,range,light,heat,burn}, clothing{slot,insulation}`); `HANDS`; helpers `itemDef/maxStack/hasDurability`.
* `recipes.js` — `RECIPES[]` `{id,out:{item,n},in:[{item,n}],station:'hand|workbench|campfire|furnace',tools:[]}`; OR-recipes are separate entries; `recipesFor(station)`.
* `structures.js` — `STRUCTURES[id]` (cost, hp, blocks/blocksCreatures, fuel, light, heat, storage, process, requires, extra), `NODES[id]` (resource nodes, pickups, POIs: `gather{tool,hp,drops,handDrops,regrowDays}`, `verb`, `interactable`), `LOOT`, `objectDef(type)`.
* `creatures.js` — `CREATURES[id]` (hp, speed tiles/s, radius, flee, herd, drops, dmg, cooldown, …). `terrain.js` — `TERRAIN[id]` (code, speed, blocks, colors).

**Add an item**: one entry in `items.js` (+ optional `registerIcon`). **Add a recipe**: one entry in `recipes.js`. **Add a structure**: entry in `STRUCTURES`, a sprite file (`registerSprite(id,…)`) and a system that handles its behaviour. **Add a resource node**: entry in `NODES` + sprite; world gen placement in `world/gen.js` if it should spawn.

## 13. Save (`src/save.js`)

`localStorage['last-ember-save-v1'] = {v, savedAt, state}`. `save(state[,storage])`, `load()`, `hasSave()`, `clear()`, `parse/serialize`, `migrate(state)` using `MIGRATIONS[n]=(state)=>state` (bump `STATE_VERSION` in balance.js when the shape changes incompatibly; additive changes only need `defaults()`). All storage access is try/catch-guarded. Autosave (`installAutosave`): every 60 s, each sunrise (`time:newDay`), pause, tab hidden, pagehide — only while `mode==='playing'`. Death/victory (`game.end`) clears the save.

## 14. Testing

`tests/unit` (node --test, DOM-free): rng, world gen determinism/POI constraints/reachability/world API/collision, inventory, save round-trip, game loop (headless `createGame()`, `game.step(n)`), time, targeting. New pure logic ⇒ add a test file there.
`tests/e2e/smoke.mjs`: Playwright (global install; loaded through `createRequire`), phone 390×844 with real multi-touch via CDP + desktop 1280×800, dev server and `dist/index.html` over `file://`; asserts movement and **zero console errors**; screenshots in `tests/e2e/out/`. Tests may drive the game via `window.__game`.
