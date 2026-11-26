// missions.js - the three sorties on the board, and the scoring of a
// flight. Each mission is data: where it starts, the rings it strings
// across the valley, where it must end, how much fuel and weather it gets.
// The scorer turns a finished flight - rings centred, arrival graded, fuel
// and time left - into points and a verdict the end screen can print.

import { RUNWAYS, makeRing } from './world.js';

export const MISSIONS = [
  {
    id: 'valley-circuit',
    name: 'VALLEY CIRCUIT',
    brief: 'Take off from Home Strip, thread all six rings up the valley, and land at North Field.',
    startStrip: 0,
    startHeading: 0,
    landStrip: 1,
    landHeading: 0,
    fuel: 100,
    wind: { x: 1.2, z: 0.4 },
    dusk: false,
    rings: [
      makeRing(30, 80, 1350, 26),
      makeRing(-90, 120, 2050, 26),
      makeRing(120, 95, 2750, 24),
      makeRing(-40, 150, 3450, 24),
      makeRing(80, 110, 4150, 24),
      makeRing(0, 85, 4800, 26),
    ],
  },
  {
    id: 'river-run',
    name: 'RIVER RUN',
    brief: 'A low, quick dash: five rings hung close over the river bends, then land at North Field. Fuel is tight - cruise, do not race.',
    startStrip: 0,
    startHeading: 0,
    landStrip: 1,
    landHeading: 0,
    fuel: 62,
    wind: { x: -2.4, z: 0.8 },
    dusk: false,
    rings: [
      makeRing(300, 42, 1250, 22),
      makeRing(180, 36, 2150, 22),
      makeRing(-60, 44, 3050, 22),
      makeRing(-260, 38, 3900, 22),
      makeRing(-40, 55, 4650, 24),
    ],
  },
  {
    id: 'dusk-delivery',
    name: 'DUSK DELIVERY',
    brief: 'Evening mail run: climb out at dusk, cross the valley through four rings, then turn around and land back at Home Strip facing south.',
    startStrip: 0,
    startHeading: 0,
    landStrip: 0,
    landHeading: Math.PI,
    fuel: 88,
    wind: { x: 2.8, z: -1.2 },
    dusk: true,
    rings: [
      makeRing(-70, 130, 1600, 26),
      makeRing(150, 170, 2500, 26),
      makeRing(-120, 150, 3400, 26),
      makeRing(40, 120, 4300, 26),
    ],
  },
];

// The phases a sortie moves through; the HUD banner and the win/lose logic
// both key off this one list.
export const PHASE = {
  READY: 'ready',       // on the strip, engine idling, waiting for throttle
  TAKEOFF: 'takeoff',   // rolling or climbing out, rings not yet active
  COURSE: 'course',     // rings active, next ring highlighted
  FINAL: 'final',       // all rings done, the landing is the whole job now
  LANDED: 'landed',     // down and stopped at the destination strip
  ENDED: 'ended',       // wrecked, lost, or down in the wrong place
};

export function createSortie(mission) {
  return {
    mission,
    phase: PHASE.READY,
    rings: mission.rings.map((r) => ({ ...r, passed: false, missed: false })),
    nextRing: 0,
    ringsFlown: 0,
    centreBonus: 0,
    elapsed: 0,
    arrivalGrade: null,
    endReason: '',
    score: null,
  };
}

// Watch the plane against the next ring: crossing the ring's plane of
// flight within its radius counts, and a centred crossing pays more. A
// ring left behind uncrossed is marked missed and the course moves on.
export function updateRings(sortie, plane, prevZ) {
  const ring = sortie.rings[sortie.nextRing];
  if (!ring) return null;
  const crossed = (prevZ - ring.z) * (plane.z - ring.z) <= 0 && plane.z !== prevZ;
  const passedNorth = plane.z > ring.z + 40;
  if (crossed) {
    const dx = plane.x - ring.x;
    const dy = plane.alt - ring.alt;
    const dist = Math.hypot(dx, dy);
    if (dist <= ring.radius) {
      ring.passed = true;
      sortie.ringsFlown += 1;
      const centred = dist <= ring.radius * 0.45;
      if (centred) sortie.centreBonus += 1;
      sortie.nextRing += 1;
      return centred ? 'centred' : 'through';
    }
  }
  if (passedNorth && !ring.passed) {
    ring.missed = true;
    sortie.nextRing += 1;
    return 'missed';
  }
  return null;
}

// Score a finished sortie. Rings are the meat; a kind arrival, fuel in the
// tank and a brisk clock add the garnish. A wreck scores the rings alone.
export function scoreSortie(sortie, plane, tank) {
  const ringPoints = sortie.ringsFlown * 150 + sortie.centreBonus * 75;
  const arrivalPoints = { smooth: 500, firm: 320, rough: 120, hard: 60, wreck: 0 }[sortie.arrivalGrade] ?? 0;
  const fuelPoints = plane.wrecked ? 0 : Math.round(tank.fuel * 2);
  const timePoints = plane.wrecked ? 0 : Math.max(0, 300 - Math.round(sortie.elapsed * 0.8));
  const total = ringPoints + arrivalPoints + fuelPoints + timePoints;
  return {
    ringPoints, arrivalPoints, fuelPoints, timePoints, total,
    grade: total >= 1500 ? 'ACE' : total >= 1100 ? 'CAPTAIN' : total >= 750 ? 'PILOT' : total >= 400 ? 'STUDENT' : 'GROUNDED',
  };
}

export function destinationStrip(sortie) {
  return RUNWAYS[sortie.mission.landStrip];
}
