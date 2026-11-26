// flight-model.js - the aeroplane and the rules of its motion: a light
// arcade flight model with real discipline in it. Throttle makes speed,
// speed makes lift, bank makes turn, and pulling hard at low speed stalls.
// The model is stepped with a fixed dt by the game loop and knows nothing
// about rendering, so its behaviour is identical in play and in tests.

import { onPavement, runwayAt } from './world.js';

export const LIMITS = {
  stallSpeed: 21,        // m/s - below this the wing stops holding you up
  rotateSpeed: 26,       // m/s - ground speed where a pull lifts the nose
  maxSpeed: 78,          // m/s - the airframe will not go faster level
  touchdownSink: 3.4,    // m/s - softest sink that still counts as gentle
  wreckSink: 8.5,        // m/s - arrival steeper than this bends the plane
  touchdownSpeed: 34,    // m/s - fastest arrival the gear forgives
  fuelCapacity: 100,
};

export function createPlane() {
  return {
    x: 0, alt: 0, z: 0,          // position in metres (x east, z north)
    heading: 0,                   // radians, 0 = north, positive turns right
    pitch: 0,                     // radians, positive = nose up
    bank: 0,                      // radians, positive = right wing down
    speed: 0,                     // m/s along the flight path
    verticalSpeed: 0,             // m/s, positive = climbing
    throttle: 0,
    onGround: true,
    stalled: false,
    engineOut: false,
    damage: 0,                    // 0 sound .. 100 wrecked
    wrecked: false,
    propPhase: 0,                 // for the spinning propeller drawing
  };
}

export function placeOnRunway(plane, strip, heading) {
  plane.x = strip.x;
  plane.z = strip.zFrom + 90;
  plane.alt = 0;
  plane.heading = heading;
  plane.pitch = 0;
  plane.bank = 0;
  plane.speed = 0;
  plane.verticalSpeed = 0;
  plane.throttle = 0;
  plane.onGround = true;
  plane.stalled = false;
  plane.damage = 0;
  plane.wrecked = false;
}

