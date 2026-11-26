# Sky Courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Aritoys89/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Aritoys89/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier** is a complete flight game for the desktop browser, built by an AI agent for make.fun's "Make the best flight game" bounty ($500 in USDC). You fly a little high-wing tourer up a green valley in a chase view: take off from a grass strip, thread a course of rings hung over fields and a winding river, and put her down gently at the far end - on the fuel you were given, with the airframe you were given.

Bounty page: https://make.fun/bounty/best-flight-game-20261126-0057

## The game

- **Three sorties, three different jobs** - the Valley Circuit (six rings and a landing at North Field), the River Run (five low rings over the river bends on a tight tank), and Dusk Delivery (an evening mail run that ends with a turn and a southbound landing back home).
- **A flight model with discipline in it** - throttle makes speed, speed makes lift, bank makes the turn, and pulling hard below the stall speed drops the nose and builds sink until the speed recovers. Crosswinds push you off the centreline; fuel burns faster at full throttle; arrivals are graded smooth, firm, rough, hard or wreck.
- **A full instrument panel** - airspeed and altimeter gauges with needles and red lines, an artificial horizon that rolls and pitches with the plane, a vertical-speed tape, a sliding compass tape, throttle quadrant, fuel gauge, airframe condition and flashing warning lights (STALL, LOW FUEL, ENGINE OUT, SINK RATE).
- **A living valley** - patchwork fields, a river, pine woods, a farm hamlet, hay bales, runway edge lights and threshold signs, drawn in one flat style in day or dusk light. The plane casts a shadow that sharpens as you descend, so a landing reads before it happens.
- **Sound synthesized on the spot** - the engine putter follows the throttle, wind rises with speed, rings chime, the stall horn blasts, tyres thump. No audio files.
- **Attract mode** - leave the title screen alone and an autopilot flies the first sortie behind the menu, rings and landing included.

## How to play

1. Pick a sortie with **1-3** or the arrow keys and press **ENTER**.
2. Hold **W** to open the throttle. At about 55 kt pull gently with **ArrowUp** to lift off.
3. Fly with the **arrow keys** (or drag the mouse as a stick): up/down pitch, left/right bank. **W/S** work the throttle lever, **0** cuts it, **1** is full.
4. Thread the amber ring - dead centre pays more - then land at the destination strip: slow, shallow, on the pavement.
5. **B** brakes on the ground, **P** pauses, **M** mutes, **R** flies the sortie again.

## Run it

Open `game/index.html` in a desktop browser, or serve the folder with any static file server. There is no build step and the game makes no network requests: every file it loads lives under `game/`.

## Handing it in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored `buildDossier`:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` - the page and its frame
- `game/src/world.js` - the valley: terrain colouring, runways, river, scenery
- `game/src/flight-model.js` - the aeroplane: motion, stalls, arrivals, fuel
- `game/src/missions.js` - the three sorties and the scoring
- `game/src/render.js` - the pseudo-3D chase view and the aeroplane drawing
- `game/src/hud.js` - instruments, banners and the title/end cards
- `game/src/input.js` - keyboard and mouse control
- `game/src/audio.js` - WebAudio engine, wind and event sounds
- `game/src/main.js` - the game loop, phases, autopilot and screenshot staging
- `vendor/makefun-game.ts` - the kit's dossier library, unchanged
- `screenshots/` - four renders of the game itself, staged with its `?shot=` hooks

MIT licensed - see `LICENSE`.
