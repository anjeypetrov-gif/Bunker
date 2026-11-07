import * as THREE from 'three';
import { ROOMS, WALLS, DOORS, WALL_T, CW, CD, type Room } from './layout';
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
  const group = new THREE.Group();
  scene.add(group);
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mat = (c: number, r = 0.85, m = 0.1, emissive = 0x000000) => {
    const mt = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive });
    mats.push(mt); return mt;
  };
  const box = (w: number, h: number, d: number, mt: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); geos.push(g);
    const me = new THREE.Mesh(g, mt); me.position.set(x, y, z); me.rotation.y = ry; group.add(me); return me;
  };
  const cyl = (rt: number, rb: number, h: number, mt: THREE.Material, x: number, y: number, z: number, rz = 0, seg = 16) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); geos.push(g);
    const me = new THREE.Mesh(g, mt); me.position.set(x, y, z); me.rotation.z = rz; group.add(me); return me;
  };

  scene.fog = new THREE.Fog(theme.fog, 24, 60);
  const hemi = new THREE.HemisphereLight(0x9fb2cc, 0x1a1410, 0.95);
  const sun = new THREE.DirectionalLight(theme.lamp, 0.75);
  sun.position.set(6, 22, 8);
  group.add(hemi, sun);

  const wallMat = mat(theme.wall, 0.8, 0.15);
  const floorBase = new THREE.Color(theme.floor);
  const dark = mat(0x1d2128);
  const steel = mat(0x6b7480, 0.45, 0.7);
  const accent = mat(theme.accent, 0.5, 0.2);
  const wood = mat(0x5a4a33);

  // Полы комнат
  const roomFloors: Record<string, THREE.Mesh> = {};
  ROOMS.forEach((r, i) => {
    const g = new THREE.BoxGeometry(CW, 0.2, CD); geos.push(g);
    const c = floorBase.clone().offsetHSL(0, 0, ((i % 3) - 1) * 0.012);
    const mt = mat(c.getHex(), 0.9, 0.2);
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

  // Реквизит комнат
  const props: Record<string, (r: Room) => void> = {
    workshop: r => {
      box(4.2, 0.9, 1.2, wood, r.cx - 3.6, 0.45, r.z0 + 1.2);
      box(0.4, 0.5, 0.4, steel, r.cx - 4.6, 1.15, r.z0 + 1.2);
      box(2.4, 1.6, 0.4, dark, r.cx + 3.8, 0.8, r.z0 + 0.6);
      cyl(0.5, 0.5, 1.1, mat(0x7a3b2e), r.cx + 5.8, 0.55, r.z1 - 1.2);
      cyl(0.5, 0.5, 1.1, mat(0x7a3b2e), r.cx + 5.8, 0.55, r.z1 - 2.4);
      box(1.4, 0.8, 1.4, steel, r.cx - 5.2, 0.4, r.z1 - 1.6);
    },
    generator: r => {
      cyl(0.9, 0.9, 2.0, steel, r.cx - 1.4, 1.0, r.z0 + 2.0);
      cyl(0.9, 0.9, 2.0, steel, r.cx + 1.4, 1.0, r.z0 + 2.0);
      box(4.4, 0.4, 1.6, dark, r.cx, 0.2, r.z0 + 2.0);
      box(2.6, 1.7, 0.4, accent, r.cx, 0.95, r.z0 + 0.8);
      cyl(0.18, 0.18, 6, steel, r.cx + 4.5, 2.2, r.z0 + 0.8, Math.PI / 2);
      box(1.2, 0.8, 1.2, wood, r.cx - 5.4, 0.4, r.z1 - 1.4);
    },
    radio: r => {
      box(4.2, 0.85, 1.2, wood, r.cx, 0.42, r.z0 + 1.0);
      for (const dx of [-1.3, 0, 1.3]) box(0.9, 0.6, 0.1, mat(0x103050, 0.4, 0.1, 0x1a4a8a), r.cx + dx, 1.35, r.z0 + 0.9);
      cyl(0.08, 0.1, 4.5, steel, r.cx + 5.2, 2.2, r.z0 + 1.0);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), steel);
      geos.push(dish.geometry); dish.position.set(r.cx + 5.2, 4.1, r.z0 + 1.0); dish.rotation.x = -1.0; group.add(dish);
      box(1.2, 1.1, 1.2, dark, r.cx - 5.2, 0.55, r.z1 - 1.4);
    },
    storage: r => {
      const crate = mat(0x6b5a3c);
      [[-5, 1], [-5, 2.2], [-3.8, 1], [5.2, 1], [5.2, 2.2], [4, 1.1]].forEach(([dx, dz], i) => {
        box(1.1, 1.0, 1.1, crate, r.cx + dx, 0.5, r.z0 + dz + (i === 3 ? 4 : 0));
        if (i % 2 === 0) box(1.0, 0.9, 1.0, crate, r.cx + dx, 1.45, r.z0 + dz + (i === 3 ? 4 : 0));
      });
      box(0.5, 2.0, 5, dark, r.x1 - 0.5, 1.0, r.cz);
      box(0.4, 0.3, 4.6, wood, r.x1 - 0.5, 1.0, r.cz);
    },
    hub: r => {
      const bed = mat(0x3a3f47), sheet = mat(0x5a6577);
      for (let i = 0; i < 3; i++) {
        box(2.4, 0.4, 1.0, bed, r.cx - 4.8, 0.4, r.z0 + 1.2 + i * 2.6);
        box(2.2, 0.15, 0.9, sheet, r.cx - 4.8, 0.7, r.z0 + 1.2 + i * 2.6);
      }
      box(2.6, 0.12, 1.4, mat(0x55504a), r.cx + 3.6, 0.8, r.cz + 0.4);
      for (const [dx, dz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) box(0.12, 0.8, 0.12, dark, r.cx + 3.6 + dx, 0.4, r.cz + 0.4 + dz);
      const hatch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.13, 10, 28), accent);
      geos.push(hatch.geometry); hatch.position.set(r.cx, 1.25, r.z0 + 0.35); group.add(hatch);
    },
    medical: r => {
      const sheet = mat(0xdfe6ee, 0.9);
      for (let i = 0; i < 3; i++) {
        box(1.0, 0.4, 2.2, mat(0x4a5560), r.cx - 4.6 + i * 2.2, 0.4, r.z0 + 1.6);
        box(0.9, 0.15, 2.0, sheet, r.cx - 4.6 + i * 2.2, 0.68, r.z0 + 1.6);
      }
      box(1.2, 1.9, 0.6, mat(0xcfd6dd), r.cx + 5.2, 0.95, r.z0 + 0.6);
      box(0.9, 0.9, 0.9, mat(0xb03a3a), r.cx + 5.2, 0.45, r.z1 - 1.2);
    },
    greenhouse: r => {
      const soil = mat(0x4a3a28), leaf = mat(0x4fae48, 0.8);
      for (let i = 0; i < 3; i++) {
        box(8.0, 0.5, 1.1, soil, r.cx, 0.25, r.z0 + 1.1 + i * 1.4);
        for (let k = -3; k <= 3; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 6), leaf);
          geos.push(c.geometry); c.position.set(r.cx + k * 1.1, 0.85, r.z0 + 1.1 + i * 1.4); group.add(c);
        }
      }
      box(0.9, 0.9, 0.9, mat(0x3d6b8a), r.cx + 5.4, 0.45, r.z1 - 1.2);
    },
    vent: r => {
      cyl(1.3, 1.3, 0.8, steel, r.cx, 2.2, r.z0 + 0.9, Math.PI / 2, 24);
      box(7.0, 0.8, 0.8, steel, r.cx, 2.2, r.z0 + 0.6);
      const tank = mat(0x3d6b8a, 0.5, 0.4);
      for (let i = 0; i < 3; i++) cyl(0.7, 0.7, 1.8, tank, r.cx - 4.6 + i * 1.8, 0.9, r.z1 - 1.5);
      box(1.6, 1.0, 1.0, dark, r.cx + 4.8, 0.5, r.cz + 1);
    },
    airlock: r => {
      const hatch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.2, 12, 32), accent);
      geos.push(hatch.geometry); hatch.position.set(r.x1 - 0.5, 1.4, r.cz); hatch.rotation.y = Math.PI / 2; group.add(hatch);
      cyl(0.22, 0.22, 9, steel, r.cx - 0.5, 1.5, r.z0 + 0.7, Math.PI / 2);
      cyl(0.3, 0.3, 0.4, accent, r.cx - 1.6, 1.5, r.z0 + 0.7, Math.PI / 2, 6);
      box(1.0, 1.4, 1.0, mat(0x6b6a2a), r.cx - 5.4, 0.7, r.z1 - 1.4);
      box(1.0, 1.4, 1.0, mat(0x6b6a2a), r.cx - 4.2, 0.7, r.z1 - 1.4);
    }
  };
  ROOMS.forEach(r => props[r.id]?.(r));

  return {
    group, hemi, sun, roomFloors,
    dispose: () => {
      scene.remove(group);
      geos.forEach(g => g.dispose());
      mats.forEach(m => m.dispose());
      group.traverse(o => {
        if (o instanceof THREE.Sprite) { (o.material as THREE.SpriteMaterial).map?.dispose(); o.material.dispose(); }
        if (o instanceof THREE.Mesh && !geos.includes(o.geometry)) o.geometry.dispose();
      });
    }
  };
}
