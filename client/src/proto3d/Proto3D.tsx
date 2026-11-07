import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getCardArt } from '../data/cardArt';
import {
  PROFESSIONS, BAGGAGE, INCIDENTS, THEMES, BOT_NAMES, BOT_SAY, cardType,
  type IncidentType, type IncidentDef, type Theme
} from './data';
import { ROOMS, roomById, roomAt, collide, findPath, pathLength, MAP_X0, MAP_Z0, COLS, ROWS, CW, CD, type Pt } from './layout';
import { buildWorld, type World } from './world';
import { makeHuman, animate, makeBubble, say, tickBubble, makeLabel, type Human, type Bubble } from './humans';

/**
 * Прототип «Бункер 3D · альфа»: большой бункер из 9 отсеков, аварии из сценариев игры,
 * боты, которые замечают проблемы и идут чинить, и командная работа.
 * Локальный (без сети): проверяем ощущения и механику.
 */

const GAME_LEN = 150;
const SPEED = 4.8;
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface Actor {
  id: string; name: string; prof: string; bag: string[]; color: number;
  h: Human; bubble: Bubble; exp: Partial<Record<IncidentType, number>>;
  state: 'idle' | 'goto' | 'work' | 'panic'; path: Pt[]; target: number | null; wanderT: number; isBot: boolean;
  prev: Pt; workSay: number;
}

interface Emitter { pts: THREE.Points; pos: Float32Array; vel: Float32Array; life: Float32Array; cfg: PCfg }
interface Inc {
  id: number; def: IncidentDef; roomId: string; progress: number; age: number;
  workers: string[]; beacon: THREE.Mesh; ring: THREE.Mesh; icon: THREE.Sprite; em: Emitter; spawnT: number;
}
interface PCfg { g: number; up: [number, number]; spread: number; y: number; life: number; size: number; flat?: boolean; ring?: boolean }

const PCFG: Record<IncidentType, PCfg> = {
  leak: { g: 9, up: [0.5, 1.7], spread: 1.2, y: 1.6, life: 0.9, size: 0.14 },
  power: { g: 6, up: [1.5, 3.5], spread: 1.6, y: 1.2, life: 0.5, size: 0.13 },
  vent: { g: 1.5, up: [0, 0], spread: 0.7, y: 2.6, life: 1.3, size: 0.2 },
  mold: { g: -0.3, up: [0.2, 0.6], spread: 0.6, y: 0.5, life: 1.6, size: 0.17 },
  rats: { g: 0, up: [0, 0], spread: 3, y: 0.15, life: 0.9, size: 0.22, flat: true },
  fever: { g: -0.5, up: [0.3, 0.8], spread: 0.4, y: 0.9, life: 1.4, size: 0.15 },
  radio: { g: 0, up: [0.1, 0.1], spread: 2.4, y: 2.3, life: 1.0, size: 0.13, ring: true },
  panic: { g: -0.2, up: [0.5, 1.2], spread: 1.0, y: 1.4, life: 1.0, size: 0.16 },
  theft: { g: -0.2, up: [0.3, 0.9], spread: 0.6, y: 1.3, life: 1.2, size: 0.14 }
};
const NP = 48;

const skillOf = (a: { prof: string; bag: string[]; exp: Partial<Record<IncidentType, number>> }, d: IncidentDef) => {
  const pro = d.pros.includes(a.prof) ? 1 : 0;
  const tool = a.bag.some(b => d.tools.includes(b)) ? 1 : 0;
  return { pro, tool, cap: 1 + 1.3 * pro + 0.9 * tool + (a.exp[d.type] || 0) };
};

