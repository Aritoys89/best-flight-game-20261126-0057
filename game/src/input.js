// input.js - keyboard and mouse control. The stick is the arrow keys (or
// WASD), the throttle lever is W/S or PageUp/PageDown held to move it, and
// dragging the mouse works as a second stick for players who prefer it.
// Everything is exposed as one `control` object the flight model reads, so
// the model never has to know where a deflection came from.

export function createInput() {
  const keys = new Set();
  const control = {
    pitch: 0,       // -1 nose down .. 1 nose up
    bank: 0,        // -1 left .. 1 right
    throttle: 0,    // lever position 0..1, integrated here
    brake: false,
    pressed: new Set(),  // edge-triggered keys, drained by the game loop
  };
  let mouseStick = null; // { x, y } in -1..1 while the mouse is dragged

  const down = (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    control.pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  };
  const up = (event) => keys.delete(event.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());

  // Mouse as a stick: hold the button and steer from the centre of the
  // canvas; up on the screen pitches up, sideways drag banks the plane.
  const canvas = document.getElementById('sky');
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    mouseStick = { x: 0, y: 0, cx: event.clientX, cy: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!mouseStick) return;
    mouseStick.x = clampUnit((event.clientX - mouseStick.cx) / 130);
    mouseStick.y = clampUnit((mouseStick.cy - event.clientY) / 110);
  });
  const release = () => { mouseStick = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Called once per frame with the elapsed time; folds the held keys (and
  // the mouse stick, when it is active) into the shared control object.
  function update(dt) {
    let pitch = 0;
    let bank = 0;
    if (keys.has('ArrowUp') || keys.has('KeyI')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyK')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyJ')) bank -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyL')) bank += 1;
    if (mouseStick) {
      pitch = mouseStick.y;
      bank = mouseStick.x;
    }
    control.pitch = pitch;
    control.bank = bank;
    const leverRate = 0.55;
    if (keys.has('KeyW') || keys.has('PageUp')) control.throttle += leverRate * dt;
    if (keys.has('KeyS') || keys.has('PageDown')) control.throttle -= leverRate * dt;
    if (keys.has('Digit0')) control.throttle = 0;
    if (keys.has('Digit1')) control.throttle = 1;
    control.throttle = Math.min(1, Math.max(0, control.throttle));
    control.brake = keys.has('KeyB') || keys.has('Space');
  }

  // Read and clear the edge-triggered set (start, pause, restart keys).
  function takePressed() {
    const out = new Set(control.pressed);
    control.pressed.clear();
    return out;
  }

  return { control, update, takePressed };
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
