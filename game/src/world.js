// world.js - the valley the game flies over: seeded terrain colouring, two
// runways, a winding river, and the scenery objects (trees, farmhouses, hay
// bales) that the renderer projects as billboards. Everything here is pure
// data and pure functions of world coordinates, so a given seed always
// builds the same valley.

// A small deterministic PRNG (mulberry32): the world must look identical on
// every load and in every screenshot, so Math.random is never used here.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of a ground cell, used to pick a stable field colour per cell.
function cellHash(cx, cz) {
  let h = (cx * 374761393 + cz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The two runways: grass strips with an asphalt band down the middle, both
// aligned north-south at x = 0. Home strip in the south, far strip up north.
export const RUNWAYS = [
  { name: 'HOME STRIP', x: 0, zFrom: -60, zTo: 940, width: 34 },
  { name: 'NORTH FIELD', x: 0, zFrom: 5160, zTo: 6160, width: 34 },
];

export function runwayAt(wx, wz) {
  for (const strip of RUNWAYS) {
    if (Math.abs(wx - strip.x) <= strip.width / 2 + 26 && wz >= strip.zFrom - 40 && wz <= strip.zTo + 40) {
      return strip;
    }
  }
  return null;
}

export function onPavement(wx, wz) {
  const strip = runwayAt(wx, wz);
  if (!strip) return false;
  return Math.abs(wx - strip.x) <= strip.width / 2 && wz >= strip.zFrom && wz <= strip.zTo;
}

// The river bends across the valley on a slow sine; the renderer and the
// ground colouring both read this so the water always lines up.
export function riverCentre(z) {
  return 330 * Math.sin(z * 0.0009) + 120 * Math.sin(z * 0.0027 + 1.7);
}
const RIVER_HALF_WIDTH = 30;

const FIELD_PALETTE = ['#5d8a3c', '#6b9a44', '#7fae4e', '#8a9a3f', '#a8a04c', '#77913e', '#699244', '#94884a'];
const FIELD_PALETTE_DUSK = ['#445c33', '#4d6b38', '#59773d', '#5f6d33', '#7a7440', '#526635', '#4f7036', '#6d633c'];

// Colour of the ground at a world point. dusk=true selects the evening set.
export function groundColour(wx, wz, dusk) {
  const strip = runwayAt(wx, wz);
  if (strip) {
    const onBand = Math.abs(wx - strip.x) <= strip.width / 2 && wz >= strip.zFrom && wz <= strip.zTo;
    if (onBand) {
      // Asphalt with painted threshold bars at each end.
      const local = wz - strip.zFrom;
      const offCentre = Math.abs(wx - strip.x);
      // (The centreline dashes are drawn by the renderer as projected
      // quads, so they stay thin at every distance instead of blocking.)
      const inThreshold = local < 40 || local > strip.zTo - strip.zFrom - 40;
      if (inThreshold && ((offCentre > 1.8 && offCentre < 3.6) || (offCentre > 6.4 && offCentre < 8.2))) return '#cfcfc4';
      return dusk ? '#33373d' : '#43484f';
    }
    // Mown grass apron around the pavement.
    return dusk ? '#3d5230' : '#54803a';
  }
  if (Math.abs(wx - riverCentre(wz)) < RIVER_HALF_WIDTH) {
    return dusk ? '#274b63' : '#3f74a3';
  }
  const cell = 110;
  const cx = Math.floor(wx / cell);
  const cz = Math.floor(wz / cell);
  const palette = dusk ? FIELD_PALETTE_DUSK : FIELD_PALETTE;
  const base = palette[Math.floor(cellHash(cx, cz) * palette.length)];
  // A dirt track runs beside the river bank.
  if (Math.abs(wx - riverCentre(wz)) < RIVER_HALF_WIDTH + 9) return dusk ? '#5c5136' : '#8a7a4e';
  return base;
}

// Scenery objects scattered once per seed: pine trees on the field edges, a
// farm hamlet mid-valley, round hay bales after harvest. Each entry carries
// its own size and tint so the renderer only has to project and paint.
export function buildScenery(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const objects = [];
  const clearOfRunway = (x, z) => !runwayAt(x, z) && Math.abs(x - riverCentre(z)) > RIVER_HALF_WIDTH + 16;

  for (let i = 0; i < 620; i++) {
    const x = (rng() - 0.5) * 3600;
    const z = -500 + rng() * 7400;
    if (!clearOfRunway(x, z)) continue;
    objects.push({ kind: 'pine', x, z, size: 7 + rng() * 6, tint: rng() });
  }
  for (let i = 0; i < 130; i++) {
    const x = (rng() - 0.5) * 2600;
    const z = -300 + rng() * 7000;
    if (!clearOfRunway(x, z)) continue;
    objects.push({ kind: 'oak', x, z, size: 5 + rng() * 4, tint: rng() });
  }
  // A hamlet of farmhouses clustered around the mid-valley crossroads.
  for (let i = 0; i < 26; i++) {
    const x = -420 + (rng() - 0.5) * 260;
    const z = 2650 + (rng() - 0.5) * 420;
    if (!clearOfRunway(x, z)) continue;
    objects.push({ kind: 'house', x, z, size: 9 + rng() * 5, tint: rng(), turn: rng() * Math.PI });
  }
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * 2200;
    const z = rng() * 6400;
    if (!clearOfRunway(x, z)) continue;
    objects.push({ kind: 'bale', x, z, size: 2.2 + rng() * 0.9, tint: rng() });
  }
  objects.sort((a, b) => a.z - b.z);
  return objects;
}

// The course of rings for a mission is data, not code: each ring hangs at a
// world position with a radius; flying through the middle scores best.
export function makeRing(x, alt, z, radius) {
  return { x, alt, z, radius, passed: false, missed: false };
}
