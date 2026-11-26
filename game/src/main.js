// main.js - the game itself: it owns the plane, the current sortie and the
// clock, steps the flight model at a fixed rate, reacts to what the model
// reports (liftoff, arrivals, wrecks), and paints world then HUD each
// frame. It also stages the deterministic ?shot= scenes the screenshots
// are taken from, and flies the attract-mode autopilot behind the title.

import { buildScenery, RUNWAYS } from './world.js';
import { createPlane, placeOnRunway, stepPlane, burnFuel } from './flight-model.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { MISSIONS, PHASE, createSortie, updateRings, scoreSortie } from './missions.js';

const canvas = document.getElementById('sky');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
const input = createInput();
const audio = createAudio();

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const scenery = buildScenery(seed);

const state = {
  mode: 'title', // title | flying | paused | ended
  time: 0,
  selected: 0,
  plane: createPlane(),
  sortie: null,
  tank: { fuel: 100 },
  flash: null,
  endedAt: -10,
  stallHornAt: 0,
  demo: params.get('demo') === '1',
};

function setFlash(text, colour = '#ffd75e') {
  state.flash = { text, colour, at: state.time };
}

function startSortie(index) {
  const mission = MISSIONS[index];
  state.sortie = createSortie(mission);
  state.tank = { fuel: mission.fuel };
  placeOnRunway(state.plane, RUNWAYS[mission.startStrip], mission.startHeading);
  state.plane.engineOut = false;
  input.control.throttle = 0;
  state.mode = 'flying';
  audio.unlock();
  audio.click();
}

// Where the autopilot (and the landing phase) wants to be: the next ring,
// or the destination threshold once the rings are done.
function courseTarget(sortie, plane) {
  const ring = sortie.rings[sortie.nextRing];
  if (ring && sortie.phase !== PHASE.FINAL) return { x: ring.x, alt: ring.alt, z: ring.z, ring: true };
  const strip = RUNWAYS[sortie.mission.landStrip];
  const headingHome = sortie.mission.landHeading !== 0;
  return {
    x: strip.x,
    alt: 0,
    z: headingHome ? strip.zTo - 60 : strip.zFrom + 60,
    ring: false,
  };
}

// A simple, honest autopilot for the title screen's attract mode: it
// climbs to the course, threads the rings and lands, using the same stick
// and throttle the player has. It is not perfect, and that is the point -
// it flies the real model, stalls and all.
function autopilotControl(sortie, plane, dt) {
  const target = courseTarget(sortie, plane);
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  let err = desired - plane.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const bank = clampNum(err * 1.4, -0.62, 0.62);
  let targetAlt = target.alt;
  let throttle = 0.66;
  if (plane.onGround) {
    throttle = plane.speed < 30 ? 1 : 0.85;
    return { pitch: plane.speed > 26 ? 0.55 : 0, bank: 0, throttle };
  }
  if (!target.ring) {
    // Final approach: aim at a point above the threshold that shallows
    // into the touchdown, and bleed speed as the strip nears.
    targetAlt = Math.max(0, (dist - 60) * 0.055);
    throttle = dist < 500 ? 0.18 : 0.5;
    if (dist < 260) throttle = 0.08;
  } else if (dist > 900) {
    targetAlt = Math.max(target.alt, 130);
  }
  const altErr = targetAlt - plane.alt;
  let pitch = clampNum(altErr * 0.02, -0.5, 0.65);
  if (plane.speed < 24) pitch = Math.min(pitch, -0.1); // never stall-chase height
  if (!target.ring && plane.alt < 4 && dist < 200) pitch = 0.1; // flare
  return { pitch, bank, throttle };
}

