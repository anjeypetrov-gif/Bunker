import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { THEMES, BOT_SAY, cardType, type Theme } from '../proto3d/data';
import { buildWorld, type World } from '../proto3d/world';
import { makeHuman, animate, makeBubble, say, tickBubble, makeLabel, type Human, type Bubble } from '../proto3d/humans';
import { ROOMS, roomById, findPath, collide, freePoint, type Pt } from '../proto3d/layout';
import { getCardArt } from '../data/cardArt';
import { RES_META, type Res, type ResKey } from './events';
import {
  newGame, pickEvent, resolve, endDay, alive, viewChoice, fmt, verdict, chronicleText, newResident,
  TOTAL_DAYS, type State, type Picked, type Result, type Night, type Resident
} from './engine';

type Phase = 'setup' | 'event' | 'result' | 'night' | 'end';
const KEYS: ResKey[] = ['f', 'w', 'p', 'a', 'm'];
const SHIRTS = [0x4d78a6, 0xb85a7a, 0x6f8f5e, 0x8a6fb0, 0xc9803a, 0x4f9a9a, 0xa06a4a, 0x7a7f8a, 0xc0525a];
const HAIR = [0x3a2a1c, 0xc9b27a, 0x1b1b1b, 0x6b3b1e, 0xd8c7a0, 0x5a4636];
const SKIN = [0xd9b89a, 0xc99c7c, 0xe2c2a2, 0xe8cfb2];

interface Actor { id: number; h: Human; bubble: Bubble; label: THREE.Sprite; path: Pt[]; wait: number; work: number; prev: Pt; stuck: number }
interface SceneApi {
  setTheme: (id: string) => void;
  sync: (rs: Resident[]) => void;
  focus: (roomId: string | null) => void;
  beacon: (icon: string | null, roomId?: string) => void;
  send: (id: number, roomId: string, work?: boolean) => void;
  say: (id: number, text: string) => void;
  reset: () => void;
}

const art = (type: 'profession' | 'baggage', title: string) => getCardArt(cardType(type), title);

const Avatar: React.FC<{ r: Resident; size?: number }> = ({ r, size = 30 }) => {
  const a = art('profession', r.prof);
  return a
    ? <img src={a} alt="" style={{ width: size, height: size }} className={`rounded-full object-cover shrink-0 border border-slate-600 ${r.alive ? '' : 'grayscale opacity-50'}`} draggable={false} />
    : <div style={{ width: size, height: size }} className="rounded-full bg-slate-700 shrink-0" />;
};

