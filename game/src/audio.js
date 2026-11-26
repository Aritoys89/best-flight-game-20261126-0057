// audio.js - every sound is synthesized with WebAudio at the moment it is
// needed: the engine's putter follows the throttle, the wind rises with
// speed, and the small events of a sortie (a ring chimed through, a stall
// horn, tyres on pavement, a prang) each get a short voice of their own.
// No audio files, nothing to load. The context is created lazily on the
// first user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false; // no audio device: the game simply flies silent
    }
    // Engine: a low sawtooth through a muffling filter, gain near zero
    // until the throttle opens.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 52;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
    engineOsc.start();
    // Wind: looped filtered noise whose level tracks airspeed.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter).connect(windGain).connect(ctx.destination);
    windSource.start();
    return true;
  }

  // Per-frame levels: call with the plane's throttle and speed.
  function setFlight(throttle, speed, running) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const engineLevel = running ? 0.015 + throttle * 0.075 : 0;
    engineGain.gain.setTargetAtTime(engineLevel, t, 0.08);
    engineOsc.frequency.setTargetAtTime(46 + throttle * 68 + speed * 0.25, t, 0.08);
    windGain.gain.setTargetAtTime(Math.min(0.06, speed * speed * 0.000012), t, 0.15);
  }

  function tone(freqFrom, freqTo, seconds, type, level, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + seconds);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function noiseBurst(seconds, level, freq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  return {
    unlock: ensure,
    setFlight,
    toggleMute() { muted = !muted; if (engineGain) engineGain.gain.value = 0; if (windGain) windGain.gain.value = 0; return muted; },
    ringChime() { tone(880, 880, 0.14, 'sine', 0.16); tone(1318, 1318, 0.22, 'sine', 0.14, 0.09); },
    ringMiss() { tone(220, 160, 0.25, 'triangle', 0.10); },
    stallHorn() { tone(392, 392, 0.12, 'square', 0.05); },
    touchdown() { noiseBurst(0.18, 0.20, 500); },
    scrape() { noiseBurst(0.4, 0.22, 900); },
    crash() { noiseBurst(0.9, 0.4, 300); tone(120, 40, 0.8, 'sawtooth', 0.2); },
    fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.24, 'triangle', 0.14, i * 0.13)); },
    click() { tone(660, 660, 0.05, 'sine', 0.08); },
  };
}