interface HudInc { id: number; type: IncidentType; title: string; icon: string; progress: number; workers: number; critical: boolean; room: string }
interface HudPt { id: string; x: number; z: number; color: number; me: boolean }
interface HudBot { id: string; name: string; prof: string; state: string; color: number; exp: number }
interface Hud {
  integrity: number; time: number; score: number; fixed: number; msg: string;
  incs: HudInc[]; pts: HudPt[]; bots: HudBot[]; helpCd: number;
  nearId: number | null; nearVerb: string; nearProgress: number; nearBoost: string; working: boolean;
}
const HUD0: Hud = { integrity: 100, time: 0, score: 0, fixed: 0, msg: '', incs: [], pts: [], bots: [], helpCd: 0, nearId: null, nearVerb: '', nearProgress: 0, nearBoost: '', working: false };

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const Proto3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'setup' | 'play' | 'end'>('setup');
  const [themeId, setThemeId] = useState('titan');
  const [prof, setProf] = useState('Механик-дизелист');
  const [bag, setBag] = useState<string[]>(['Топор и мультитул']);
  const [hud, setHud] = useState<Hud>(HUD0);
  const [result, setResult] = useState<{ win: boolean; fixed: number; integrity: number; score: number } | null>(null);
  const holdRef = useRef(false);
  const joyRef = useRef({ x: 0, y: 0 });
  const joyBase = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const api = useRef<{ start: (o: { themeId: string; prof: string; bag: string[] }) => void; preview: (id: string) => void; call: () => void }>({ start: () => {}, preview: () => {}, call: () => {} });
  const setPhaseRef = useRef(setPhase);
  setPhaseRef.current = setPhase;

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x07090d);
    mount.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    let camScale = 1;
    const cam = { yaw: 0, pitch: 1.12, dist: 16 };
    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      camScale = Math.max(1, 1.15 / camera.aspect);
    };
    resize();
    window.addEventListener('resize', resize);

    // ---------- Мир ----------
    let theme: Theme = THEMES[0];
    let world: World = buildWorld(scene, theme);
    const lamp = new THREE.PointLight(theme.lamp, 16, 20, 1.5);
    scene.add(lamp);
    const applyTheme = (id: string) => {
      theme = THEMES.find(t => t.id === id) || THEMES[0];
      world.dispose();
      world = buildWorld(scene, theme);
      lamp.color.setHex(theme.lamp);
      renderer.setClearColor(theme.fog);
    };

    // ---------- Люди ----------
    const mkActor = (id: string, name: string, shirt: number, pants: number, hair: number, skin: number, isBot: boolean): Actor => {
      const h = makeHuman(scene, shirt, pants, hair, skin);
      const bubble = makeBubble(h.group, 2.9);
      return { id, name, prof: '', bag: [], color: shirt, h, bubble, exp: {}, state: 'idle', path: [], target: null, wanderT: 1, isBot, prev: { x: 0, z: 0 }, workSay: 0 };
    };
    const me = mkActor('me', 'Вы', 0xe8a33d, 0x30363f, 0x3a2a1c, 0xd9b89a, false);
    const bots: Actor[] = [
      mkActor('b0', BOT_NAMES[0], 0x4d78a6, 0x2b2f36, 0xc9b27a, 0xc99c7c, true),
      mkActor('b1', BOT_NAMES[1], 0xb85a7a, 0x2c2a33, 0x1b1b1b, 0xe2c2a2, true),
      mkActor('b2', BOT_NAMES[2], 0x6f8f5e, 0x3a3326, 0x6b3b1e, 0xd9b89a, true),
      mkActor('b3', BOT_NAMES[3], 0x8a6fb0, 0x2b2f36, 0xd8c7a0, 0xe8cfb2, true)
    ];
    const all = [me, ...bots];
    const hub = roomById('hub');
    const place = (a: Actor, x: number, z: number) => { a.h.group.position.set(x, 0, z); a.prev = { x, z }; a.path = []; a.state = 'idle'; a.target = null; a.wanderT = Math.random() * 3; };
    const spreadBots = () => bots.forEach((b, i) => { const r = [roomById('storage'), roomById('medical'), roomById('hub'), roomById('vent')][i]; place(b, r.cx + (Math.random() - 0.5) * 4, r.cz + 1.5 + (Math.random() - 0.5) * 2); });
    place(me, hub.cx, hub.cz + 1.5);
    spreadBots();

    const giveBotLoadouts = (playerProf: string) => {
      const pool = PROFESSIONS.filter(p => p !== playerProf).sort(() => Math.random() - 0.5);
      bots.forEach((b, i) => {
        b.prof = pool[i];
        const related = Object.values(INCIDENTS).filter(d => d.pros.includes(b.prof)).flatMap(d => d.tools);
        const first = related.length && Math.random() < 0.75 ? rnd(related) : rnd(BAGGAGE);
        const second = rnd(BAGGAGE);
        b.bag = Array.from(new Set([first, second]));
        b.exp = {};
      });
    };
    giveBotLoadouts('');

    // ---------- Состояние ----------
    const S = {
      running: false, t: 0, clock: 0, integrity: 100, score: 0, fixed: 0, nextSpawn: 3, nextId: 1,
      msg: 'Выбери бункер и карты, чтобы начать', helpCd: 0, assignT: 0, msgT: 0, incs: [] as Inc[], hudT: 0
    };
    const setMsg = (m: string, ttl = 4) => { S.msg = m; S.msgT = ttl; };

    // ---------- Аварии ----------
    const beaconGeo = new THREE.CylinderGeometry(0.22, 0.22, 5, 10, 1, true);
    const ringGeo = new THREE.RingGeometry(0.9, 1.15, 36);
    const spawnIncident = () => {
      const active = new Set(S.incs.map(i => i.def.type));
      const cand = (Object.keys(INCIDENTS) as IncidentType[]).filter(t => !active.has(t));
      if (!cand.length) return;
      const w = cand.map(t => theme.weights[t] ?? 1);
      let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = cand[0];
      for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) { pick = cand[i]; break; } }
      const def = INCIDENTS[pick];
      const room = roomById(def.room);
      const beacon = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.set(room.station.x, 2.5, room.station.z);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(room.station.x, 0.06, room.station.z);
      const icon = makeLabel(def.icon, 1.3, 1.3, '120px sans-serif', '#ffffff', '');
      icon.position.set(room.station.x, 3.2, room.station.z);
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(NP * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: def.color, size: PCFG[pick].size, transparent: true, opacity: 0.9, depthWrite: false }));
      pts.frustumCulled = false;
      scene.add(beacon, ring, icon, pts);
      const em: Emitter = { pts, pos, vel: new Float32Array(NP * 3), life: new Float32Array(NP), cfg: PCFG[pick] };
      S.incs.push({ id: S.nextId++, def, roomId: def.room, progress: 0, age: 0, workers: [], beacon, ring, icon, em, spawnT: S.clock });
      setMsg(`⚠ ${def.title}!`, 5);
      // боты замечают проблему
      const noticer = bots.filter(b => b.state !== 'work').sort(() => Math.random() - 0.5)[0] || rnd(bots);
      say(noticer.bubble, def.alert, 3);
    };
    const removeIncident = (inc: Inc) => {
      scene.remove(inc.beacon, inc.ring, inc.icon, inc.em.pts);
      (inc.beacon.material as THREE.Material).dispose(); (inc.ring.material as THREE.Material).dispose();
      inc.icon.material.map?.dispose(); inc.icon.material.dispose();
      inc.em.pts.geometry.dispose(); (inc.em.pts.material as THREE.Material).dispose();
      S.incs = S.incs.filter(i => i !== inc);
    };
    const spot = (inc: Inc, k: number): Pt => {
      const st = roomById(inc.roomId).station;
      const ang = k * 2.2 + 0.6;
      return { x: st.x + Math.cos(ang) * 1.25, z: st.z + Math.sin(ang) * 1.25 };
    };
    const sendBot = (b: Actor, inc: Inc, k: number) => {
      b.state = 'goto'; b.target = inc.id;
      b.path = findPath({ x: b.h.group.position.x, z: b.h.group.position.z }, spot(inc, k));
    };
    const botsOn = (inc: Inc) => bots.filter(b => b.target === inc.id);

    const assignBots = () => {
      for (const inc of S.incs) {
        const need = inc.age > 24 ? 3 : inc.age > 14 ? 2 : 1;
        let cur = botsOn(inc).length;
        while (cur < need) {
          const idle = bots.filter(b => b.state === 'idle' || b.state === 'panic');
          if (!idle.length) break;
          const st = roomById(inc.roomId).station;
          let best: Actor | null = null, bestScore = -1, bestSkilled = false;
          for (const b of idle) {
            const sk = skillOf(b, inc.def);
            const d = pathLength({ x: b.h.group.position.x, z: b.h.group.position.z }, findPath({ x: b.h.group.position.x, z: b.h.group.position.z }, st));
            const sc = sk.cap / (1 + d / 10);
            if (sc > bestScore) { best = b; bestScore = sc; bestSkilled = sk.pro + sk.tool > 0; }
          }
          if (!best) break;
          // «не спец» идёт, только если проблема висит давно и больше никого нет
          if (!bestSkilled && inc.age < 4) break;
          sendBot(best, inc, cur + 1);
          say(best.bubble, bestSkilled ? rnd(BOT_SAY.claim) : rnd(BOT_SAY.noskill), 2.6);
          cur++;
        }
      }
    };

    const callHelp = () => {
      if (!S.running || S.helpCd > 0) return;
      if (!S.incs.length) { setMsg('Пока всё спокойно — звать некого'); return; }
      const p = me.h.group.position;
      const inc = [...S.incs].sort((a, b) => {
        const sa = roomById(a.roomId).station, sb = roomById(b.roomId).station;
        return Math.hypot(sa.x - p.x, sa.z - p.z) - Math.hypot(sb.x - p.x, sb.z - p.z);
      })[0];
      const free = bots.filter(b => b.state === 'idle' || b.state === 'panic');
      if (!free.length) { setMsg('Все заняты — держись!'); S.helpCd = 3; return; }
      free.slice(0, 3).forEach((b, i) => { sendBot(b, inc, botsOn(inc).length + i + 1); say(b.bubble, rnd(BOT_SAY.thanks), 2.4); });
      setMsg(`📢 Позвал помощь: ${inc.def.title}`);
      S.helpCd = 12;
    };

    const resetSim = () => {
      [...S.incs].forEach(removeIncident);
      S.t = 0; S.integrity = 100; S.score = 0; S.fixed = 0; S.nextSpawn = 3; S.helpCd = 0; S.assignT = 0;
      all.forEach(a => { a.bubble.sp.visible = false; a.bubble.text = ''; });
    };

    const start = (o: { themeId: string; prof: string; bag: string[] }) => {
      if (theme.id !== o.themeId) applyTheme(o.themeId);
      resetSim();
      me.prof = o.prof; me.bag = o.bag; me.exp = {};
      giveBotLoadouts(o.prof);
      place(me, hub.cx, hub.cz + 1.5); spreadBots();
      S.running = true;
      setMsg('Бункер ожил. Аварии начнутся с минуты на минуту…', 5);
      setPhaseRef.current('play');
    };
    api.current = {
      start, call: callHelp,
      preview: id => { if (!S.running) applyTheme(id); }
    };

    const finish = (win: boolean) => {
      S.running = false;
      const score = Math.round(S.fixed * 100 + S.integrity * 5 + (win ? 200 : 0));
      setResult({ win, fixed: S.fixed, integrity: Math.round(S.integrity), score });
      setPhaseRef.current('end');
      holdRef.current = false;
    };

    // ---------- Ввод ----------
    let drag: { x: number; y: number; id: number } | null = null;
    const pd = (e: PointerEvent) => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dom.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      cam.yaw -= (e.clientX - drag.x) * 0.008;
      cam.pitch = Math.max(0.4, Math.min(1.45, cam.pitch + (e.clientY - drag.y) * 0.006));
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const pu = () => { drag = null; };
    const wh = (e: WheelEvent) => { e.preventDefault(); cam.dist = Math.max(6, Math.min(26, cam.dist + e.deltaY * 0.012)); };
    const cm = (e: Event) => e.preventDefault();
    dom.addEventListener('pointerdown', pd); dom.addEventListener('pointermove', pm);
    dom.addEventListener('pointerup', pu); dom.addEventListener('pointercancel', pu);
    dom.addEventListener('wheel', wh, { passive: false }); dom.addEventListener('contextmenu', cm);
    document.addEventListener('contextmenu', cm);
    dom.style.cursor = 'grab';
    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      keys[e.code] = true;
      if (e.code === 'KeyE') holdRef.current = true;
      if (e.code === 'KeyQ' && !e.repeat) callHelp();
    };
    const ku = (e: KeyboardEvent) => { keys[e.code] = false; if (e.code === 'KeyE') holdRef.current = false; };
    const blur = () => { for (const k of Object.keys(keys)) keys[k] = false; holdRef.current = false; drag = null; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);

    // ---------- Цикл ----------
    const clock = new THREE.Clock();
    let raf = 0;
    const tmp = new THREE.Vector3();
    let darkness = 0;

    const stepBot = (b: Actor, dt: number) => {
      const g = b.h.group;
      tickBubble(b.bubble, dt);
      const speed = b.state === 'panic' ? 5.6 : 3.9;
      let moved = 0;
      if (b.path.length) {
        const p = b.path[0];
        const dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz);
        if (d < 0.22) b.path.shift();
        else {
          const st = Math.min(d, speed * dt);
          g.position.x += (dx / d) * st; g.position.z += (dz / d) * st;
          const tr = Math.atan2(dx, dz);
          let dr = tr - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          g.rotation.y += dr * Math.min(1, dt * 12);
          moved = st;
        }
      } else if (b.state === 'goto') {
        b.state = 'work'; b.workSay = 1 + Math.random() * 3;
      } else if (b.state === 'idle' || b.state === 'panic') {
        b.wanderT -= dt;
        if (b.wanderT <= 0) {
          const r = b.state === 'panic' ? rnd(ROOMS) : (Math.random() < 0.5 ? hub : rnd(ROOMS));
          b.path = findPath({ x: g.position.x, z: g.position.z }, { x: r.cx + (Math.random() - 0.5) * 7, z: r.cz + (Math.random() - 0.5) * 4 });
          b.wanderT = b.state === 'panic' ? 1 + Math.random() * 2 : 5 + Math.random() * 7;
          if (b.state === 'panic' && Math.random() < 0.6) say(b.bubble, rnd(BOT_SAY.panic), 2);
        }
      }
      const working = b.state === 'work' && !b.path.length;
      if (working) {
        const inc = S.incs.find(i => i.id === b.target);
        if (inc) {
          const st = roomById(inc.roomId).station;
          g.rotation.y = Math.atan2(st.x - g.position.x, st.z - g.position.z);
          b.workSay -= dt;
          if (b.workSay <= 0) { say(b.bubble, rnd(BOT_SAY.work), 1.6); b.workSay = 5 + Math.random() * 4; }
        }
      }
      animate(b.h, moved / Math.max(dt, 0.001) * 0.0165, S.clock, working, b.state === 'panic');
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      S.clock += dt;
      const run = S.running;
      if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0 && run) S.msg = ''; }
      S.helpCd = Math.max(0, S.helpCd - dt);

      // Игрок
      const mp = me.h.group;
      tickBubble(me.bubble, dt);
      let ix = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
      let iz = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
      ix += joyRef.current.x; iz += joyRef.current.y;
      const len = Math.hypot(ix, iz);
      let moveSpeed = 0;
      if (len > 0.08 && run) {
        const k = Math.min(1, len) / len;
        const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
        const wx = (ix * cy + iz * sy) * k, wz = (-ix * sy + iz * cy) * k;
        const c = collide(mp.position.x + wx * SPEED * dt, mp.position.z + wz * SPEED * dt, 0.45);
        mp.position.x = c.x; mp.position.z = c.z;
        let dr = Math.atan2(wx, wz) - mp.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        mp.rotation.y += dr * Math.min(1, dt * 12);
        moveSpeed = Math.min(1, len) * SPEED * dt;
      }

      // Ближайшая авария рядом с игроком
      let near: Inc | null = null;
      for (const inc of S.incs) {
        const st = roomById(inc.roomId).station;
        if (Math.hypot(st.x - mp.position.x, st.z - mp.position.z) < 2.8) { near = inc; break; }
      }
      const playerWorking = run && !!near && holdRef.current;

      // Логика аварий
      if (run) {
        S.t += dt;
        const maxInc = S.t > 100 ? 5 : S.t > 50 ? 4 : 3;
        if (S.incs.length < maxInc && S.t >= S.nextSpawn) {
          spawnIncident();
          S.nextSpawn = S.t + (6 + Math.random() * 4) * Math.max(0.45, 1 - S.t / 250);
        }
        let drain = 0;
        for (const inc of [...S.incs]) {
          inc.age += dt;
          const wk: string[] = [];
          let rate = 0;
          for (const b of bots) if (b.target === inc.id && b.state === 'work' && !b.path.length) { wk.push(b.id); rate += skillOf(b, inc.def).cap * 0.6; }
          if (playerWorking && near === inc) { wk.push('me'); rate += skillOf(me, inc.def).cap; }
          inc.workers = wk;
          inc.progress = Math.min(1, inc.progress + (rate / 10) * dt);
          drain += inc.def.severity * (1 + inc.age / 40);
          if (inc.progress >= 1) {
            S.fixed++; S.score += 100; S.integrity = Math.min(100, S.integrity + 4);
            const doers = all.filter(a => wk.includes(a.id));
            doers.forEach(a => { a.exp[inc.def.type] = Math.min(0.6, (a.exp[inc.def.type] || 0) + 0.12); });
            const helper = doers.find(a => a.isBot);
            if (helper) say(helper.bubble, rnd(BOT_SAY.done), 2.2);
            if (wk.includes('me')) setMsg(`✔ ${inc.def.title} устранена! Ты молодец`, 4); else setMsg(`✔ ${inc.def.title} устранена командой`, 4);
            bots.filter(b => b.target === inc.id).forEach(b => { b.state = 'idle'; b.target = null; b.path = []; b.wanderT = 1 + Math.random() * 2; });
            removeIncident(inc);
          }
        }
        S.integrity = Math.max(0, Math.min(100, S.integrity - drain * dt + (S.incs.length ? 0 : 0.15 * dt)));
        S.assignT -= dt;
        if (S.assignT <= 0) { assignBots(); S.assignT = 0.5; }
        // паника у свободных ботов при низкой целостности
        bots.forEach(b => {
          if (b.state === 'idle' && S.integrity < 35) { b.state = 'panic'; b.wanderT = 0; }
          else if (b.state === 'panic' && S.integrity > 45) { b.state = 'idle'; b.wanderT = 1; }
        });
        if (S.integrity <= 0) { setMsg('Бункер потерян…', 8); finish(false); }
        else if (S.t >= GAME_LEN) { setMsg('Вы пережили смену!', 8); finish(true); }
      } else {
        // вне игры — просто живая сцена
        bots.forEach(b => { if (b.state === 'panic') b.state = 'idle'; });
      }

      // Боты
      bots.forEach(b => stepBot(b, dt));

      // Анимация игрока
      me.h.wrench.visible = me.bag.some(b => b.includes('мультитул') || b.includes('Лопата'));
      if (playerWorking && near) {
        const st = roomById(near.roomId).station;
        mp.rotation.y = Math.atan2(st.x - mp.position.x, st.z - mp.position.z);
      }
      animate(me.h, moveSpeed, S.clock, playerWorking);

      // Визуал аварий
      const powerOut = S.incs.some(i => i.def.type === 'power');
      darkness += ((powerOut ? 1 : 0) - darkness) * Math.min(1, dt * 3);
      world.hemi.intensity = 0.95 - 0.6 * darkness;
      world.sun.intensity = 0.75 - 0.55 * darkness;
      lamp.position.set(mp.position.x, 4.2, mp.position.z);
      lamp.intensity = 16 + darkness * 14 + (powerOut ? Math.sin(S.clock * 22) * 4 : Math.sin(S.clock * 3) * 1.5);
      for (const inc of S.incs) {
        const pulse = 1 + Math.sin(S.clock * 7) * 0.12;
        inc.ring.scale.setScalar(pulse);
        (inc.beacon.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.14 * Math.sin(S.clock * 5) + inc.age / 120;
        inc.icon.position.y = 3.2 + Math.sin(S.clock * 3) * 0.15;
        const st = roomById(inc.roomId).station;
        const em = inc.em, c = em.cfg;
        for (let i = 0; i < NP; i++) {
          if (em.life[i] <= 0) {
            em.life[i] = c.life * (0.5 + Math.random() * 0.7);
            const a = Math.random() * Math.PI * 2, sp = Math.random() * c.spread;
            em.pos[i * 3] = st.x + (c.flat ? (Math.random() - 0.5) * 3.2 : (Math.random() - 0.5) * 0.3);
            em.pos[i * 3 + 1] = c.y;
            em.pos[i * 3 + 2] = st.z + (c.flat ? (Math.random() - 0.5) * 2.4 : (Math.random() - 0.5) * 0.3) + (inc.def.type === 'leak' ? 0.3 : 0);
            const dir = c.ring ? a : a;
            em.vel[i * 3] = Math.cos(dir) * sp * (c.ring ? 1.4 : 1);
            em.vel[i * 3 + 1] = c.up[0] + Math.random() * (c.up[1] - c.up[0]);
            em.vel[i * 3 + 2] = Math.sin(dir) * sp * (c.ring ? 1.4 : 1) + (inc.def.type === 'leak' ? 1.2 : 0);
          }
          em.life[i] -= dt;
          em.vel[i * 3 + 1] -= c.g * dt;
          em.pos[i * 3] += em.vel[i * 3] * dt;
          em.pos[i * 3 + 1] += em.vel[i * 3 + 1] * dt;
          em.pos[i * 3 + 2] += em.vel[i * 3 + 2] * dt;
          if (em.pos[i * 3 + 1] < 0.05 && c.g > 0) em.life[i] = 0;
        }
        (em.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      // Камера
      const d = cam.dist * camScale, cp = Math.cos(cam.pitch);
      tmp.set(mp.position.x + Math.sin(cam.yaw) * cp * d, Math.sin(cam.pitch) * d + 0.8, mp.position.z + Math.cos(cam.yaw) * cp * d);
      camera.position.lerp(tmp, 1 - Math.pow(0.0005, dt));
      camera.lookAt(mp.position.x, 1.0, mp.position.z);
      renderer.render(scene, camera);

      // HUD
      S.hudT += dt;
      if (S.hudT > 0.1) {
        S.hudT = 0;
        const nd = near ? near.def : null;
        const sk = nd ? skillOf(me, nd) : null;
        setHud({
          integrity: S.integrity, time: Math.max(0, GAME_LEN - S.t), score: S.score, fixed: S.fixed, msg: S.msg,
          incs: S.incs.map(i => ({ id: i.id, type: i.def.type, title: i.def.title, icon: i.def.icon, progress: i.progress, workers: i.workers.length, critical: i.age > 14, room: roomById(i.roomId).name })),
          pts: all.map(a => ({ id: a.id, x: a.h.group.position.x, z: a.h.group.position.z, color: a.color, me: a.id === 'me' })),
          bots: bots.map(b => ({ id: b.id, name: b.name, prof: b.prof, state: b.state, color: b.color, exp: Object.values(b.exp).reduce((x, y) => x + (y || 0), 0) })),
          helpCd: S.helpCd, nearId: near ? near.id : null, nearVerb: nd ? nd.verb : '', nearProgress: near ? near.progress : 0,
          nearBoost: sk ? (sk.pro && sk.tool ? 'Профессия и инструмент: быстро' : sk.pro ? 'Профессия подходит' : sk.tool ? 'Инструмент подходит' : 'Нет навыков — будет долго') : '',
          working: playerWorking
        });
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      dom.removeEventListener('pointerdown', pd); dom.removeEventListener('pointermove', pm);
      dom.removeEventListener('pointerup', pu); dom.removeEventListener('pointercancel', pu);
      dom.removeEventListener('wheel', wh); dom.removeEventListener('contextmenu', cm);
      document.removeEventListener('contextmenu', cm);
      renderer.dispose();
      mount.removeChild(dom);
    };
  }, []);

  // ---------- Джойстик ----------
  const joyMove = (e: React.PointerEvent) => {
    const base = joyBase.current; if (!base) return;
    const r = base.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joyRef.current = { x: dx, y: dy }; setKnob({ x: dx, y: dy });
  };
  const joyEnd = () => { joyRef.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }); };

  const toggleBag = (b: string) => setBag(cur => cur.includes(b) ? cur.filter(x => x !== b) : cur.length >= 2 ? [cur[1], b] : [...cur, b]);
  const helps = Object.values(INCIDENTS).filter(d => d.pros.includes(prof) || d.tools.some(t => bag.includes(t)));
  const pct = Math.round(hud.integrity);
  const mm = 3.4;
  const critical = pct < 35;

  const CardChip: React.FC<{ type: 'profession' | 'baggage'; title: string; on: boolean; onClick: () => void }> = ({ type, title, on, onClick }) => {
    const art = getCardArt(cardType(type), title);
    return (
      <button onClick={onClick} className={`flex items-center gap-2 text-left p-1.5 rounded border cursor-pointer ${on ? 'border-amber-500 bg-amber-500/15' : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'}`}>
        {art ? <img src={art} alt="" className="w-9 h-9 rounded object-cover shrink-0" draggable={false} /> : <div className="w-9 h-9 rounded bg-slate-800 shrink-0" />}
        <span className={`text-[11px] leading-tight ${on ? 'text-amber-200 font-bold' : 'text-slate-300'}`}>{title}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-[#07090d] text-slate-100 font-mono select-none touch-none overflow-hidden"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      onContextMenu={e => e.preventDefault()}
      onDragStart={e => e.preventDefault()}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {phase === 'play' && (
        <>
          {/* Верх слева */}
          <div className="absolute top-0 left-0 p-2 flex flex-col gap-1.5 pointer-events-none" style={{ maxWidth: 'calc(100% - 158px)', width: 330 }}>
            <div className="flex items-center gap-2 pointer-events-auto">
              <a href="/" className="px-2 py-1 text-[11px] whitespace-nowrap border border-slate-600 bg-slate-900/80 rounded hover:border-amber-500">← В игру</a>
              <span className="text-[11px] text-emerald-400 whitespace-nowrap">✔ {hud.fixed}</span>
              <span className={`text-[11px] ml-auto whitespace-nowrap ${hud.time < 20 ? 'text-red-400' : 'text-slate-300'}`}>⏱ {Math.floor(hud.time / 60)}:{String(Math.floor(hud.time % 60)).padStart(2, '0')}</span>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-0.5"><span>ЦЕЛОСТНОСТЬ БУНКЕРА</span><span>{pct}%</span></div>
              <div className="h-2.5 bg-slate-800 border border-slate-600 rounded overflow-hidden">
                <div className={`h-full transition-[width] duration-100 ${critical ? 'bg-red-500' : pct < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            {hud.msg && <div className="text-[11px] px-2 py-1 rounded bg-slate-900/90 border border-amber-500/60 text-amber-200 w-fit max-w-full">{hud.msg}</div>}
            <div className="flex flex-col gap-1">
              {hud.incs.map(i => (
                <div key={i.id} className={`px-2 py-1 rounded border text-[10px] leading-tight bg-slate-900/85 ${i.critical ? 'border-red-500' : 'border-slate-600'}`}>
                  <div className="flex items-center gap-1.5">
                    <span>{i.icon}</span><span className="font-bold text-slate-100 truncate">{i.title}</span>
                    <span className="ml-auto text-slate-400 whitespace-nowrap">👥{i.workers}</span>
                  </div>
                  <div className="text-slate-400">{i.room}</div>
                  <div className="h-1.5 mt-0.5 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round(i.progress * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Миникарта */}
          <div className="absolute top-2 right-2 pointer-events-none">
            <svg width={COLS * CW * mm} height={ROWS * CD * mm} viewBox={`${MAP_X0} ${MAP_Z0} ${COLS * CW} ${ROWS * CD}`} className="rounded border border-slate-600 bg-slate-950/80">
              {ROOMS.map(r => (
                <g key={r.id}>
                  <rect x={r.x0 + 0.2} y={r.z0 + 0.2} width={CW - 0.4} height={CD - 0.4} fill="#0f172a" stroke="#475569" strokeWidth={0.25} />
                  <text x={r.cx} y={r.cz + 0.4} fontSize={1.9} textAnchor="middle" fill="#64748b">{r.name.split(' ')[0]}</text>
                </g>
              ))}
              {hud.incs.map(i => {
                const st = roomById(Object.values(INCIDENTS).find(d => d.type === i.type)!.room).station;
                return <circle key={i.id} cx={st.x} cy={st.z} r={1.5} fill={hex(INCIDENTS[i.type].color)} className="animate-pulse" />;
              })}
              {hud.pts.map(p => <circle key={p.id} cx={p.x} cy={p.z} r={p.me ? 1.15 : 0.9} fill={hex(p.color)} stroke={p.me ? '#fff' : 'none'} strokeWidth={0.3} />)}
            </svg>
            <div className="mt-1 flex flex-col gap-0.5 text-[9px] bg-slate-900/80 border border-slate-700 rounded p-1" style={{ width: COLS * CW * mm }}>
              {hud.bots.map(b => (
                <div key={b.id} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: hex(b.color) }} />
                  <span className="text-slate-200">{b.name}</span>
                  <span className="text-slate-500 truncate">{b.prof}</span>
                  <span className={`ml-auto whitespace-nowrap ${b.state === 'panic' ? 'text-red-400' : b.state === 'work' ? 'text-emerald-400' : b.state === 'goto' ? 'text-amber-300' : 'text-slate-500'}`}>
                    {b.state === 'panic' ? 'паника' : b.state === 'work' ? 'чинит' : b.state === 'goto' ? 'бежит' : 'ждёт'}{b.exp > 0 ? ` ★${Math.round(b.exp * 10)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Действия */}
          <div className="absolute bottom-5 right-3 flex flex-col items-end gap-2">
            {hud.nearId !== null && (
              <div className="flex flex-col items-end gap-1">
                <div className="text-[10px] text-slate-300 bg-slate-900/85 border border-slate-600 rounded px-2 py-0.5">{hud.nearBoost}</div>
                <div className="w-40 h-2 bg-slate-800 border border-slate-600 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round(hud.nearProgress * 100)}%` }} /></div>
                <button
                  onPointerDown={e => { e.preventDefault(); holdRef.current = true; }}
                  onPointerUp={() => { holdRef.current = false; }}
                  onPointerLeave={() => { holdRef.current = false; }}
                  onPointerCancel={() => { holdRef.current = false; }}
                  className={`w-24 h-24 md:w-auto md:h-auto md:px-6 md:py-3 rounded-full md:rounded font-bold text-[11px] md:text-sm border-2 cursor-pointer bg-amber-500 text-slate-950 border-amber-300 ${hud.working ? 'brightness-125 scale-95' : ''}`}
                >
                  {hud.nearVerb.toUpperCase()}
                  <div className="hidden md:block text-[10px] font-normal opacity-70">удерживай · клавиша E</div>
                </button>
              </div>
            )}
            <button
              onClick={() => api.current.call()}
              disabled={hud.helpCd > 0}
              className={`px-3 py-2 rounded border text-[11px] font-bold cursor-pointer ${hud.helpCd > 0 ? 'border-slate-700 bg-slate-900/80 text-slate-500' : 'border-sky-400 bg-sky-500/20 text-sky-200'}`}
            >
              📢 ПОЗВАТЬ ПОМОЩЬ{hud.helpCd > 0 ? ` (${Math.ceil(hud.helpCd)})` : ' (Q)'}
            </button>
          </div>

          {/* Роль игрока */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2 text-[10px] text-slate-400 bg-slate-900/70 border border-slate-700 rounded px-2 py-1">
            <span className="text-amber-300 font-bold">{prof}</span><span>·</span><span>{bag.join(', ') || 'без багажа'}</span>
          </div>
          <div className="hidden 2xl:block absolute bottom-3 left-40 text-[10px] text-slate-500">WASD — ходьба · мышь + тяни — камера · колёсико — масштаб · E — чинить · Q — позвать</div>

          <div
            ref={joyBase}
            onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); joyMove(e); }}
            onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') joyMove(e); }}
            onPointerUp={joyEnd}
            onPointerCancel={joyEnd}
            className="absolute bottom-5 left-3 w-32 h-32 rounded-full border-2 border-slate-600 bg-slate-900/50 touch-none"
          >
            <div className="absolute w-14 h-14 rounded-full bg-amber-500/80 border-2 border-amber-300 pointer-events-none" style={{ left: `calc(50% - 28px + ${knob.x * 38}px)`, top: `calc(50% - 28px + ${knob.y * 38}px)` }} />
          </div>
        </>
      )}

      {/* Экран настройки */}
      {phase === 'setup' && (
        <div className="absolute inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto p-4 pb-10">
            <div className="flex items-center gap-2 mb-3">
              <a href="/" className="px-2 py-1 text-[11px] border border-slate-600 bg-slate-900/80 rounded hover:border-amber-500">← В игру</a>
              <h1 className="text-amber-400 font-black tracking-wider text-lg">БУНКЕР 3D · АЛЬФА</h1>
            </div>
            <p className="text-xs text-slate-400 mb-4">Выживи смену в большом бункере: аварии из сценариев игры, твои карты дают навыки, а боты сами бегут на помощь. Можно позвать их кнопкой.</p>

            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1.5">1. Бункер</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5 mb-4">
              {THEMES.map(t => (
                <button key={t.id} onClick={() => { setThemeId(t.id); api.current.preview(t.id); }} className={`text-left p-2 rounded border cursor-pointer ${themeId === t.id ? 'border-amber-500 bg-amber-500/15' : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'}`}>
                  <div className="w-full h-1.5 rounded mb-1.5" style={{ background: hex(t.accent) }} />
                  <div className={`text-xs font-bold ${themeId === t.id ? 'text-amber-200' : 'text-slate-200'}`}>{t.name}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{t.sub}</div>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1.5">2. Твоя профессия</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-4">
              {PROFESSIONS.map(p => <CardChip key={p} type="profession" title={p} on={prof === p} onClick={() => setProf(p)} />)}
            </div>

            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1.5">3. Багаж (до двух предметов)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-4">
              {BAGGAGE.map(b => <CardChip key={b} type="baggage" title={b} on={bag.includes(b)} onClick={() => toggleBag(b)} />)}
            </div>

            <div className="p-2 rounded border border-slate-700 bg-slate-900/70 mb-4 text-[11px]">
              <div className="text-slate-400 mb-1">Твои карты ускоряют починку:</div>
              {helps.length ? (
                <div className="flex flex-wrap gap-1.5">{helps.map(h => <span key={h.type} className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">{h.icon} {h.title}</span>)}</div>
              ) : <span className="text-slate-500">ничего — тебе будет сложно, зато боты помогут</span>}
            </div>

            <button onClick={() => api.current.start({ themeId, prof, bag })} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-wider rounded cursor-pointer">НАЧАТЬ СМЕНУ</button>
          </div>
        </div>
      )}

      {/* Итоги */}
      {phase === 'end' && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
          <div className={`p-6 border bg-slate-950 text-center max-w-xs w-full ${result.win ? 'border-emerald-500' : 'border-red-500'}`}>
            <div className={`font-black text-lg mb-2 ${result.win ? 'text-emerald-400' : 'text-red-400'}`}>{result.win ? 'СМЕНА ПРОЙДЕНА' : 'БУНКЕР ПОТЕРЯН'}</div>
            <div className="text-xs text-slate-300 space-y-1 mb-4">
              <div>Аварий устранено: <b className="text-slate-100">{result.fixed}</b></div>
              <div>Целостность: <b className="text-slate-100">{result.integrity}%</b></div>
              <div>Очки: <b className="text-amber-300">{result.score}</b></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPhase('setup')} className="flex-1 px-3 py-2 bg-amber-500 text-slate-950 font-bold text-sm cursor-pointer">ЕЩЁ РАЗ</button>
              <a href="/" className="flex-1 px-3 py-2 border border-slate-600 text-slate-200 text-sm text-center">В ИГРУ</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proto3D;