function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// One fixed step of the simulation and everything that hangs off it.
function step(dt) {
  const { plane, sortie } = state;
  if (!sortie) return;
  const prevZ = plane.z;
  const wasAirborne = !plane.onGround;

  let control;
  if (state.demo) {
    control = autopilotControl(sortie, plane, dt);
    input.control.throttle = control.throttle;
  } else {
    control = input.control;
  }
  if (control.brake && plane.onGround) plane.speed = Math.max(0, plane.speed - 7 * dt);

  const wind = { windX: sortie.mission.wind.x, windZ: sortie.mission.wind.z };
  const events = stepPlane(plane, control, dt, wind);
  if (sortie.phase !== PHASE.ENDED && sortie.phase !== PHASE.LANDED) sortie.elapsed += dt;

  const hadFuel = state.tank.fuel > 0;
  burnFuel(plane, state.tank, dt);
  if (hadFuel && state.tank.fuel <= 0) setFlash('FUEL EMPTY - ENGINE STOPPED', '#e0483e');

  if (events.liftedOff) {
    if (sortie.phase === PHASE.READY || sortie.phase === PHASE.TAKEOFF) sortie.phase = PHASE.TAKEOFF;
    setFlash('AIRBORNE', '#7dd87d');
  }
  if (sortie.phase === PHASE.TAKEOFF && plane.alt > 24) sortie.phase = PHASE.COURSE;
  if (sortie.phase === PHASE.READY && plane.speed > 2) sortie.phase = PHASE.TAKEOFF;

  // Rings only count on the course, flown in order.
  if ((sortie.phase === PHASE.COURSE || sortie.phase === PHASE.TAKEOFF) && !plane.onGround) {
    const result = updateRings(sortie, plane, prevZ);
    if (result === 'centred') { setFlash('RING CENTRED +225', '#7dd87d'); audio.ringChime(); }
    else if (result === 'through') { setFlash('RING +150', '#ffd75e'); audio.ringChime(); }
    else if (result === 'missed') { setFlash('RING MISSED', '#e0483e'); audio.ringMiss(); }
    if (sortie.nextRing >= sortie.rings.length && sortie.phase === PHASE.COURSE) {
      sortie.phase = PHASE.FINAL;
      setFlash('ALL RINGS FLOWN - LAND HER', '#7dd87d');
    }
  }

  if (events.touchedDown) {
    audio.touchdown();
    if (events.scraped) audio.scrape();
    sortie.arrivalGrade = events.arrival;
    const strip = RUNWAYS[sortie.mission.landStrip];
    const atDestination = Math.abs(plane.x - strip.x) <= strip.width / 2 + 4
      && plane.z >= strip.zFrom && plane.z <= strip.zTo;
    if (events.arrival === 'wreck') {
      endSortie('WRECKED ON ARRIVAL');
    } else if (atDestination && sortie.phase === PHASE.FINAL) {
      sortie.phase = PHASE.LANDED; // scored once she rolls to a stop
      setFlash(`TOUCHDOWN - ${events.arrival.toUpperCase()}`, '#7dd87d');
    } else {
      if (events.arrival === 'smooth') setFlash('SMOOTH TOUCHDOWN', '#7dd87d');
      if (events.arrival === 'firm') setFlash('FIRM ARRIVAL - MIND THE GEAR', '#ffd75e');
      if (events.arrival === 'rough') setFlash('ROUGH - OFF THE PAVEMENT', '#ffd75e');
      if (events.arrival === 'hard') setFlash('HARD ARRIVAL - AIRFRAME BENT', '#e0483e');
      sortie.phase = PHASE.TAKEOFF; // bounce back into the sortie
    }
  }
  if (events.crashed && sortie.phase !== PHASE.ENDED) {
    audio.crash();
    endSortie(plane.alt <= 0 && wasAirborne ? 'CRASHED' : 'WRECKED');
  }

  // A landed plane that has rolled to a stop ends the sortie in success.
  if (sortie.phase === PHASE.LANDED && plane.speed < 0.4) {
    sortie.score = scoreSortie(sortie, plane, state.tank);
    state.mode = 'ended';
    state.endedAt = state.time;
    audio.fanfare();
  }

  // Lost out of the valley.
  if (sortie.phase !== PHASE.ENDED && sortie.phase !== PHASE.LANDED
    && (Math.abs(plane.x) > 2600 || plane.z > 7600 || plane.z < -1100)) {
    endSortie('LOST - FLEW OUT OF THE VALLEY');
  }

  // Stall horn, sounded in short blasts rather than a constant scream.
  if (plane.stalled && state.time - state.stallHornAt > 0.55) {
    state.stallHornAt = state.time;
    audio.stallHorn();
  }
  audio.setFlight(plane.throttle, plane.speed, state.mode === 'flying');
}

function endSortie(reason) {
  const { sortie, plane } = state;
  if (sortie.phase === PHASE.ENDED) return;
  sortie.phase = PHASE.ENDED;
  sortie.endReason = reason;
  if (!sortie.score) sortie.score = scoreSortie(sortie, plane, state.tank);
  state.mode = 'ended';
  state.endedAt = state.time;
}

function draw() {
  const { plane, sortie } = state;
  const dusk = sortie ? sortie.mission.dusk : false;
  renderer.drawWorld({
    plane,
    scenery,
    rings: sortie ? sortie.rings : [],
    nextRing: sortie ? sortie.nextRing : -1,
    dusk,
    time: state.time,
  });
  if (state.mode === 'title') {
    hud.drawTitle(MISSIONS, state.selected);
  } else if (sortie) {
    hud.draw({ plane, sortie, tank: state.tank, time: state.time, flash: state.flash });
    if (state.mode === 'paused') hud.drawPaused();
    if (state.mode === 'ended') hud.drawEnd(sortie, plane);
  }
}

