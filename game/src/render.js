// render.js - the chase view: a pseudo-3D projection of the valley from
// just behind and above the aeroplane. The sky and far ridges are painted
// flat, the ground is drawn as perspective scanline strips coloured by the
// world under them, and the scenery, rings and runway furniture are
// projected as billboards, far to near. The aeroplane itself is drawn last
// in the foreground, banked and pitched with its flight, over its own
// shadow on the ground below.

import { groundColour, riverCentre, RUNWAYS } from './world.js';
import { clamp } from './flight-model.js';

const FOCAL = 690; // projection focal length in pixels at 800px height

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const horizonBase = Math.round(H * 0.42);

  // The camera trails the plane: a little above, a little behind, looking
  // down the heading with the plane's pitch lifting the horizon slightly.
  function cameraFor(plane) {
    const back = 17;
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    return {
      x: plane.x - fx * back,
      z: plane.z - fz * back,
      alt: plane.alt + 5.5,
      heading: plane.heading,
      horizon: horizonBase - plane.pitch * 340 - clamp(plane.alt * 0.12, 0, 26),
    };
  }

  // World point -> screen point, or null when it sits behind the camera.
  function project(cam, wx, wy, wz) {
    const dx = wx - cam.x;
    const dz = wz - cam.z;
    const sin = Math.sin(cam.heading);
    const cos = Math.cos(cam.heading);
    const cz = dx * sin + dz * cos;          // distance ahead
    if (cz < 1.5) return null;
    const cx = dx * cos - dz * sin;          // distance to the right
    const scale = FOCAL / cz;
    return {
      x: W / 2 + cx * scale,
      y: cam.horizon - (wy - cam.alt) * scale,
      scale,
      dist: cz,
    };
  }

  function drawSky(cam, dusk, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, cam.horizon + 4);
    if (dusk) {
      grad.addColorStop(0, '#2c3556');
      grad.addColorStop(0.55, '#7a5570');
      grad.addColorStop(1, '#e08a52');
    } else {
      grad.addColorStop(0, '#3f7fd0');
      grad.addColorStop(0.6, '#79aede');
      grad.addColorStop(1, '#cfe6f5');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, cam.horizon + 4);
    // Sun: low and warm at dusk, high and pale by day.
    const sunX = W * (dusk ? 0.78 : 0.82);
    const sunY = cam.horizon - (dusk ? 26 : 130);
    ctx.fillStyle = dusk ? '#ffb066' : '#fff3c4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, dusk ? 30 : 24, 0, Math.PI * 2);
    ctx.fill();
    // A few flat-bottomed clouds, drifting very slowly with the clock.
    ctx.fillStyle = dusk ? 'rgba(240,190,170,0.75)' : 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 263 + time * (2 + i)) % (W + 240)) - 120;
      const cy = 30 + (i * 47) % Math.max(60, cam.horizon - 120);
      const s = 26 + (i % 3) * 14;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 1.9, s * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.8, cy + 4, s * 1.2, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Far ridge lines, two depths, sliding gently against the heading so
    // the world feels wide when the plane turns.
    drawRidge(cam, 0.35, cam.horizon, dusk ? '#4a4460' : '#7d9bbd', 26);
    drawRidge(cam, 0.6, cam.horizon, dusk ? '#5c4a58' : '#93b184', 15);
  }

  function drawRidge(cam, parallax, baseY, colour, jag) {
    const shift = -cam.heading * 220 * parallax - cam.x * 0.02 * parallax;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 2);
    for (let x = 0; x <= W; x += 32) {
      const n = Math.sin((x + shift) * 0.011 + parallax * 9) * jag + Math.sin((x + shift) * 0.031) * jag * 0.4;
      ctx.lineTo(x, baseY - 8 - Math.abs(n));
    }
    ctx.lineTo(W, baseY + 2);
    ctx.closePath();
    ctx.fill();
  }

  // The ground as horizontal strips: each strip is one screen band whose
  // depth is solved from the camera height, then painted in lateral
  // segments coloured by the world beneath, with distance haze folded in.
  function drawGround(cam, dusk) {
    const sin = Math.sin(cam.heading);
    const cos = Math.cos(cam.heading);
    const segments = 44;
    let prevY = Math.floor(cam.horizon);
    for (let row = 0; row < 120; row++) {
      const y = Math.floor(cam.horizon + Math.pow(row / 120, 1.65) * (H - cam.horizon));
      if (y <= prevY) continue;
      const depth = (cam.alt * FOCAL) / Math.max(1, (prevY + y) / 2 - cam.horizon);
      if (depth > 4200) { prevY = y; continue; }
      const haze = clamp(depth / 4200, 0, 0.55);
      for (let s = 0; s < segments; s++) {
        const sx0 = (s / segments) * W;
        const sx1 = ((s + 1) / segments) * W;
        const lx = ((sx0 + sx1) / 2 - W / 2) * depth / FOCAL;
        const wx = cam.x + lx * cos + depth * sin;
        const wz = cam.z - lx * sin + depth * cos;
        ctx.fillStyle = shade(groundColour(wx, wz, dusk), haze, dusk);
        ctx.fillRect(sx0, prevY, sx1 - sx0 + 1, y - prevY + 1);
      }
      prevY = y;
      if (y >= H) break;
    }
    ctx.fillStyle = dusk ? '#3a4a30' : '#5d8a3c';
    ctx.fillRect(0, prevY, W, H - prevY);
  }

  // Blend a ground colour toward the horizon haze.
  function shade(hex, haze, dusk) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const hr = dusk ? 224 : 207, hg = dusk ? 138 : 230, hb = dusk ? 82 : 245;
    const mix = (c, h) => Math.round(c + (h - c) * haze);
    return `rgb(${mix(r, hr)},${mix(g, hg)},${mix(b, hb)})`;
  }

  // Billboard scenery: pines, oaks, farmhouses and hay bales, drawn far to
  // near and skipped when they fall outside the view wedge.
  function drawScenery(cam, objects, dusk) {
    const visible = [];
    for (const obj of objects) {
      const dx = obj.x - cam.x;
      const dz = obj.z - cam.z;
      if (dx * dx + dz * dz > 2600 * 2600) continue;
      const p = project(cam, obj.x, 0, obj.z);
      if (!p || p.x < -120 || p.x > W + 120) continue;
      visible.push({ obj, p });
    }
    visible.sort((a, b) => b.p.dist - a.p.dist);
    for (const { obj, p } of visible.slice(-170)) {
      const s = p.scale;
      if (obj.kind === 'pine') drawPine(p.x, p.y, obj.size * s, obj.tint, dusk);
      else if (obj.kind === 'oak') drawOak(p.x, p.y, obj.size * s, obj.tint, dusk);
      else if (obj.kind === 'house') drawHouse(p.x, p.y, obj.size * s, obj.tint, dusk);
      else drawBale(p.x, p.y, obj.size * s, dusk);
    }
  }

  function drawPine(x, groundY, h, tint, dusk) {
    if (h < 2) return;
    ctx.fillStyle = dusk ? '#3a2c20' : '#5a4230';
    ctx.fillRect(x - h * 0.03, groundY - h * 0.22, h * 0.06, h * 0.22);
    ctx.fillStyle = dusk ? '#24402a' : (tint > 0.5 ? '#2e6b34' : '#35793c');
    for (let tier = 0; tier < 3; tier++) {
      const wTier = h * (0.34 - tier * 0.08);
      const yBase = groundY - h * (0.18 + tier * 0.26);
      ctx.beginPath();
      ctx.moveTo(x - wTier, yBase);
      ctx.lineTo(x + wTier, yBase);
      ctx.lineTo(x, yBase - h * 0.34);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawOak(x, groundY, h, tint, dusk) {
    if (h < 2) return;
    ctx.fillStyle = dusk ? '#3a2c20' : '#6a4a2e';
    ctx.fillRect(x - h * 0.04, groundY - h * 0.4, h * 0.08, h * 0.4);
    ctx.fillStyle = dusk ? '#2c4a2c' : (tint > 0.5 ? '#4a7d33' : '#558a3a');
    ctx.beginPath();
    ctx.arc(x, groundY - h * 0.62, h * 0.42, 0, Math.PI * 2);
    ctx.arc(x - h * 0.3, groundY - h * 0.45, h * 0.28, 0, Math.PI * 2);
    ctx.arc(x + h * 0.3, groundY - h * 0.45, h * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(x, groundY, wHouse, tint, dusk) {
    if (wHouse < 3) return;
    const hHouse = wHouse * 0.52;
    ctx.fillStyle = dusk ? '#6b5a4a' : (tint > 0.5 ? '#cfc4ae' : '#bfb098');
    ctx.fillRect(x - wHouse / 2, groundY - hHouse, wHouse, hHouse);
    ctx.fillStyle = dusk ? '#54383a' : '#96503e';
    ctx.beginPath();
    ctx.moveTo(x - wHouse * 0.58, groundY - hHouse);
    ctx.lineTo(x + wHouse * 0.58, groundY - hHouse);
    ctx.lineTo(x, groundY - hHouse - wHouse * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dusk ? '#ffd98a' : '#5a4632';
    ctx.fillRect(x - wHouse * 0.12, groundY - hHouse * 0.62, wHouse * 0.24, hHouse * 0.34);
  }

  function drawBale(x, groundY, r, dusk) {
    if (r < 1.5) return;
    ctx.fillStyle = dusk ? '#8a7440' : '#c9a44e';
    ctx.beginPath();
    ctx.arc(x, groundY - r * 0.7, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dusk ? '#6e5c30' : '#a8863a';
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, groundY - r * 0.7, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Runway furniture the flat ground cannot show: threshold markers and
  // the rows of edge lights, which at dusk become the brightest thing in
  // the valley and make the landing read from far away.
  function drawRunwayFurniture(cam, dusk) {
    for (const strip of RUNWAYS) {
      // Centreline dashes as projected quads: a painted stripe 0.9 m wide
      // in 24 m dashes, so it reads thin and correct at every distance.
      ctx.fillStyle = dusk ? '#b9b9ac' : '#d8d8ce';
      for (let z = strip.zFrom + 26; z + 24 < strip.zTo; z += 52) {
        const near = project(cam, strip.x, 0, z);
        const far = project(cam, strip.x, 0, z + 24);
        if (!far) continue;
        const nearScale = near ? near.scale : FOCAL / 2;
        const nearY = near ? near.y : H + 40;
        const nearX = near ? near.x : far.x;
        ctx.beginPath();
        ctx.moveTo(nearX - 0.45 * nearScale, nearY);
        ctx.lineTo(nearX + 0.45 * nearScale, nearY);
        ctx.lineTo(far.x + 0.45 * far.scale, far.y);
        ctx.lineTo(far.x - 0.45 * far.scale, far.y);
        ctx.closePath();
        ctx.fill();
      }
      for (let z = strip.zFrom + 30; z < strip.zTo; z += 90) {
        for (const side of [-1, 1]) {
          const p = project(cam, strip.x + side * (strip.width / 2 + 3), 0.4, z);
          if (!p) continue;
          const r = clamp(p.scale * 0.5, 0.7, 5);
          ctx.fillStyle = dusk ? '#ffca6a' : '#e8e4d2';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // A sign board at each threshold naming the strip.
      const sign = project(cam, strip.x + strip.width / 2 + 9, 2.2, strip.zFrom + 12);
      if (sign && sign.dist < 700) {
        ctx.fillStyle = '#22262b';
        const wSign = clamp(sign.scale * 16, 10, 130);
        ctx.fillRect(sign.x - wSign / 2, sign.y - wSign * 0.3, wSign, wSign * 0.34);
        ctx.fillStyle = '#ffd75e';
        ctx.font = `bold ${Math.round(wSign * 0.2)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(strip.name, sign.x, sign.y - wSign * 0.05);
      }
    }
  }

  // The rings: thick hoops hanging in the air. The next one on the course
  // burns amber and pulses; one already flown fades to a ghost.
  function drawRings(cam, rings, nextRing, time) {
    const order = rings.map((ring, i) => ({ ring, i, p: project(cam, ring.x, ring.alt, ring.z) }))
      .filter((e) => e.p)
      .sort((a, b) => b.p.dist - a.p.dist);
    for (const { ring, i, p } of order) {
      const radiusPx = ring.radius * p.scale;
      if (radiusPx < 3 || radiusPx > W) continue;
      const isNext = i === nextRing;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
      ctx.lineWidth = clamp(radiusPx * 0.13, 1.5, 16);
      ctx.strokeStyle = ring.passed
        ? 'rgba(120,220,140,0.35)'
        : ring.missed
          ? 'rgba(150,150,150,0.30)'
          : isNext
            ? `rgba(255,176,32,${pulse})`
            : 'rgba(255,214,90,0.75)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, radiusPx * 0.03);
      ctx.strokeStyle = 'rgba(60,40,0,0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radiusPx + ctx.lineWidth * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The plane's shadow, projected on the ground under it: it shrinks and
  // sharpens as the plane descends, which is half of how a landing reads.
  function drawShadow(cam, plane) {
    const p = project(cam, plane.x, 0, plane.z);
    if (!p) return;
    const wShadow = clamp(1500 / (plane.alt + 26), 6, 52);
    ctx.fillStyle = `rgba(20,30,16,${clamp(0.42 - plane.alt * 0.0022, 0.05, 0.42)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, wShadow, wShadow * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The aeroplane from behind: a high-wing tourer drawn with a fuselage,
  // struts, tail feathers, a glasshouse canopy and a blurred propeller
  // disc. It banks and pitches as one rigid drawing, the way a chase
  // camera would see it.
  function drawPlane(plane, time) {
    const cx = W / 2;
    const cy = H * 0.66 + Math.sin(time * 2.1) * (plane.onGround ? 0 : 2.5);
    const size = 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.bank * 0.85);
    ctx.translate(0, plane.pitch * -130);

    // Tail feathers first (furthest from the chase camera).
    ctx.fillStyle = '#b8452e';
    ctx.beginPath(); // horizontal stabiliser
    ctx.moveTo(-58 * size, -6);
    ctx.lineTo(58 * size, -6);
    ctx.lineTo(48 * size, 6);
    ctx.lineTo(-48 * size, 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // fin and rudder
    ctx.moveTo(0, -52 * size);
    ctx.lineTo(13 * size, -8);
    ctx.lineTo(-13 * size, -8);
    ctx.closePath();
    ctx.fill();

    // Main wing, slightly dihedral, with aileron shading and nav lights.
    const wingGrad = ctx.createLinearGradient(0, -20, 0, 26);
    wingGrad.addColorStop(0, '#e8e2d4');
    wingGrad.addColorStop(1, '#c9c2b0');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-148 * size, 2);
    ctx.lineTo(-30 * size, -14);
    ctx.lineTo(30 * size, -14);
    ctx.lineTo(148 * size, 2);
    ctx.lineTo(140 * size, 15);
    ctx.lineTo(-140 * size, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#39d353';
    ctx.beginPath(); ctx.arc(-146 * size, 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5147';
    ctx.beginPath(); ctx.arc(146 * size, 8, 4, 0, Math.PI * 2); ctx.fill();

    // Fuselage: a rounded body tapering toward the tail (up-screen).
    const bodyGrad = ctx.createLinearGradient(-26, 0, 26, 0);
    bodyGrad.addColorStop(0, '#d8d2c2');
    bodyGrad.addColorStop(0.5, '#f4efe2');
    bodyGrad.addColorStop(1, '#cfc8b4');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-9 * size, -64 * size);
    ctx.quadraticCurveTo(-24 * size, -20, -21 * size, 22);
    ctx.quadraticCurveTo(-19 * size, 44, 0, 46);
    ctx.quadraticCurveTo(19 * size, 44, 21 * size, 22);
    ctx.quadraticCurveTo(24 * size, -20, 9 * size, -64 * size);
    ctx.closePath();
    ctx.fill();
    // Cheatline stripe down the body.
    ctx.fillStyle = '#b8452e';
    ctx.fillRect(-21 * size, 8, 42 * size, 6);

    // Canopy glasshouse with a pilot's headrest silhouette inside.
    const glassGrad = ctx.createLinearGradient(0, -6, 0, 34);
    glassGrad.addColorStop(0, '#9fd4e8');
    glassGrad.addColorStop(1, '#4a7d9c');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(0, 14, 15 * size, 21 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,40,50,0.8)';
    ctx.beginPath();
    ctx.arc(0, 24, 6.5 * size, 0, Math.PI * 2);
    ctx.fill();

    // Wing struts down to the fuselage.
    ctx.strokeStyle = '#8f887a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-13 * size, 30);
    ctx.lineTo(-52 * size, -2);
    ctx.moveTo(13 * size, 30);
    ctx.lineTo(52 * size, -2);
    ctx.stroke();

    // Fixed gear legs and wheels below the body.
    ctx.strokeStyle = '#3c3f45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10 * size, 40);
    ctx.lineTo(-17 * size, 58);
    ctx.moveTo(10 * size, 40);
    ctx.lineTo(17 * size, 58);
    ctx.stroke();
    ctx.fillStyle = '#22242a';
    ctx.beginPath();
    ctx.ellipse(-18 * size, 61, 6, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(18 * size, 61, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Propeller: a translucent disc with two blurred blade streaks whose
    // angle advances with the model's propPhase.
    const propR = 30 * size;
    ctx.fillStyle = 'rgba(220,220,215,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 52, propR, propR * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,44,0.55)';
    ctx.lineWidth = 3;
    const a = plane.propPhase;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * -propR, 52 + Math.sin(a) * propR * 0.3);
    ctx.lineTo(Math.cos(a) * propR, 52 - Math.sin(a) * propR * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  // One full frame of the world (the HUD is hud.js, drawn after this).
  function drawWorld(state) {
    const { plane, scenery, rings, nextRing, dusk, time } = state;
    const cam = cameraFor(plane);
    drawSky(cam, dusk, time);
    drawGround(cam, dusk);
    drawShadow(cam, plane);
    drawRunwayFurniture(cam, dusk);
    drawScenery(cam, scenery, dusk);
    drawRings(cam, rings, nextRing, time);
    drawPlane(plane, time);
    return cam;
  }

  return { drawWorld, project, cameraFor, width: W, height: H };
}