// Advance the plane one step. control = { pitch, bank, throttle } where
// pitch/bank are stick deflections in -1..1 and throttle is the lever
// position 0..1 (input.js integrates the lever; the model just reads it).
// env = { windX, windZ } crosswind in m/s. Returns an events object naming
// anything the game should react to this step (liftoff, touchdown, crash).
export function stepPlane(plane, control, dt, env) {
  const events = { liftedOff: false, touchedDown: false, crashed: false, scraped: false };
  if (plane.wrecked) return events;

  plane.throttle = plane.engineOut ? 0 : control.throttle;

  // Stick to surface angles: the surfaces answer quickly but not instantly,
  // which is what makes the plane feel like it has weight.
  const pitchRate = plane.onGround ? 1.1 : 0.85;
  const bankRate = 1.9;
  plane.pitch += clamp(control.pitch * 0.34 - plane.pitch, -pitchRate * dt, pitchRate * dt);
  plane.bank += clamp(control.bank * 0.95 - plane.bank, -bankRate * dt, bankRate * dt);

  // Thrust against drag, plus gravity trading speed for height on a climb.
  const thrust = plane.throttle * 9.5;
  const drag = 0.0038 * plane.speed * plane.speed + (plane.onGround ? 0.55 : 0.12);
  const slope = plane.onGround ? 0 : Math.sin(plane.pitch) * 6.4;
  plane.speed += (thrust - drag - slope) * dt;
  if (plane.onGround && plane.throttle === 0) plane.speed = Math.max(0, plane.speed - 2.6 * dt);
  plane.speed = clamp(plane.speed, 0, LIMITS.maxSpeed + 14);

  // Turning: a banked wing tilts the lift, so heading follows bank and is
  // steadier at speed. On the ground the nosewheel steers instead.
  if (plane.onGround) {
    plane.heading += control.bank * 0.35 * dt * clamp(plane.speed / 12, 0, 1);
  } else {
    const turnRate = (9.81 * Math.tan(clamp(plane.bank, -1.1, 1.1))) / Math.max(plane.speed, 12);
    plane.heading += clamp(turnRate, -0.9, 0.9) * dt;
  }

  // Lift and sink. Level lift holds the plane when speed is healthy; below
  // the stall the nose drops and the sink builds until speed recovers.
  const liftRatio = clamp(plane.speed / LIMITS.stallSpeed, 0, 1.25);
  plane.stalled = !plane.onGround && liftRatio < 0.92;
  let climb = Math.sin(plane.pitch) * plane.speed * (plane.stalled ? 0.35 : 1);
  if (plane.stalled) climb -= (0.92 - liftRatio) * 16;
  if (plane.onGround) climb = 0;
  plane.verticalSpeed += (climb - plane.verticalSpeed) * Math.min(1, dt * 3.2);

  // Travel: forward along the heading, plus the wind's push sideways.
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  plane.x += (fx * plane.speed + env.windX * (plane.onGround ? 0 : 1)) * dt;
  plane.z += (fz * plane.speed + env.windZ * (plane.onGround ? 0 : 1)) * dt;
  plane.alt += plane.verticalSpeed * dt;
  plane.propPhase += dt * (4 + plane.throttle * 46 + plane.speed * 0.22);

  // Liftoff: enough speed and a nose-up attitude leaves the ground.
  if (plane.onGround && plane.speed >= LIMITS.rotateSpeed && plane.pitch > 0.045) {
    plane.onGround = false;
    plane.verticalSpeed = Math.max(plane.verticalSpeed, 1.2);
    plane.alt = Math.max(plane.alt, 0.4);
    events.liftedOff = true;
  }

  // Ground contact: judge the arrival by sink, speed and surface.
  if (!plane.onGround && plane.alt <= 0) {
    plane.alt = 0;
    const sink = -plane.verticalSpeed;
    const paved = onPavement(plane.x, plane.z);
    events.touchedDown = true;
    events.arrival = judgeArrival(plane, sink, paved);
    if (events.arrival === 'wreck') {
      plane.wrecked = true;
      plane.damage = 100;
      plane.speed = Math.min(plane.speed, 6);
      events.crashed = true;
    } else {
      if (events.arrival === 'hard') { plane.damage = Math.min(100, plane.damage + 42); events.scraped = true; }
      if (events.arrival === 'rough') { plane.damage = Math.min(100, plane.damage + 18); events.scraped = true; }
      if (plane.damage >= 100) { plane.wrecked = true; events.crashed = true; }
      plane.onGround = true;
      plane.verticalSpeed = 0;
      plane.pitch = Math.min(plane.pitch, 0.02);
    }
  }

  // Rolling into the scenery sideways is still an arrival.
  if (plane.onGround && !runwayAt(plane.x, plane.z) && plane.speed > 44) {
    plane.damage = Math.min(100, plane.damage + 30 * dt);
    if (plane.damage >= 100 && !plane.wrecked) { plane.wrecked = true; events.crashed = true; }
  }
  return events;
}

// Grade an arrival: 'smooth' on the strip at a kind sink and speed,
// 'firm' a little hot or heavy, 'rough' off the pavement, 'hard' a thump
// the airframe remembers, 'wreck' beyond every limit at once.
export function judgeArrival(plane, sink, paved) {
  if (sink > LIMITS.wreckSink || plane.speed > 52) return 'wreck';
  if (!paved) return sink > 5.2 ? 'hard' : 'rough';
  if (sink > 5.6 || plane.speed > LIMITS.touchdownSpeed + 8) return 'hard';
  if (sink > LIMITS.touchdownSink || plane.speed > LIMITS.touchdownSpeed) return 'firm';
  return 'smooth';
}

// Fuel burns with the lever: a cruise throttle sips, full throttle drinks.
// Returns false on the step the tank runs dry.
export function burnFuel(plane, tank, dt) {
  if (plane.engineOut || plane.wrecked) return tank.fuel > 0;
  tank.fuel = Math.max(0, tank.fuel - dt * (0.055 + plane.throttle * 0.30));
  if (tank.fuel <= 0 && !plane.engineOut) {
    plane.engineOut = true;
    return false;
  }
  return true;
}

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}
