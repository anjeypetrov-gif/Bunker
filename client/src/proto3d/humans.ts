import * as THREE from 'three';

export interface Human {
  group: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  wrench: THREE.Mesh; phase: number;
}

export function makeHuman(scene: THREE.Scene, shirt: number, pants: number, hair: number, skin = 0xd9b89a): Human {
  const g = new THREE.Group();
  const m = (c: number, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number) => {
    const me = new THREE.Mesh(geo, mt); me.position.set(x, y, z); parent.add(me); return me;
  };
  add(g, new THREE.BoxGeometry(0.62, 0.72, 0.34), m(shirt), 0, 1.38, 0);
  add(g, new THREE.BoxGeometry(0.58, 0.22, 0.32), m(pants), 0, 0.93, 0);
  add(g, new THREE.CylinderGeometry(0.09, 0.1, 0.12, 8), m(skin), 0, 1.8, 0);
  add(g, new THREE.SphereGeometry(0.24, 18, 14), m(skin), 0, 2.0, 0);
  const hairM = add(g, new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), m(hair, 0.9), 0, 2.03, -0.02);
  hairM.rotation.x = -0.15;
  add(g, new THREE.BoxGeometry(0.06, 0.08, 0.08), m(skin), 0, 1.98, 0.24);
  const mkLeg = (x: number) => {
    const pv = new THREE.Group(); pv.position.set(x, 0.88, 0); g.add(pv);
    add(pv, new THREE.BoxGeometry(0.24, 0.48, 0.26), m(pants), 0, -0.24, 0);
    add(pv, new THREE.BoxGeometry(0.22, 0.4, 0.24), m(pants), 0, -0.64, 0);
    add(pv, new THREE.BoxGeometry(0.24, 0.12, 0.38), m(0x20242b), 0, -0.86, 0.06);
    return pv;
  };
  const legL = mkLeg(-0.16), legR = mkLeg(0.16);
  const mkArm = (x: number) => {
    const pv = new THREE.Group(); pv.position.set(x, 1.68, 0); g.add(pv);
    add(pv, new THREE.BoxGeometry(0.17, 0.42, 0.2), m(shirt), 0, -0.2, 0);
    add(pv, new THREE.BoxGeometry(0.15, 0.4, 0.17), m(skin), 0, -0.58, 0);
    return pv;
  };
  const armL = mkArm(-0.4), armR = mkArm(0.4);
  const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), new THREE.MeshStandardMaterial({ color: 0xaab2bd, metalness: 0.8, roughness: 0.3 }));
  wrench.position.set(0, -0.85, 0.12);
  wrench.visible = false;
  armR.add(wrench);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, wrench, phase: Math.random() * 6 };
}

export function animate(h: Human, speed: number, t: number, working = false, panic = false) {
  if (working) {
    h.armR.rotation.x = -1.3 + Math.sin(t * 12) * 0.35;
    h.armL.rotation.x = -0.9 + Math.sin(t * 12 + 1) * 0.15;
    h.legL.rotation.x = h.legR.rotation.x = 0;
    h.group.position.y = 0;
    return;
  }
  h.phase += speed * 2.6;
  const amt = Math.min(1, speed * 14);
  const sw = Math.sin(h.phase) * amt * 0.7;
  h.legL.rotation.x = sw; h.legR.rotation.x = -sw;
  if (panic) {
    h.armL.rotation.x = -2.6 + Math.sin(t * 16) * 0.3;
    h.armR.rotation.x = -2.6 + Math.sin(t * 16 + 1.5) * 0.3;
  } else {
    h.armL.rotation.x = -sw * 0.8; h.armR.rotation.x = sw * 0.8;
  }
  h.group.position.y = Math.abs(Math.sin(h.phase)) * amt * 0.06;
}

export interface Bubble { sp: THREE.Sprite; c: HTMLCanvasElement; tex: THREE.CanvasTexture; text: string; ttl: number }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function makeBubble(parent: THREE.Object3D, y = 2.9): Bubble {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 90;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(3.6, 0.9, 1);
  sp.position.y = y;
  sp.renderOrder = 20;
  sp.visible = false;
  parent.add(sp);
  return { sp, c, tex, text: '', ttl: 0 };
}

export function say(b: Bubble, text: string, ttl = 2.4) {
  if (b.text !== text) {
    b.text = text;
    const ctx = b.c.getContext('2d')!;
    ctx.clearRect(0, 0, b.c.width, b.c.height);
    let size = 34;
    ctx.font = `bold ${size}px sans-serif`;
    while (ctx.measureText(text).width > 320 && size > 18) { size -= 2; ctx.font = `bold ${size}px sans-serif`; }
    ctx.fillStyle = 'rgba(12,16,24,0.92)';
    roundRect(ctx, 6, 6, 348, 62, 16); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#f59e0b'; ctx.stroke();
    ctx.fillStyle = '#fde68a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 180, 38);
    ctx.fillStyle = 'rgba(12,16,24,0.92)';
    ctx.beginPath(); ctx.moveTo(165, 66); ctx.lineTo(180, 86); ctx.lineTo(195, 66); ctx.fill();
    b.tex.needsUpdate = true;
  }
  b.ttl = ttl;
  b.sp.visible = true;
}

export function tickBubble(b: Bubble, dt: number) {
  if (b.ttl > 0) { b.ttl -= dt; if (b.ttl <= 0) { b.sp.visible = false; b.text = ''; } }
}

/** Подпись/иконка в пространстве (название комнаты, эмодзи аварии). */
export function makeLabel(text: string, w: number, h: number, font: string, color = '#cbd5e1', bg = 'rgba(10,14,20,0.55)'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * (h / w));
  const ctx = c.getContext('2d')!;
  if (bg) { ctx.fillStyle = bg; roundRect(ctx, 4, 4, c.width - 8, c.height - 8, 20); ctx.fill(); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const m = font.match(/(\d+)px/);
  let px = m ? parseInt(m[1], 10) : 40;
  const fam = font.replace(/\d+px/, '{px}px');
  ctx.font = fam.replace('{px}', String(px));
  while (ctx.measureText(text).width > c.width - 36 && px > 14) { px -= 2; ctx.font = fam.replace('{px}', String(px)); }
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.renderOrder = 15;
  sp.scale.set(w, h, 1);
  return sp;
}
