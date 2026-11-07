import * as THREE from 'three';
import { ROOMS, WALLS, DOORS, WALL_T, CW, CD, addObstacle, clearObstacles, type Room } from './layout';
import { makeLabel } from './humans';
import type { Theme } from './data';

export interface World {
  group: THREE.Group;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  roomFloors: Record<string, THREE.Mesh>;
  dispose: () => void;
}

export function buildWorld(scene: THREE.Scene, theme: Theme): World {
  clearObstacles();
  const group = new THREE.Group();
  scene.add(group);
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mat = (c: number, r = 0.85, m = 0.1, emissive = 0x000000) => {
    const mt = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive });
    mats.push(mt); return mt;
  };
  // Текстуры: грузятся асинхронно; пока (или если) файла нет — остаётся обычный цвет.
  const texs = new Map<string, THREE.Texture>();
  const loader = new THREE.TextureLoader();
  const getTex = (name: string, cb: (t: THREE.Texture) => void) => {
    const have = texs.get(name);
    if (have) { cb(have); return; }
    loader.load(`/tex/${name}.jpg`, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      texs.set(name, t); cb(t);
    }, undefined, () => { /* нет файла — не страшно */ });
  };
  const tintOf = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
  const tmat = (c: number, tex: string, tint: number, tile: number, r = 0.85, m = 0.1) => {
    const mt = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    mt.userData.tile = tile;
    getTex(tex, t => { mt.map = t; mt.color.setHex(tint); mt.needsUpdate = true; });
    mats.push(mt); return mt;
  };
  const tileUV = (g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number) => {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    uv.needsUpdate = true;
  };
  const box = (w: number, h: number, d: number, mt: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); geos.push(g);
    if (mt.userData.tile) tileUV(g, w, h, d, mt.userData.tile);
    const me = new THREE.Mesh(g, mt); me.position.set(x, y, z); me.rotation.y = ry; group.add(me); return me;
  };
  const cyl = (rt: number, rb: number, h: number, mt: THREE.Material, x: number, y: number, z: number, rz = 0, seg = 16) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); geos.push(g);
    const me = new THREE.Mesh(g, mt); me.position.set(x, y, z); me.rotation.z = rz; group.add(me); return me;
  };

  scene.fog = new THREE.Fog(theme.fog, 48, 120);
  const hemi = new THREE.HemisphereLight(0xb4c4dc, 0x2a2018, 1.3);
  const sun = new THREE.DirectionalLight(theme.lamp, 0.75);
  sun.position.set(6, 22, 8);
  group.add(hemi, sun);

  const wallMat = tmat(theme.wall, 'wall-panel', tintOf(theme.wall, 0.55), 3, 0.8, 0.15);
  const floorBase = new THREE.Color(theme.floor);
  const dark = mat(0x1d2128);
  const steel = tmat(0x6b7480, 'steel', 0xd4dbe3, 3, 0.5, 0.45);
  const accent = mat(theme.accent, 0.5, 0.2);
  const wood = tmat(0x5a4a33, 'wood', 0xe0c8a8, 2);
  const hazardMat = tmat(0xd9a82a, 'hazard', 0xffffff, 1.4, 0.8, 0);

  // Полы комнат
  const roomFloors: Record<string, THREE.Mesh> = {};
  ROOMS.forEach((r, i) => {
    const g = new THREE.BoxGeometry(CW, 0.2, CD); geos.push(g);
    tileUV(g, CW, 0.2, CD, 4);
    const c = floorBase.clone().offsetHSL(0, 0, ((i % 3) - 1) * 0.012);
    const ft = ({ medical: 'floor-medical', greenhouse: 'floor-greenhouse', generator: 'floor-metal', workshop: 'floor-metal', airlock: 'floor-metal' } as Record<string, string>)[r.id] || 'floor-concrete';
    const mt = tmat(c.getHex(), ft, ft === 'floor-medical' ? 0xe6e6e6 : tintOf(theme.floor, 0.88), 4, 0.9, 0.15);
    const f = new THREE.Mesh(g, mt); f.position.set(r.cx, -0.1, r.cz); group.add(f);
    roomFloors[r.id] = f;
    // разметка пола
    for (let k = -2; k <= 2; k++) box(0.05, 0.02, CD - 0.4, dark, r.cx + k * 2.6, 0.01, r.cz);
    const label = makeLabel(r.name.toUpperCase(), 5.2, 0.8, 'bold 54px sans-serif', '#e2e8f0');
    label.position.set(r.cx, 2.4, r.z0 + 1.0);
    group.add(label);
  });

  // Стены (низкие — чтобы камера могла вращаться) и стойки дверей
  const WALL_H = 1.0;
  WALLS.forEach(w => {
    const sx = w.x1 - w.x0, sz = w.z1 - w.z0;
    box(sx, WALL_H, sz, wallMat, (w.x0 + w.x1) / 2, WALL_H / 2, (w.z0 + w.z1) / 2);
    box(sx + 0.06, 0.12, sz + 0.06, accent, (w.x0 + w.x1) / 2, WALL_H + 0.06, (w.z0 + w.z1) / 2);
  });
  DOORS.forEach(d => {
    const horizontalWall = ROOMS.find(r => r.id === d.a)!.row !== ROOMS.find(r => r.id === d.b)!.row;
    for (const s of [-1, 1]) {
      if (horizontalWall) box(0.3, 1.5, WALL_T + 0.2, accent, d.x + s * 1.4, 0.75, d.z);
      else box(WALL_T + 0.2, 1.5, 0.3, accent, d.x, 0.75, d.z + s * 1.4);
    }
  });

  // ---------- Мебель и уют ----------
  // Всё высокое — «твёрдое» (в него упираются), коридоры от дверей и рабочие точки всегда свободны (см. LANES).
  const sbox = (w: number, h: number, d: number, mt: THREE.Material, x: number, y: number, z: number) => {
    const m = box(w, h, d, mt, x, y, z);
    addObstacle({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    return m;
  };
  const scyl = (rt: number, rb: number, h: number, mt: THREE.Material, x: number, y: number, z: number, seg = 14) => {
    const m = cyl(rt, rb, h, mt, x, y, z, 0, seg);
    const rr = Math.max(rt, rb);
    addObstacle({ x0: x - rr, x1: x + rr, z0: z - rr, z1: z + rr });
    return m;
  };
  const glow = (c: number, i = 1) => mat(c, 0.4, 0, c);
  void glow;
  const emis = (c: number) => { const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.5 }); mats.push(m); return m; };
  const cone = (rad: number, h: number, mt: THREE.Material, x: number, y: number, z: number, seg = 7) => {
    const g = new THREE.ConeGeometry(rad, h, seg); geos.push(g);
    const m = new THREE.Mesh(g, mt); m.position.set(x, y, z); group.add(m); return m;
  };
  const ball = (rad: number, mt: THREE.Material, x: number, y: number, z: number) => {
    const g = new THREE.SphereGeometry(rad, 12, 10); geos.push(g);
    const m = new THREE.Mesh(g, mt); m.position.set(x, y, z); group.add(m); return m;
  };
  const rug = (x: number, z: number, w: number, d: number, c: number) => box(w, 0.03, d, tmat(c, 'rug', tintOf(c, 0.5), 2.4, 1, 0), x, 0.03, z);
  const rrug = (x: number, z: number, rad: number, c: number) => cyl(rad, rad, 0.03, tmat(c, 'rug', c === 0xffffff ? 0xffffff : tintOf(c, 0.5), 2.4, 1, 0), x, 0.03, z, 0, 36);
  const pool = (x: number, z: number, rad: number, c: number, op = 0.5) => {
    const g = new THREE.CircleGeometry(rad, 28); geos.push(g);
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }); mats.push(m);
    getTex('lamp-glow', t => { m.alphaMap = t; m.needsUpdate = true; });
    m.opacity = 0.0001; getTex('lamp-glow', () => { m.opacity = op; });
    const me = new THREE.Mesh(g, m); me.rotation.x = -Math.PI / 2; me.position.set(x, 0.05, z); group.add(me);
  };

  const hangLamp = (x: number, z: number, c = 0xffc27a, y = 2.5, spread = 2.4) => {
    cyl(0.02, 0.02, 1.0, dark, x, y + 0.5, z);
    const sh = cyl(0.1, 0.34, 0.3, emis(c), x, y, z, 0, 16); void sh;
    pool(x, z, spread, c);
  };
  const plant = (x: number, z: number, big = false) => {
    scyl(0.26, 0.2, 0.42, mat(0x8a5a3a), x, 0.21, z, 10);
    const leaf = mat(0x4fae48, 0.8), leaf2 = mat(0x6fc45a, 0.8);
    ball(big ? 0.46 : 0.34, leaf, x, big ? 0.9 : 0.72, z);
    ball(big ? 0.34 : 0.24, leaf2, x + 0.14, big ? 1.25 : 0.95, z - 0.08);
  };
  const shelf = (x: number, z: number, w: number) => {
    sbox(w, 2.0, 0.5, mat(0x5a4330), x, 1.0, z);
    const cols = [0xa8472f, 0x3f6f8f, 0xc9a24a, 0x4f8f5a, 0x7a4f8f, 0xb8b0a0];
    for (let i = 0; i < Math.floor(w / 0.22); i++) {
      for (const yy of [0.55, 1.1, 1.65]) box(0.16, 0.34 + (i % 3) * 0.04, 0.3, mat(cols[(i + Math.round(yy * 3)) % cols.length], 0.9), x - w / 2 + 0.2 + i * 0.22, yy, z + 0.08);
    }
  };
  const mug = (x: number, y: number, z: number, c = 0xe8e0d0) => cyl(0.07, 0.06, 0.12, mat(c, 0.7), x, y, z, 0, 10);
  const fairy = (x0: number, z0: number, x1: number, z1: number, y: number, n: number, cols = [0xffc27a, 0xff9a6a, 0xffe08a]) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ball(0.075, emis(cols[i % cols.length]), x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.35, z0 + (z1 - z0) * t);
    }
    const mid = cyl(0.01, 0.01, Math.hypot(x1 - x0, z1 - z0), dark, (x0 + x1) / 2, y - 0.17, (z0 + z1) / 2); mid.rotation.z = Math.PI / 2; mid.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  const stool = (x: number, z: number, c = 0x6b4f33) => { scyl(0.28, 0.28, 0.1, mat(c), x, 0.5, z, 12); cyl(0.04, 0.04, 0.5, dark, x, 0.25, z); };
  const red = mat(0xb03a3a), yellow = mat(0xd9a82a, 0.6), green = mat(0x4f7a4a);
  const stripes = (x: number, z: number, w: number, d: number) => { box(w, 0.02, d, hazardMat, x, 0.03, z); };


  // Реквизит комнат (координаты — от центра отсека: dx вправо, dz к югу)
  const props: Record<string, (r: Room) => void> = {
    workshop: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      sbox(4.2, 0.9, 1.2, wood, X(-3.6), 0.45, Z(-3.3));
      box(0.4, 0.5, 0.4, steel, X(-4.6), 1.15, Z(-3.3));
      mug(X(-2.6), 0.96, Z(-3.2), 0xd0a040);
      box(0.7, 0.12, 0.4, red, X(-3.3), 0.96, Z(-3.2));
      sbox(2.4, 1.6, 0.4, dark, X(3.8), 0.8, Z(-4.1));
      for (let i = 0; i < 6; i++) box(0.1, 0.5 + (i % 3) * 0.12, 0.06, steel, X(2.9 + i * 0.35), 1.2, Z(-3.85));
      scyl(0.5, 0.5, 1.1, mat(0x7a3b2e), X(5.8), 0.55, Z(3.3));
      scyl(0.5, 0.5, 1.1, mat(0x7a3b2e), X(5.8), 0.55, Z(2.1));
      sbox(1.4, 0.8, 1.4, steel, X(-5.2), 0.4, Z(2.9));
      sbox(0.8, 0.5, 0.45, red, X(-6.0), 0.25, Z(-0.2));
      sbox(0.7, 0.45, 0.5, steel, X(-6.0), 0.22, Z(0.7));
      sbox(1.6, 0.35, 1.0, mat(0x8a6a40), X(4.8), 0.18, Z(-2.3));
      box(1.6, 0.35, 1.0, mat(0x9a7a50), X(4.8), 0.53, Z(-2.3));
      stool(X(-2.2), Z(-2.4));
      hangLamp(X(-3.6), Z(-2.3));
      hangLamp(X(4.3), Z(2.6));
      rug(X(-3.4), Z(1.6), 2.6, 1.6, 0x6a3a3a);
      box(0.9, 0.7, 0.04, mat(0xe8d9b0, 0.9), X(-6.6), 1.5, Z(-1.9));
    },
    generator: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      scyl(0.9, 0.9, 2.0, steel, X(-2.5), 1.0, Z(-2.9), 20);
      scyl(0.9, 0.9, 2.0, steel, X(2.5), 1.0, Z(-2.9), 20);
      box(6.4, 0.3, 1.9, dark, X(0), 0.15, Z(-2.9));
      sbox(2.6, 1.7, 0.4, accent, X(0), 0.95, Z(-4.1));
      for (let i = 0; i < 5; i++) box(0.22, 0.22, 0.06, emis(i % 2 ? 0x44ff88 : 0xffa030), X(-0.9 + i * 0.45), 1.3, Z(-3.88));
      cyl(0.18, 0.18, 6, steel, X(4.5), 2.2, Z(-3.7), Math.PI / 2);
      sbox(1.2, 0.8, 1.2, wood, X(-5.4), 0.4, Z(3.1));
      scyl(0.3, 0.3, 0.7, red, X(5.6), 0.35, Z(-2.5), 10);
      scyl(0.3, 0.3, 0.7, red, X(5.6), 0.35, Z(-3.3), 10);
      stripes(X(-2.5), Z(-1.55), 2.0, 0.4); stripes(X(2.5), Z(-1.55), 2.0, 0.4);
      cyl(0.5, 0.5, 0.05, mat(0x222222), X(4.6), 0.05, Z(3.4), 0, 16);
      hangLamp(X(-4.2), Z(2.0), 0xffb46a); hangLamp(X(4.2), Z(2.6), 0xffb46a);
      box(0.9, 0.7, 0.12, emis(0x2a7a4a), X(-6.7), 1.5, Z(-1.7));
    },
    radio: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      sbox(4.2, 0.85, 1.2, wood, X(0), 0.42, Z(-3.5));
      for (const dx of [-1.3, 0, 1.3]) box(0.9, 0.6, 0.1, mat(0x103050, 0.4, 0.1, 0x1a4a8a), X(dx), 1.35, Z(-3.6));
      box(0.5, 0.06, 0.3, dark, X(-0.4), 0.9, Z(-3.2)); mug(X(1.7), 0.92, Z(-3.3), 0x6a8bff);
      scyl(0.08, 0.1, 4.5, steel, X(5.2), 2.2, Z(-3.7), 8);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), steel);
      geos.push(dish.geometry); dish.position.set(X(5.2), 4.1, Z(-3.7)); dish.rotation.x = -1.0; group.add(dish);
      sbox(1.2, 1.1, 1.2, dark, X(-5.2), 0.55, Z(3.1));
      sbox(1.0, 1.9, 0.8, mat(0x2a3140), X(3.5), 0.95, Z(-4.0));
      for (let i = 0; i < 5; i++) box(0.7, 0.06, 0.04, emis(i % 2 ? 0x44aaff : 0x44ff88), X(3.5), 0.5 + i * 0.3, Z(-3.58));
      sbox(2.0, 0.5, 1.0, mat(0x55504a), X(4.8), 0.25, Z(3.0));
      box(1.8, 0.14, 0.9, mat(0x7a5a8a, 0.95), X(4.8), 0.56, Z(3.0));
      rug(X(3.2), Z(1.0), 2.6, 1.6, 0x35506a);
      hangLamp(X(-3.0), Z(-2.4), 0x9ab8ff, 2.5, 2.2);
      hangLamp(X(4.8), Z(2.0));
      plant(X(-6.2), Z(-3.8));
    },
    storage: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      const crate = tmat(0x6b5a3c, 'crate', 0xffffff, 1.6);
      [[-5, -3.5], [-5, -2.3], [-3.8, -3.5], [5.2, 2.5], [5.2, -2.3], [4, -3.4]].forEach(([dx, dz], i) => {
        sbox(1.1, 1.0, 1.1, crate, X(dx), 0.5, Z(dz));
        if (i % 2 === 0) box(1.0, 0.9, 1.0, crate, X(dx), 1.45, Z(dz));
      });
      sbox(0.5, 2.0, 2.2, dark, X(6.5), 1.0, Z(-2.9)); sbox(0.5, 2.0, 2.2, dark, X(6.5), 1.0, Z(2.9));
      for (const dz of [-2.9, 2.9]) for (let i = 0; i < 4; i++) box(0.3, 0.3, 0.3 + (i % 2) * 0.1, i % 2 ? yellow : red, X(6.2), 0.5 + i * 0.4, Z(dz));
      scyl(0.45, 0.45, 1.0, green, X(-5.5), 0.5, Z(3.0), 12);
      scyl(0.45, 0.45, 1.0, green, X(-4.5), 0.5, Z(3.5), 12);
      for (let i = 0; i < 3; i++) sbox(0.9, 0.5, 0.6, mat(0xc9b896, 0.95), X(-3.6 + i * 0.5), 0.25 + (i === 1 ? 0.5 : 0), Z(3.6 - (i === 1 ? 0.2 : 0)));
      hangLamp(X(-4), Z(0), 0xffc27a, 2.5, 2.6);
      hangLamp(X(3.6), Z(-0.2), 0xffc27a, 2.5, 2.0);
      stool(X(-6.2), Z(0.8));
    },
    hub: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      const bed = mat(0x3a3f47), quilt = [0x5a6577, 0x7a4a52, 0x4a6a5a, 0x7a6a4a];
      [-3.5, -2.1, 2.1, 3.5].forEach((dz, i) => {
        sbox(2.4, 0.4, 1.0, bed, X(-4.8), 0.4, Z(dz));
        box(2.2, 0.15, 0.9, tmat(quilt[i], 'fabric', tintOf(quilt[i], 0.5), 1.2, 0.95, 0), X(-4.8), 0.7, Z(dz));
        box(0.5, 0.14, 0.7, mat(0xdcd6c8, 0.95), X(-5.65), 0.84, Z(dz));
      });
      rrug(X(0), Z(0.1), 2.8, 0xffffff);
      sbox(2.6, 0.12, 1.4, wood, X(4.0), 0.8, Z(2.6));
      for (const [dx, dz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) box(0.12, 0.8, 0.12, dark, X(4.0 + dx), 0.4, Z(2.6 + dz));
      mug(X(3.3), 0.92, Z(2.5), 0xd0a040); mug(X(4.1), 0.92, Z(2.8), 0xb0584a); box(0.5, 0.05, 0.4, mat(0xd8d0b8), X(4.7), 0.9, Z(2.5));
      stool(X(2.6), Z(3.9)); stool(X(5.4), Z(3.9));
      shelf(X(4.0), Z(-4.15), 3.0);
      sbox(1.1, 0.6, 1.1, mat(0x7a4a3a), X(5.6), 0.3, Z(-2.4)); box(1.1, 0.7, 0.3, mat(0x7a4a3a), X(5.6), 0.8, Z(-2.9));
      plant(X(6.3), Z(-3.8), true); plant(X(2.0), Z(-3.6));
      sbox(0.5, 1.5, 0.5, mat(0x30343b), X(6.4), 0.75, Z(1.9)); // торшер-тумба
      hangLamp(X(0), Z(0.1), 0xffb870, 2.6, 3.2);
      fairy(X(-6.4), Z(-4.3), X(6.4), Z(-4.3), 2.7, 14); fairy(X(-6.4), Z(4.3), X(6.4), Z(4.3), 2.7, 14);
      const hatch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.13, 10, 28), accent);
      geos.push(hatch.geometry); hatch.position.set(X(0), 1.25, Z(-4.15)); group.add(hatch);
    },
    medical: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      const sheet = mat(0xdfe6ee, 0.9);
      for (const dx of [-5.2, -3.4, 2.6]) {
        sbox(1.0, 0.4, 2.2, mat(0x4a5560), X(dx), 0.4, Z(-3.1));
        box(0.9, 0.15, 2.0, sheet, X(dx), 0.68, Z(-3.1));
        box(0.7, 0.12, 0.4, mat(0xbfd0e0), X(dx), 0.8, Z(-3.9));
      }
      sbox(1.2, 1.9, 0.6, mat(0xcfd6dd), X(5.2), 0.95, Z(-3.9));
      box(0.5, 0.15, 0.04, emis(0xff4a4a), X(5.2), 1.5, Z(-3.58)); box(0.15, 0.5, 0.04, emis(0xff4a4a), X(5.2), 1.5, Z(-3.58));
      sbox(0.9, 0.9, 0.9, mat(0xb03a3a), X(5.2), 0.45, Z(3.3));
      scyl(0.05, 0.05, 1.9, steel, X(-2.4), 0.95, Z(-3.0), 8);
      ball(0.15, mat(0xcfe8ff, 0.3), X(-2.4), 1.8, Z(-3.0));
      sbox(1.2, 0.75, 0.8, wood, X(-5.0), 0.38, Z(3.2)); mug(X(-4.6), 0.82, Z(3.2), 0x8fd0a0); box(0.4, 0.04, 0.3, red, X(-5.3), 0.77, Z(3.2));
      stool(X(-3.5), Z(3.5), 0x9aa8b4); plant(X(-6.3), Z(3.7)); plant(X(3.3), Z(3.6));
      rug(X(3.6), Z(1.0), 2.6, 1.5, 0x4f7a6a);
      hangLamp(X(-4.3), Z(-0.4), 0xdff4ff, 2.5, 2.4); hangLamp(X(3.8), Z(-0.4), 0xdff4ff, 2.5, 2.0);
    },
    greenhouse: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      const soil = tmat(0x4a3a28, 'soil', 0xffffff, 1.6), leaf = mat(0x4fae48, 0.8), leaf2 = mat(0x7acb52, 0.8);
      for (const side of [-1, 1]) {
        for (const dz of [-3.4, -2.0, 2.0]) {
          sbox(4.0, 0.5, 1.0, soil, X(side * 4.0), 0.25, Z(dz));
          for (let k = 0; k < 4; k++) cone(0.28, 0.7, (k + (side > 0 ? 1 : 0)) % 2 ? leaf : leaf2, X(side * 4.0 - 1.5 + k * 1.0), 0.85, Z(dz));
        }
      }
      sbox(0.9, 0.9, 0.9, mat(0x3d6b8a), X(6.2), 0.45, Z(3.6));
      hangLamp(X(-4.0), Z(-2.7), 0xd36bff, 2.6, 2.8); hangLamp(X(4.0), Z(-2.7), 0xd36bff, 2.6, 2.8);
      hangLamp(X(-4.0), Z(2.4), 0xd36bff, 2.6, 2.4); hangLamp(X(4.0), Z(2.4), 0xd36bff, 2.6, 2.4);
      sbox(0.5, 0.4, 0.5, mat(0xa08a6a), X(0.2), 0.2, Z(3.8)); plant(X(-0.5), Z(3.7));
      cyl(0.12, 0.1, 0.3, mat(0x6a8aa0), X(1.3), 0.15, Z(3.6), 0, 10);
      stool(X(-6.4), Z(3.8), 0x7a5a3a);
    },
    vent: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      cyl(1.3, 1.3, 0.8, steel, X(0), 2.2, Z(-3.6), Math.PI / 2, 24);
      box(7.0, 0.8, 0.8, steel, X(0), 2.2, Z(-3.9));
      const tank = mat(0x3d6b8a, 0.5, 0.4);
      for (let i = 0; i < 3; i++) scyl(0.7, 0.7, 1.8, tank, X(-5.0 + i * 1.5), 0.9, Z(3.0), 18);
      sbox(1.6, 1.0, 1.0, dark, X(4.8), 0.5, Z(2.9));
      sbox(1.0, 1.6, 0.5, mat(0x2a3140), X(-5.8), 0.8, Z(-4.0));
      for (let i = 0; i < 4; i++) box(0.14, 0.14, 0.05, emis(i % 2 ? 0x44ff88 : 0xff5a4a), X(-5.9 + i * 0.22), 1.35, Z(-3.72));
      for (let i = 0; i < 4; i++) sbox(0.9, 0.9, 0.5, mat(0x606a74, 0.6, 0.5), X(3.2 + i * 1.0), 0.45 + (i % 2) * 0.01, Z(-4.0));
      cyl(0.12, 0.12, 8, steel, X(0), 1.8, Z(4.2), Math.PI / 2);
      hangLamp(X(-3.6), Z(-0.8), 0xaee8ff, 2.5, 2.2); hangLamp(X(4.2), Z(0.2), 0xaee8ff, 2.5, 2.0);
      plant(X(6.3), Z(3.9)); stool(X(-6.4), Z(2.6), 0x55606a);
    },
    airlock: r => {
      const X = (d: number) => r.cx + d, Z = (d: number) => r.cz + d;
      const hatch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.2, 12, 32), accent);
      geos.push(hatch.geometry); hatch.position.set(r.x1 - 0.5, 1.4, r.cz); hatch.rotation.y = Math.PI / 2; group.add(hatch);
      cyl(0.22, 0.22, 9, steel, X(-0.5), 1.5, Z(-3.8), Math.PI / 2);
      cyl(0.3, 0.3, 0.4, accent, X(-1.6), 1.5, Z(-3.8), Math.PI / 2, 6);
      sbox(1.0, 1.4, 1.0, mat(0x6b6a2a), X(-5.4), 0.7, Z(3.1));
      sbox(1.0, 1.4, 1.0, mat(0x6b6a2a), X(-4.2), 0.7, Z(3.1));
      for (let i = 0; i < 4; i++) { sbox(0.6, 1.8, 0.6, mat(0x4a5560, 0.6, 0.4), X(2.0 + i * 0.75), 0.9, Z(4.0)); box(0.05, 0.3, 0.02, emis(0x44ff88), X(2.0 + i * 0.75), 1.4, Z(3.68)); }
      sbox(2.0, 0.5, 0.6, wood, X(4.2), 0.25, Z(-3.7));
      stripes(X(6.2), Z(0), 0.9, 2.8);
      hangLamp(X(5.4), Z(0.1), 0xff5a4a, 2.6, 2.2);
      hangLamp(X(-3.6), Z(-1.0), 0xffc27a, 2.5, 2.0);
      const sign = cyl(0.45, 0.45, 0.04, emis(0xffd23a), X(6.7), 1.6, Z(-2.3), Math.PI / 2, 24); void sign;
      plant(X(3.0), Z(-2.6));
    }
  };
  ROOMS.forEach(r => props[r.id]?.(r));

  return {
    group, hemi, sun, roomFloors,
    dispose: () => {
      scene.remove(group);
      clearObstacles();
      geos.forEach(g => g.dispose());
      texs.forEach(t => t.dispose());
      mats.forEach(m => m.dispose());
      group.traverse(o => {
        if (o instanceof THREE.Sprite) { (o.material as THREE.SpriteMaterial).map?.dispose(); o.material.dispose(); }
        if (o instanceof THREE.Mesh && !geos.includes(o.geometry)) o.geometry.dispose();
      });
    }
  };
}
