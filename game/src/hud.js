// hud.js - everything painted over the world: the compass tape across the
// top, the instrument panel along the bottom (airspeed, artificial
// horizon, altimeter, vertical speed, throttle and fuel), the mission
// banner and warning lights, and the full-screen cards for the title,
// the briefing and the end of a sortie. Instruments are drawn as flown
// gauges - needles, tapes and drums - not as bare numbers.

import { LIMITS, clamp } from './flight-model.js';

const MS_TO_KT = 1.944;
const M_TO_FT = 3.281;

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  function panel(x, y, w, h, alpha = 0.82) {
    ctx.fillStyle = `rgba(16,20,26,${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,200,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function label(text, x, y, size = 12, colour = '#9fc3e0', align = 'center') {
    ctx.fillStyle = colour;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  // A round gauge with ticks, a needle and a digital readout under it.
  function gauge(cx, cy, r, value, max, ticks, name, readout, dangerFrom = null) {
    ctx.fillStyle = '#10141a';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a7186'; ctx.lineWidth = 2; ctx.stroke();
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    for (let i = 0; i <= ticks; i++) {
      const a = a0 + (a1 - a0) * (i / ticks);
      const inner = r - 7;
      ctx.strokeStyle = dangerFrom !== null && i / ticks >= dangerFrom ? '#e0483e' : '#c8d6e2';
      ctx.lineWidth = i % 2 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = '#c8d6e2';
        ctx.font = `600 ${Math.round(r * 0.26)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(max * i / ticks)), cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16) + 4);
      }
    }
    const a = a0 + (a1 - a0) * clamp(value / max, 0, 1);
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    ctx.stroke();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill();
    label(name, cx, cy + r + 14, 11);
    label(readout, cx, cy + r + 30, 13, '#ffd75e');
  }

  // The artificial horizon: a ball that rolls and pitches with the plane,
  // sky over earth with a fixed aircraft symbol in the middle.
  function horizonBall(cx, cy, r, plane) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#10141a';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.translate(cx, cy);
    ctx.rotate(-plane.bank);
    const drop = clamp(plane.pitch * r * 2.4, -r, r);
    ctx.fillStyle = '#4a90c4';
    ctx.fillRect(-r, -r + drop - r, r * 2, r * 2);
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(-r, drop, r * 2, r * 2);
    ctx.strokeStyle = '#f2f2ea';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r, drop); ctx.lineTo(r, drop); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#5a7186'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Fixed symbol.
    ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy); ctx.lineTo(cx - r * 0.18, cy); ctx.lineTo(cx - r * 0.18, cy + 5);
    ctx.moveTo(cx + r * 0.55, cy); ctx.lineTo(cx + r * 0.18, cy); ctx.lineTo(cx + r * 0.18, cy + 5);
    ctx.stroke();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill();
    label('ATTITUDE', cx, cy + r + 14, 11);
  }

  // Compass tape across the top centre: cardinal letters and degree ticks
  // sliding under a fixed caret, with the heading in degrees beside it.
  function compassTape(plane) {
    const w = 340;
    const x = W / 2 - w / 2;
    panel(x, 12, w, 40, 0.7);
    const headingDeg = ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 6, 14, w - 12, 36); ctx.clip();
    const pxPerDeg = 3.4;
    for (let d = -60; d <= 60; d += 5) {
      const deg = Math.round((headingDeg + d) / 5) * 5;
      const sx = W / 2 + (deg - headingDeg) * pxPerDeg;
      if (sx < x + 8 || sx > x + w - 8) continue;
      const norm = ((deg % 360) + 360) % 360;
      ctx.fillStyle = '#c8d6e2';
      if (norm % 30 === 0) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[norm] ?? String(norm / 10).padStart(2, '0'), sx, 34);
        ctx.fillRect(sx - 0.5, 38, 1, 7);
      } else {
        ctx.fillRect(sx - 0.5, 40, 1, 5);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, 52); ctx.lineTo(W / 2 + 6, 52); ctx.lineTo(W / 2, 60);
    ctx.closePath(); ctx.fill();
    label(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, W / 2 + w / 2 + 34, 40, 16, '#ffd75e');
  }

  function draw(state) {
    const { plane, sortie, tank, time } = state;
    compassTape(plane);

    // Mission banner, top left: the sortie, its phase, rings and clock.
    panel(14, 12, 300, 86, 0.7);
    label(sortie.mission.name, 28, 36, 15, '#ffd75e', 'left');
    label(phaseLine(sortie), 28, 58, 13, '#e8eef4', 'left');
    const ringsLeft = sortie.rings.length - sortie.nextRing;
    label(
      sortie.phase === 'final' || sortie.phase === 'landed'
        ? 'All rings flown - land her gently'
        : `Rings: ${sortie.ringsFlown}/${sortie.rings.length}   Next ring ${ringsLeft > 0 ? ringsLeft : 0} to go`,
      28, 80, 13, '#9fc3e0', 'left');

    // Score and clock, top right.
    panel(W - 190, 12, 176, 62, 0.7);
    const mm = String(Math.floor(sortie.elapsed / 60)).padStart(2, '0');
    const ss = String(Math.floor(sortie.elapsed % 60)).padStart(2, '0');
    label(`TIME ${mm}:${ss}`, W - 102, 38, 14, '#e8eef4');
    label(`SCORE ${liveScore(sortie)}`, W - 102, 62, 14, '#ffd75e');

    // The instrument panel along the bottom.
    const dashY = H - 128;
    panel(14, dashY, W - 28, 114, 0.86);
    gauge(86, dashY + 46, 34, plane.speed * MS_TO_KT, 160, 8, 'AIRSPEED KT', String(Math.round(plane.speed * MS_TO_KT)));
    horizonBall(210, dashY + 46, 34, plane);
    gauge(334, dashY + 46, 34, plane.alt * M_TO_FT, 1500, 10, 'ALTITUDE FT', String(Math.round(plane.alt * M_TO_FT)), 0.93);
    // Vertical speed as a slim tape beside the altimeter.
    const vsKt = plane.verticalSpeed * M_TO_FT;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(392, dashY + 14, 26, 64);
    ctx.strokeStyle = '#5a7186'; ctx.strokeRect(392, dashY + 14, 26, 64);
    const vsY = dashY + 46 - clamp(vsKt / 2000, -1, 1) * 30;
    ctx.fillStyle = vsKt < -900 ? '#e0483e' : '#7dd87d';
    ctx.fillRect(394, Math.min(vsY, dashY + 76) - 2, 22, 4);
    label('VSI', 405, dashY + 96, 11);
    label(`${vsKt >= 0 ? '+' : ''}${Math.round(vsKt / 100) * 100}`, 405, dashY + 110, 11, '#ffd75e');

    // Throttle quadrant and fuel, right of the gauges.
    const quadX = 470;
    label('THROTTLE', quadX + 30, dashY + 22, 11);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(quadX, dashY + 28, 60, 12);
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(quadX, dashY + 28, 60 * plane.throttle, 12);
    ctx.strokeStyle = '#5a7186'; ctx.strokeRect(quadX, dashY + 28, 60, 12);
    label('FUEL', quadX + 30, dashY + 62, 11);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(quadX, dashY + 68, 60, 12);
    ctx.fillStyle = tank.fuel < 22 ? '#e0483e' : '#7dd87d';
    ctx.fillRect(quadX, dashY + 68, 60 * tank.fuel / LIMITS.fuelCapacity, 12);
    ctx.strokeStyle = '#5a7186'; ctx.strokeRect(quadX, dashY + 68, 60, 12);
    label(`${Math.round(tank.fuel)}%`, quadX + 88, dashY + 79, 13, '#ffd75e', 'left');

    // Damage readout and the warning lights.
    label(`AIRFRAME ${Math.max(0, Math.round(100 - plane.damage))}%`, 620, dashY + 40, 13,
      plane.damage > 55 ? '#e0483e' : '#9fc3e0', 'left');
    const warnings = [];
    if (plane.stalled) warnings.push('STALL');
    if (tank.fuel < 22 && tank.fuel > 0) warnings.push('LOW FUEL');
    if (plane.engineOut) warnings.push('ENGINE OUT');
    if (!plane.onGround && plane.alt < 130 && plane.verticalSpeed < -6) warnings.push('SINK RATE');
    warnings.forEach((text, i) => {
      const blink = Math.floor(time * 2.4) % 2 === 0;
      ctx.fillStyle = blink ? '#e0483e' : '#5c1712';
      ctx.beginPath(); ctx.roundRect(620 + i * 128, dashY + 56, 118, 30, 6); ctx.fill();
      label(text, 620 + i * 128 + 59, dashY + 76, 13, '#ffffff');
    });

    // A centre message when the sortie wants the pilot's eye: rotate,
    // engine out, ring results flashing by.
    if (state.flash && time - state.flash.at < 1.6) {
      label(state.flash.text, W / 2, 120, 26, state.flash.colour ?? '#ffd75e');
    }
    if (sortie.phase === 'ready') {
      label('W to open the throttle - pull up gently at 55 kt', W / 2, H - 170, 17, '#e8eef4');
    }
    if (sortie.phase === 'final' && !plane.onGround) {
      label(`Land at ${sortie.mission.landStrip === 0 ? 'HOME STRIP' : 'NORTH FIELD'} - aim for the near threshold`, W / 2, H - 170, 16, '#e8eef4');
    }
  }

  function phaseLine(sortie) {
    switch (sortie.phase) {
      case 'ready': return 'On the strip, ready to roll';
      case 'takeoff': return 'Climbing out - find the first ring';
      case 'course': return 'On course - thread the amber ring';
      case 'final': return 'Course complete - set up the landing';
      case 'landed': return 'Down and stopped';
      case 'ended': return sortie.endReason;
      default: return '';
    }
  }

  function liveScore(sortie) {
    return sortie.ringsFlown * 150 + sortie.centreBonus * 75;
  }

  // ---- Full-screen cards -------------------------------------------------

  function card(w, h) {
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - w / 2, H / 2 - h / 2, w, h, 0.95);
    return { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h };
  }

  function drawTitle(missions, selected) {
    const box = card(660, 480);
    label('SKY COURIER', W / 2, box.y + 74, 52, '#ffd75e');
    label('a valley flying game in three sorties', W / 2, box.y + 108, 16, '#9fc3e0');
    missions.forEach((mission, i) => {
      const y = box.y + 148 + i * 78;
      ctx.fillStyle = i === selected ? 'rgba(255,176,32,0.16)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.roundRect(box.x + 36, y - 26, box.w - 72, 66, 8); ctx.fill();
      if (i === selected) { ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2; ctx.stroke(); }
      label(`${i + 1}.  ${mission.name}`, box.x + 56, y, 19, '#ffffff', 'left');
      label(mission.brief, box.x + 56, y + 24, 12.5, '#c8d6e2', 'left');
    });
    label('Pick a sortie with 1-3 or the arrow keys, then press ENTER', W / 2, box.y + 408, 14, '#e8eef4');
    label('Fly: arrows or WASD stick · W/S throttle · drag mouse to steer · B brake · P pause · M mute', W / 2, box.y + 434, 12.5, '#9fc3e0');
  }

  function drawEnd(sortie, plane) {
    const box = card(560, 430);
    const won = sortie.phase === 'landed';
    label(won ? 'SORTIE COMPLETE' : 'SORTIE OVER', W / 2, box.y + 62, 34, won ? '#7dd87d' : '#e0483e');
    label(won ? `${sortie.mission.name} - brought her home` : sortie.endReason, W / 2, box.y + 94, 15, '#c8d6e2');
    const s = sortie.score;
    if (s) {
      const rows = [
        [`Rings flown (${sortie.ringsFlown} of ${sortie.rings.length}${sortie.centreBonus ? `, ${sortie.centreBonus} centred` : ''})`, s.ringPoints],
        [`Arrival${sortie.arrivalGrade ? ` - ${sortie.arrivalGrade}` : ''}`, s.arrivalPoints],
        ['Fuel remaining', s.fuelPoints],
        ['Time bonus', s.timePoints],
      ];
      rows.forEach(([text, points], i) => {
        const y = box.y + 140 + i * 36;
        label(text, box.x + 60, y, 15, '#e8eef4', 'left');
        label(String(points), box.x + box.w - 60, y, 15, '#ffd75e', 'right');
      });
      ctx.strokeStyle = 'rgba(140,170,200,0.4)';
      ctx.beginPath(); ctx.moveTo(box.x + 60, box.y + 268); ctx.lineTo(box.x + box.w - 60, box.y + 268); ctx.stroke();
      label('TOTAL', box.x + 60, box.y + 300, 18, '#ffffff', 'left');
      label(String(s.total), box.x + box.w - 60, box.y + 300, 20, '#ffd75e', 'right');
      label(`Rank: ${s.grade}`, W / 2, box.y + 336, 16, '#9fc3e0');
    }
    label('Press ENTER for the title screen - R flies this sortie again', W / 2, box.y + 388, 13.5, '#e8eef4');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    label('PAUSED', W / 2, H / 2 - 10, 40, '#ffffff');
    label('P to fly on - M toggles the sound', W / 2, H / 2 + 30, 15, '#c8d6e2');
  }

  return { draw, drawTitle, drawEnd, drawPaused };
}