const Delta: React.FC<{ d: Partial<Res> }> = ({ d }) => (
  <div className="flex flex-wrap gap-1.5">
    {KEYS.filter(k => d[k]).map(k => (
      <span key={k} className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${(d[k] as number) > 0 ? 'text-emerald-300 border-emerald-700 bg-emerald-950/60' : 'text-red-300 border-red-800 bg-red-950/60'}`}>
        {RES_META[k].icon} {RES_META[k].name} {(d[k] as number) > 0 ? '+' : ''}{Math.round(d[k] as number)}
      </span>
    ))}
  </div>
);

export default function Chronicle() {
  const mountRef = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [themeId, setThemeId] = useState('titan');
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Resident[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [night, setNight] = useState<Night | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, force] = useState(0);
  const bump = () => force(v => v + 1);

  const shuffleDraft = () => {
    const g = newGame(themeId);
    setDraft(g.residents);
    api.current?.sync(g.residents);
  };

  // ---------- 3D ----------
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x07090d);
    mount.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
    let camScale = 1;
    const cam = { yaw: 0.25, pitch: 1.1, dist: 44, tx: 0, tz: 0, ty: 0, wantDist: 44, wantTx: 0, wantTz: 0, zoom: 1, drag: false, lastX: 0, lastY: 0, auto: true };
    let fullW = 1, fullH = 1;
    const resize = () => {
      fullW = mount.clientWidth; fullH = mount.clientHeight;
      renderer.setSize(fullW, fullH); camera.aspect = fullW / fullH;
      camScale = Math.max(1, 1.15 / camera.aspect);
      camera.setViewOffset(fullW, fullH, 0, Math.round(fullH * (fullW < 700 ? 0.17 : 0.06)), fullW, fullH);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let theme: Theme = THEMES[0];
    let world: World = buildWorld(scene, theme);
    const lamp = new THREE.PointLight(theme.lamp, 14, 24, 1.5);
    lamp.position.set(0, 6, 0);
    scene.add(lamp);

    const actors = new Map<number, Actor>();
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const spawnPt = () => { const r = roomById('hub'); return { x: r.cx + rnd(-4, 4), z: r.cz + rnd(-1, 2.5) }; };

    const addActor = (r: Resident) => {
      const h = makeHuman(scene, SHIRTS[r.id % SHIRTS.length], 0x2d3138, HAIR[(r.id * 3) % HAIR.length], SKIN[r.id % SKIN.length]);
      const bubble = makeBubble(h.group, 3.0);
      const label = makeLabel(r.name, 2.4, 0.5, 'bold 44px sans-serif', '#f1f5f9', 'rgba(10,14,20,0.6)');
      label.position.y = 2.5;
      h.group.add(label);
      const p = spawnPt();
      h.group.position.set(p.x, 0, p.z);
      actors.set(r.id, { id: r.id, h, bubble, label, path: [], wait: rnd(0.2, 2), work: 0, prev: p, stuck: 0 });
    };
    const removeActor = (id: number) => {
      const a = actors.get(id); if (!a) return;
      scene.remove(a.h.group); actors.delete(id);
    };

    const beacon = new THREE.Group();
    beacon.visible = false; scene.add(beacon);
    let beaconSprite: THREE.Sprite | null = null;
    const ringGeo = new THREE.RingGeometry(1.6, 2.1, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; beacon.add(ring);

    api.current = {
      setTheme: (id) => {
        theme = THEMES.find(t => t.id === id) || THEMES[0];
        world.dispose(); world = buildWorld(scene, theme);
        lamp.color.setHex(theme.lamp); renderer.setClearColor(theme.fog);
      },
      sync: (rs) => {
        const ids = new Set(rs.filter(r => r.alive).map(r => r.id));
        [...actors.keys()].forEach(id => { if (!ids.has(id)) removeActor(id); });
        rs.filter(r => r.alive).forEach(r => { if (!actors.has(r.id)) addActor(r); });
      },
      focus: (roomId) => {
        if (!roomId) { cam.wantDist = 44; cam.wantTx = 0; cam.wantTz = 0; cam.auto = true; return; }
        const r = roomById(roomId);
        cam.wantDist = 19; cam.wantTx = r.cx; cam.wantTz = r.cz; cam.auto = false;
      },
      beacon: (icon, roomId) => {
        if (beaconSprite) { beacon.remove(beaconSprite); beaconSprite.material.map?.dispose(); beaconSprite.material.dispose(); beaconSprite = null; }
        if (!icon || !roomId) { beacon.visible = false; return; }
        const r = roomById(roomId);
        beacon.position.set(r.cx, 0, r.cz); beacon.visible = true;
        beaconSprite = makeLabel(icon, 2.6, 2.6, '150px sans-serif', '#ffffff', '');
        beaconSprite.position.y = 4.2; beacon.add(beaconSprite);
      },
      send: (id, roomId, work = true) => {
        const a = actors.get(id); if (!a) return;
        const r = roomById(roomId);
        const from = { x: a.h.group.position.x, z: a.h.group.position.z };
        a.path = findPath(from, { x: r.station.x + rnd(-1.5, 1.5), z: r.station.z + rnd(0, 1) });
        a.wait = work ? 0 : rnd(6, 9); a.work = 0; (a as Actor & { goWork?: boolean }).goWork = work;
      },
      say: (id, text) => { const a = actors.get(id); if (a) say(a.bubble, text, 3.2); },
      reset: () => { [...actors.keys()].forEach(removeActor); }
    };

    // управление камерой
    const onDown = (e: PointerEvent) => { cam.drag = true; cam.lastX = e.clientX; cam.lastY = e.clientY; dom.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!cam.drag) return;
      cam.yaw -= (e.clientX - cam.lastX) * 0.006;
      cam.pitch = Math.max(0.55, Math.min(1.45, cam.pitch + (e.clientY - cam.lastY) * 0.004));
      cam.lastX = e.clientX; cam.lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => { cam.drag = false; try { dom.releasePointerCapture(e.pointerId); } catch { /* */ } };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.zoom = Math.max(0.55, Math.min(1.5, cam.zoom * (e.deltaY > 0 ? 1.08 : 0.92))); };
    const noMenu = (e: Event) => e.preventDefault();
    dom.addEventListener('pointerdown', onDown); dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp); dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false }); dom.addEventListener('contextmenu', noMenu);

    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    let raf = 0, t = 0;
    camera.position.set(0, 40, 20);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      t += dt;
      actors.forEach(a => {
        const g = a.h.group;
        const ext = a as Actor & { goWork?: boolean };
        tickBubble(a.bubble, dt);
        if (a.work > 0) {
          a.work -= dt; animate(a.h, 0, t, true); a.h.wrench.visible = true;
          if (a.work <= 0) { a.h.wrench.visible = false; a.wait = rnd(1, 3); }
          return;
        }
        if (!a.path.length) {
          if (ext.goWork) { ext.goWork = false; a.work = 4.5; return; }
          a.wait -= dt;
          animate(a.h, 0, t);
          if (a.wait <= 0) {
            const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
            const to = freePoint(room.cx + rnd(-4.5, 4.5), room.cz + rnd(-2.2, 2.6), 0.6);
            a.path = findPath({ x: g.position.x, z: g.position.z }, to);
            a.wait = rnd(2, 6);
          }
          return;
        }
        const wp = a.path[0];
        const dx = wp.x - g.position.x, dz = wp.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        const sp = (ext.goWork ? 4.2 : 1.9) * dt;
        if (dist < 0.25) { a.path.shift(); return; }
        const nx = g.position.x + (dx / dist) * Math.min(sp, dist), nz = g.position.z + (dz / dist) * Math.min(sp, dist);
        const c = collide(nx, nz, 0.4);
        const moved = Math.hypot(c.x - g.position.x, c.z - g.position.z);
        g.position.x = c.x; g.position.z = c.z;
        a.stuck = moved < sp * 0.3 ? a.stuck + dt : 0;
        if (a.stuck > 0.8) { // упёрся: перестроить путь к последней цели
          a.stuck = 0;
          const last = a.path[a.path.length - 1];
          a.path = findPath({ x: g.position.x, z: g.position.z }, last);
          if (a.path.length > 1 && Math.random() < 0.5) a.path.shift();
        }
        let dr = Math.atan2(dx, dz) - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        g.rotation.y += dr * Math.min(1, dt * 10);
        animate(a.h, sp, t);
        a.h.wrench.visible = false;
      });
      // маяк события
      if (beacon.visible) {
        const k = 1 + Math.sin(t * 3) * 0.12;
        ring.scale.set(k, k, k);
        ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.25;
        if (beaconSprite) beaconSprite.position.y = 4.2 + Math.sin(t * 2.5) * 0.25;
      }
      // камера
      if (cam.auto && !cam.drag) cam.yaw += dt * 0.03;
      const k = 1 - Math.pow(0.01, dt);
      cam.dist += (cam.wantDist - cam.dist) * k; cam.tx += (cam.wantTx - cam.tx) * k; cam.tz += (cam.wantTz - cam.tz) * k;
      const d = cam.dist * cam.zoom * camScale, cp = Math.cos(cam.pitch);
      tmp.set(cam.tx + Math.sin(cam.yaw) * cp * d, Math.sin(cam.pitch) * d + 0.8, cam.tz + Math.cos(cam.yaw) * cp * d);
      camera.position.copy(tmp);
      camera.lookAt(cam.tx, 1.0, cam.tz);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp); dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel); dom.removeEventListener('contextmenu', noMenu);
      world.dispose(); renderer.dispose();
      if (dom.parentElement) dom.parentElement.removeChild(dom);
      api.current = null;
    };
  }, []);

  // первая раскладка жителей на экране выбора
  useEffect(() => {
    const g = newGame('titan');
    setDraft(g.residents);
    api.current?.sync(g.residents);
    api.current?.focus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseTheme = (id: string) => { setThemeId(id); api.current?.setTheme(id); };

  // ---------- ход игры ----------
  const nextEvent = (s: State) => {
    const p = pickEvent(s);
    setPicked(p); setResult(null); setNight(null); setPhase('event');
    api.current?.focus(p.ev.room);
    api.current?.beacon(p.ev.icon, p.ev.room);
    [p.A, p.B].forEach(r => { if (r && r.alive) api.current?.send(r.id, p.ev.room, false); });
    bump();
  };

  const startGame = () => {
    const s = newGame(themeId, draft.map(r => ({ ...r })));
    setState(s); setSel(null);
    api.current?.reset(); api.current?.sync(s.residents);
    nextEvent(s);
  };

  const choose = (i: number) => {
    if (!state || !picked) return;
    const v = viewChoice(state, picked.ev.choices[i]);
    if (v.locked) return;
    const res = resolve(state, picked, i);
    setResult(res); setPhase('result');
    const a = api.current;
    if (a) {
      if (res.S) { a.send(res.S.id, picked.ev.room); a.say(res.S.id, res.success ? pickRnd(BOT_SAY.claim) : 'Не вышло…'); }
      else if (picked.A) a.say(picked.A.id, res.success ? pickRnd(BOT_SAY.done) : pickRnd(BOT_SAY.panic));
      res.deaths.forEach(d => a.say(d.id, '…'));
      a.sync(state.residents);
    }
    bump();
  };
  const pickRnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const goNight = () => {
    if (!state) return;
    api.current?.beacon(null); api.current?.focus(null);
    const n = endDay(state);
    api.current?.sync(state.residents);
    setNight(n); setPhase('night'); bump();
  };

  const nextDay = () => {
    if (!state || !night) return;
    if (night.ended) { setPhase('end'); api.current?.focus(null); bump(); return; }
    nextEvent(state);
  };

  const again = () => {
    const g = newGame(themeId);
    setDraft(g.residents); setState(null); setPicked(null); setResult(null); setNight(null);
    api.current?.reset(); api.current?.sync(g.residents); api.current?.focus(null); api.current?.beacon(null);
    setPhase('setup'); setShowLog(false);
  };

  const copyChronicle = async () => {
    if (!state) return;
    try { await navigator.clipboard.writeText(chronicleText(state, verdict(state))); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  };

  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const ver = useMemo(() => (state ? verdict(state) : null), [state, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = state?.residents.find(r => r.id === sel) || null;
  const nm = picked ? (txt: string) => fmt(txt, picked.A, picked.B, null) : (t: string) => t;

  const ResCard: React.FC<{ r: Resident }> = ({ r }) => (
    <div className="flex items-center gap-2 p-1.5 rounded border border-slate-700 bg-slate-900/70">
      <Avatar r={r} size={40} />
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-slate-100">{r.name}</div>
        <div className="text-[11px] text-slate-300 leading-tight">{r.prof}</div>
        <div className="text-[10px] text-slate-500 leading-tight">🎒 {r.bag}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-page text-slate-100 overflow-hidden select-none" style={{ fontFamily: 'system-ui, sans-serif' }} onContextMenu={e => e.preventDefault()}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* Верхняя панель */}
      {state && phase !== 'setup' && (
        <div className="absolute top-0 left-0 right-0 p-2 flex flex-col gap-1.5 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <a href="/" className="text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-900/80 text-slate-300 no-underline">← Меню</a>
            <div className="text-[13px] font-bold tracking-wide">ДЕНЬ {Math.min(state.day, TOTAL_DAYS)} <span className="text-slate-500 font-normal">/ {TOTAL_DAYS}</span></div>
            <div className="text-[11px] text-slate-400 hidden sm:block">{theme.name}</div>
            <button onClick={() => setShowLog(v => !v)} className="ml-auto text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-900/80 text-slate-200 cursor-pointer">📜 Хроника</button>
          </div>
          <div className="grid grid-cols-5 gap-1.5 max-w-xl pointer-events-auto">
            {KEYS.map(k => (
              <div key={k} className="rounded border border-slate-700 bg-slate-900/80 px-1.5 py-1">
                <div className="flex items-center justify-between text-[10px] text-slate-300 leading-none">
                  <span>{RES_META[k].icon} <span className="hidden sm:inline">{RES_META[k].name}</span></span>
                  <span className={state.res[k] < 25 ? 'text-red-400 font-bold' : ''}>{Math.round(state.res[k])}</span>
                </div>
                <div className="h-1.5 rounded bg-slate-800 mt-1 overflow-hidden"><div className="h-full rounded" style={{ width: `${state.res[k]}%`, background: state.res[k] < 25 ? '#f87171' : RES_META[k].color }} /></div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 pointer-events-auto" style={{ scrollbarWidth: 'none' }}>
            {state.residents.map(r => (
              <button key={r.id} onClick={() => setSel(sel === r.id ? null : r.id)} className={`flex items-center gap-1.5 shrink-0 rounded-full pl-0.5 pr-2.5 py-0.5 border cursor-pointer ${sel === r.id ? 'border-amber-500 bg-amber-500/15' : 'border-slate-700 bg-slate-900/80'} ${r.alive ? '' : 'opacity-60'}`}>
                <Avatar r={r} size={26} />
                <div className="text-left leading-tight">
                  <div className="text-[11px] font-bold text-slate-100">{r.alive ? r.name : `✝ ${r.name}`}</div>
                  <div className="w-12 h-1 rounded bg-slate-800 overflow-hidden mt-0.5"><div className="h-full rounded" style={{ width: `${r.hp}%`, background: r.hp < 35 ? '#f87171' : '#34d399' }} /></div>
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <div className="pointer-events-auto max-w-xs"><ResCard r={selected} />
              <div className="text-[10px] text-slate-400 mt-1 px-1">{selected.alive ? `Здоровье ${selected.hp}%` : `Погиб${selected.female ? 'ла' : ''} на день ${selected.died}`}</div>
            </div>
          )}
        </div>
      )}

      {/* Нижняя панель */}
      {state && phase !== 'setup' && (
        <div className="absolute left-0 right-0 bottom-0 p-2 sm:p-3 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-slate-600 bg-slate-950/90 backdrop-blur p-3 max-h-[52vh] overflow-y-auto">
            {phase === 'event' && picked && (
              <>
                <div className="flex items-center gap-2 mb-1.5"><span className="text-2xl">{picked.ev.icon}</span><h2 className="text-[15px] font-bold m-0 text-amber-200">{picked.ev.title}</h2></div>
                <p className="text-[13px] leading-snug text-slate-200 mt-0 mb-2.5">{nm(picked.ev.text)}</p>
                <div className="flex flex-col gap-1.5">
                  {picked.ev.choices.map((c, i) => {
                    const v = viewChoice(state, c);
                    return (
                      <button key={i} disabled={v.locked} onClick={() => choose(i)}
                        className={`text-left rounded border px-3 py-2 ${v.locked ? 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed' : 'border-slate-600 bg-slate-900 hover:border-amber-500 hover:bg-amber-500/10 cursor-pointer text-slate-100'}`}>
                        <div className="text-[13px] font-semibold">{v.locked ? '🔒 ' : ''}{nm(c.label)}</div>
                        <div className="text-[11px] mt-0.5 flex flex-wrap gap-x-3">
                          {v.locked && <span>{c.reqText || 'нужен навык'}</span>}
                          {!v.locked && v.who && <span className="text-emerald-400">★ {v.who.name} · {c.req?.pro?.includes(v.who.prof) ? v.who.prof : v.who.bag}</span>}
                          {v.chance !== null && <span className={v.chance >= 0.6 ? 'text-slate-300' : 'text-orange-300'}>шанс {Math.round(v.chance * 100)}%{v.boostWho ? ` (+30% · ${v.boostWho.name})` : ''}</span>}
                          {v.chance === null && !v.locked && !v.who && <span className="text-slate-500">надёжно</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {phase === 'result' && result && picked && (
              <>
                <div className="flex items-center gap-2 mb-1.5"><span className="text-xl">{result.success ? '✅' : '⚠'}</span><h2 className="text-[14px] font-bold m-0 text-amber-200">{picked.ev.title}</h2></div>
                <p className="text-[13px] leading-snug text-slate-100 mt-0 mb-2">{result.text}</p>
                <Delta d={result.deltas} />
                {result.hurtA > 0 && <div className="text-[11px] text-red-300 mt-1.5">❤ Здоровью {picked.A?.name} нанесён урон</div>}
                {result.deaths.map(d => <div key={d.id} className="text-[12px] text-red-400 mt-1.5 font-bold">✝ {d.name} {d.female ? 'погибла' : 'погиб'}.</div>)}
                {result.joined && <div className="text-[12px] text-emerald-300 mt-1.5 font-bold">➕ {result.joined.name} ({result.joined.prof}) присоединил{result.joined.female ? 'ась' : 'ся'} к вам.</div>}
                <button onClick={goNight} className="mt-3 w-full rounded border border-amber-500 bg-amber-500/15 text-amber-100 font-bold py-2 text-[13px] cursor-pointer">🌙 Наступает ночь</button>
              </>
            )}
            {phase === 'night' && night && (
              <>
                <div className="flex items-center gap-2 mb-1.5"><span className="text-xl">🌙</span><h2 className="text-[14px] font-bold m-0 text-amber-200">Ночь {state.day - (night.ended ? 0 : 1)}</h2></div>
                <div className="grid grid-cols-5 gap-1.5 mb-2">
                  {KEYS.map(k => {
                    const dlt = Math.round(night.after[k] - night.before[k]);
                    return <div key={k} className="rounded border border-slate-800 bg-slate-900/60 px-1 py-1 text-center"><div className="text-[10px] text-slate-400">{RES_META[k].icon}</div><div className={`text-[11px] font-bold ${dlt < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{dlt > 0 ? '+' : ''}{dlt}</div></div>;
                  })}
                </div>
                <p className="text-[12px] text-slate-300 mt-0 mb-1.5">{night.lines.length ? night.lines.join(' ') : 'Ночь прошла спокойно. Только где-то капает вода.'}</p>
                {night.deaths.map(d => <div key={d.id} className="text-[12px] text-red-400 font-bold">✝ {d.name} {d.female ? 'не пережила' : 'не пережил'} эту ночь.</div>)}
                <button onClick={nextDay} className="mt-3 w-full rounded border border-amber-500 bg-amber-500/15 text-amber-100 font-bold py-2 text-[13px] cursor-pointer">{night.ended ? 'К итогам ➜' : `☀ День ${state.day}`}</button>
              </>
            )}
            {phase === 'end' && ver && (
              <>
                <h2 className="text-[18px] font-bold m-0 text-amber-300 tracking-wide">{ver.title}</h2>
                <p className="text-[13px] text-slate-200 mt-1.5 mb-2">{ver.text}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {state.residents.map(r => <div key={r.id} className="flex items-center gap-1 text-[11px] text-slate-300"><Avatar r={r} size={22} />{r.alive ? r.name : `✝ ${r.name}`}</div>)}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={copyChronicle} className="rounded border border-slate-500 bg-slate-900 text-slate-100 py-2 text-[12px] cursor-pointer">{copied ? '✓ Скопировано' : '📋 Скопировать хронику'}</button>
                  <button onClick={() => setShowLog(true)} className="rounded border border-slate-500 bg-slate-900 text-slate-100 py-2 text-[12px] cursor-pointer">📜 Читать хронику</button>
                  <button onClick={again} className="col-span-2 rounded border border-amber-500 bg-amber-500/15 text-amber-100 font-bold py-2 text-[13px] cursor-pointer">Заселить новый бункер</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Журнал */}
      {showLog && state && (
        <div className="absolute inset-0 bg-black/70 flex items-end sm:items-center justify-center p-2 z-20" onClick={() => setShowLog(false)}>
          <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg border border-slate-600 bg-slate-950 p-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center mb-2"><h2 className="text-[15px] font-bold m-0 text-amber-200">📜 Хроника бункера</h2><button onClick={() => setShowLog(false)} className="ml-auto text-slate-400 text-lg cursor-pointer bg-transparent border-0">✕</button></div>
            {state.log.map((l, i) => (
              <div key={i} className={`text-[12px] leading-snug py-1.5 border-b border-slate-800 ${l.kind === 'death' ? 'text-red-300' : l.kind === 'join' ? 'text-emerald-300' : l.kind === 'night' ? 'text-slate-400' : 'text-slate-200'}`}>
                <span className="text-slate-500">День {l.day}.</span> {l.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Подготовка */}
      {phase === 'setup' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-black/40 to-black/80 z-10">
          <div className="max-w-2xl mx-auto p-4 pt-5">
            <a href="/" className="text-[11px] text-slate-400 no-underline">← В меню</a>
            <h1 className="text-xl font-bold tracking-widest text-amber-300 mt-2 mb-1">ХРОНИКА БУНКЕРА <span className="text-[11px] text-slate-400 font-normal tracking-normal">альфа</span></h1>
            <p className="text-[13px] text-slate-300 mt-0 mb-3 leading-snug">Бункер закрыт. Двадцать дней вы управляете жизнью поселенцев: каждый день приходит событие, и нужно выбрать, как поступить. Навыки и багаж жителей открывают лучшие решения. Тех, кого потеряли, вернуть нельзя.</p>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1.5">1. Бункер</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
              {THEMES.map(t => (
                <button key={t.id} onClick={() => chooseTheme(t.id)} className={`text-left p-2 rounded border cursor-pointer ${t.id === themeId ? 'border-amber-500 bg-amber-500/15' : 'border-slate-700 bg-slate-900/70'}`}>
                  <div className={`text-[13px] font-bold ${t.id === themeId ? 'text-amber-200' : 'text-slate-200'}`}>{t.name}</div>
                  <div className="text-[11px] text-slate-400">{t.sub}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center mb-1.5"><div className="text-[11px] text-slate-400 uppercase tracking-widest">2. Ваши жители</div>
              <button onClick={shuffleDraft} className="ml-auto text-[11px] px-2 py-1 rounded border border-slate-600 bg-slate-900 text-slate-200 cursor-pointer">🎲 Перемешать</button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-4">{draft.map(r => <ResCard key={r.id} r={r} />)}</div>
            <button onClick={startGame} className="w-full rounded border border-amber-500 bg-amber-500/20 text-amber-100 font-bold py-3 text-[14px] tracking-wider cursor-pointer mb-6">ЗАКРЫТЬ БУНКЕР</button>
          </div>
        </div>
      )}
    </div>
  );
}