// Fixed-step loop: the model always advances in 1/120 s slices, so the
// physics (and the staged screenshots) do not depend on the frame rate.
let lastStamp = null;
let accumulator = 0;
const STEP = 1 / 120;
function frame(stamp) {
  if (lastStamp === null) lastStamp = stamp;
  let elapsed = Math.min(0.1, (stamp - lastStamp) / 1000);
  lastStamp = stamp;
  state.time += elapsed;
  handleKeys();
  // The attract backdrop flies again a few seconds after each ending.
  if (state.demo && state.mode === 'ended' && state.time - state.endedAt > 4) beginAttract();
  if (state.mode === 'flying') {
    input.update(elapsed);
    accumulator += elapsed;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      if (state.mode !== 'flying') { accumulator = 0; break; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

function handleKeys() {
  const pressed = input.takePressed();
  if (state.mode === 'title') {
    if (pressed.has('Digit1')) state.selected = 0;
    if (pressed.has('Digit2')) state.selected = 1;
    if (pressed.has('Digit3')) state.selected = 2;
    if (pressed.has('ArrowDown') || pressed.has('ArrowRight')) state.selected = (state.selected + 1) % MISSIONS.length;
    if (pressed.has('ArrowUp') || pressed.has('ArrowLeft')) state.selected = (state.selected + MISSIONS.length - 1) % MISSIONS.length;
    if (pressed.has('Enter')) startSortie(state.selected);
  } else if (state.mode === 'flying') {
    if (pressed.has('KeyP')) state.mode = 'paused';
    if (pressed.has('KeyR')) startSortie(MISSIONS.indexOf(state.sortie.mission));
  } else if (state.mode === 'paused') {
    if (pressed.has('KeyP') || pressed.has('Enter')) state.mode = 'flying';
  } else if (state.mode === 'ended') {
    if (pressed.has('Enter')) { state.mode = 'title'; beginAttract(); }
    if (pressed.has('KeyR')) startSortie(MISSIONS.indexOf(state.sortie.mission));
  }
  if (pressed.has('KeyM')) audio.toggleMute();
}

// The title screen flies itself: the autopilot takes the first sortie out
// behind the menu, and takes it out again whenever it ends.
function beginAttract() {
  state.demo = true;
  startSortie(0);
  state.demo = true; // startSortie reads input; keep demo flag after it
  state.mode = 'flying';
}

// ---- Staged scenes for the screenshots ------------------------------------
// ?shot=<name> freezes the game in a composed, deterministic moment of a
// sortie. The scene is stepped a fixed number of times with fixed inputs
// and then painted once, so the same URL always renders the same frame.
function stageShot(name) {
  const missionIndex = Number(params.get('mission') ?? 0) || 0;
  startSortie(missionIndex);
  state.demo = false;
  const { plane, sortie } = state;
  const settle = (steps, control) => {
    input.control.throttle = control.throttle;
    input.control.pitch = control.pitch ?? 0;
    input.control.bank = control.bank ?? 0;
    for (let i = 0; i < steps; i++) {
      state.time += STEP;
      step(STEP);
    }
  };
  if (name === 'takeoff') {
    plane.z = 330; plane.speed = 34; plane.pitch = 0.05;
    sortie.phase = PHASE.TAKEOFF;
    settle(50, { throttle: 0.94, pitch: 0.1 });
  } else if (name === 'rings') {
    sortie.rings.forEach((ring, i) => { if (i < 4) ring.passed = true; });
    sortie.ringsFlown = 4; sortie.centreBonus = 2; sortie.nextRing = 4;
    sortie.phase = PHASE.COURSE; sortie.elapsed = 96;
    plane.x = 52; plane.alt = 118; plane.z = 3960; plane.speed = 47;
    plane.bank = 0.14; plane.pitch = 0.02; plane.onGround = false;
    settle(40, { throttle: 0.62, bank: 0.17 });
  } else if (name === 'landing') {
    sortie.rings.forEach((ring) => { ring.passed = true; });
    sortie.ringsFlown = sortie.rings.length; sortie.centreBonus = 3;
    sortie.nextRing = sortie.rings.length;
    sortie.phase = PHASE.FINAL; sortie.elapsed = 168;
    plane.x = 5; plane.alt = 32; plane.z = 4690; plane.speed = 30;
    plane.pitch = -0.03; plane.onGround = false;
    settle(40, { throttle: 0.24 });
  } else if (name === 'end') {
    sortie.rings.forEach((ring) => { ring.passed = true; });
    sortie.ringsFlown = sortie.rings.length; sortie.centreBonus = 3;
    sortie.nextRing = sortie.rings.length;
    sortie.elapsed = 212;
    state.tank.fuel = 34;
    plane.x = 0; plane.alt = 0; plane.z = 5560; plane.speed = 0;
    plane.onGround = true;
    sortie.arrivalGrade = 'smooth';
    sortie.phase = PHASE.LANDED;
    sortie.score = scoreSortie(sortie, plane, state.tank);
    state.mode = 'ended';
  }
  draw();
  window.__shotReady = true;
}

// Debug and soak-test handle: lets a headless browser drive the game and
// read its state without touching the internals above.
window.__flight = {
  state,
  startSortie,
  missions: MISSIONS,
};

const shotName = params.get('shot');
if (shotName) {
  stageShot(shotName);
} else {
  beginAttract();
  // The attract mode is a backdrop: the first real keypress hands the
  // plane to the player at the title screen.
  window.addEventListener('keydown', function handOver() {
    if (state.demo && !params.get('demo')) {
      state.demo = false;
      state.mode = 'title';
      placeOnRunway(state.plane, RUNWAYS[0], 0);
      state.sortie = null;
    }
    window.removeEventListener('keydown', handOver);
  });
  requestAnimationFrame(frame);
}
