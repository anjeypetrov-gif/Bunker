// Звуки игры без аудиофайлов: всё синтезируется WebAudio.
// Включение хранится в localStorage; ambient запускается после первого касания (требование браузеров).

const KEY = 'bunker:sound';
let ctx: AudioContext | null = null;
let ambient: { stop: () => void } | null = null;
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
  const c = getCtx(); if (!c || !on) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  isOn: () => on,
  setOn(v: boolean) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
    if (v) sfx.startAmbient(); else sfx.stopAmbient();
  },
  /** Ваш ход: двойной сигнал + вибрация. */
  turn() { tone(880, 0.18, 'sine', 0.12); tone(1175, 0.22, 'sine', 0.12, 0.2); sfx.vibrate([180, 90, 180]); },
  tick() { tone(1100, 0.07, 'square', 0.05); },
  /** Начало голосования: тревожная сирена. */
  siren() { tone(520, 0.45, 'sawtooth', 0.06, 0, 880); tone(880, 0.45, 'sawtooth', 0.06, 0.45, 520); tone(520, 0.45, 'sawtooth', 0.06, 0.9, 880); sfx.vibrate([300, 120, 300]); },
  /** Вердикт изгнания: низкий гонг. */
  gong() {
    tone(110, 2.6, 'sine', 0.22); tone(220, 2.2, 'sine', 0.1); tone(330, 1.6, 'triangle', 0.05);
    sfx.vibrate([500]);
  },
  /** Раскрытие очередного голоса. */
  vote() { tone(300, 0.16, 'triangle', 0.1); },
  vibrate(pattern: number | number[]) {
    try { if (on && navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ }
  },
  startAmbient() {
    if (!on || ambient) return;
    const c = getCtx(); if (!c) return;
    const master = c.createGain(); master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(0.02, c.currentTime + 3);
    master.connect(c.destination);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 82.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.12;
    const lg = c.createGain(); lg.gain.value = 0.008;
    lfo.connect(lg); lg.connect(master.gain);
    o1.connect(master); o2.connect(master);
    o1.start(); o2.start(); lfo.start();
    ambient = {
      stop: () => {
        try {
          master.gain.cancelScheduledValues(c.currentTime);
          master.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
          setTimeout(() => { try { o1.stop(); o2.stop(); lfo.stop(); } catch { /* ignore */ } }, 1200);
        } catch { /* ignore */ }
      }
    };
  },
  stopAmbient() { ambient?.stop(); ambient = null; },
};
