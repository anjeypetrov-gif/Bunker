import * as THREE from 'three';

export interface Human {
  group: THREE.Group; body: THREE.Group; torso: THREE.Group; head: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; shinL: THREE.Group; shinR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; foreL: THREE.Group; foreR: THREE.Group;
  eyes: THREE.Mesh[]; wrench: THREE.Mesh; outfit: THREE.Group; phase: number; female: boolean;
  shirt: number; pants: number; hair: number; skin: number; sleeping: boolean;
}

// ---- текстуры одежды (необязательные: нет файла — остаётся цвет) ----
const clothCache = new Map<string, THREE.Texture | null>();
const clothWait = new Map<string, ((t: THREE.Texture) => void)[]>();
function withCloth(name: string, cb: (t: THREE.Texture) => void) {
  if (typeof Image === 'undefined') return;
  const have = clothCache.get(name);
  if (have) { cb(have); return; }
  if (have === null) return;
  if (clothWait.has(name)) { clothWait.get(name)!.push(cb); return; }
  clothWait.set(name, [cb]);
  new THREE.TextureLoader().load(`/tex/${name}.jpg`, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    clothCache.set(name, t); (clothWait.get(name) || []).forEach(f => f(t)); clothWait.delete(name);
  }, undefined, () => { clothCache.set(name, null); clothWait.delete(name); });
}
const fabric = (color: number, tex?: string, r = 0.8) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: r, metalness: 0.03 });
  if (tex) withCloth(tex, t => { m.map = t; m.needsUpdate = true; });
  return m;
};

const G = (geo: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) => {
  const me = new THREE.Mesh(geo, mt); me.position.set(x, y, z); me.castShadow = true; parent?.add(me); return me;
};
const caps = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 5, 10);
const pivot = (parent: THREE.Object3D, x: number, y: number, z = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };

export function makeHuman(scene: THREE.Scene, shirt: number, pants: number, hair: number, skin = 0xd9b89a, look: { female?: boolean; style?: number } = {}): Human {
  const female = !!look.female;
  const style = look.style ?? Math.floor(Math.random() * 3);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0 });
  const shirtM = fabric(shirt, 'cloth-knit');
  const pantsM = fabric(pants, 'cloth-workwear');
  const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
  const shoeM = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.7 });
  const sc = female ? 0.94 : 1;

  // таз и торс
  const hips = G(caps(0.2 * sc, 0.1), pantsM, 0, 0.98, 0, body); hips.scale.set(1.3, 0.9, 0.85);
  const torso = pivot(body, 0, 0.98);
  const chest = G(caps(0.22 * sc, 0.3), shirtM, 0, 0.42, 0, torso); chest.scale.set(female ? 1.15 : 1.3, 1, 0.82);
  if (female) G(new THREE.SphereGeometry(0.09, 10, 8), shirtM, 0, 0.45, 0.17, torso).scale.set(1.5, 1, 0.8);
  // шея и голова
  const neck = G(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 10), skinM, 0, 0.84, 0, torso);
  void neck;
  const head = pivot(torso, 0, 0.93);
  const skull = G(new THREE.SphereGeometry(0.235, 22, 18), skinM, 0, 0.17, 0, head); skull.scale.set(0.95, 1.07, 1);
  G(new THREE.SphereGeometry(0.06, 8, 6), skinM, -0.225, 0.14, 0, head).scale.set(0.5, 1, 0.8);
  G(new THREE.SphereGeometry(0.06, 8, 6), skinM, 0.225, 0.14, 0, head).scale.set(0.5, 1, 0.8);
  G(new THREE.SphereGeometry(0.045, 8, 6), skinM, 0, 0.1, 0.235, head); // нос
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x14171c });
  const eyes = [-0.085, 0.085].map(x => {
    const w = G(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2efe8 }), x, 0.2, 0.2, head); w.scale.set(1.1, 0.85, 0.5); w.castShadow = false;
    const e = G(new THREE.SphereGeometry(0.028, 8, 6), eyeM, 0, 0, 0.03, w); e.castShadow = false; return w;
  });
  const browM = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
  [-0.085, 0.085].forEach(x => G(new THREE.BoxGeometry(0.09, 0.016, 0.02), browM, x, 0.265, 0.205, head));
  G(new THREE.BoxGeometry(0.1, 0.014, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a4a42 }), 0, 0.035, 0.215, head);
  // причёска
  const cap = G(new THREE.SphereGeometry(0.255, 20, 14, 0, Math.PI * 2, 0, Math.PI * (style === 2 ? 0.5 : 0.56)), hairM, 0, 0.19, -0.015, head);
  cap.rotation.x = -0.18;
  if (female || style === 1) { G(caps(0.2, 0.22), hairM, 0, 0.0, -0.1, head).scale.set(1.1, 1, 0.6); }
  if (female && style === 0) G(new THREE.SphereGeometry(0.1, 10, 8), hairM, 0, 0.4, -0.12, head); // пучок
  // руки
  const mkArm = (sx: number) => {
    const sh = pivot(torso, sx * (female ? 0.31 : 0.35), 0.72);
    G(new THREE.SphereGeometry(0.095, 10, 8), shirtM, 0, 0, 0, sh);
    G(caps(0.075, 0.2), shirtM, 0, -0.17, 0, sh);
    const fore = pivot(sh, 0, -0.34);
    G(caps(0.065, 0.2), skinM, 0, -0.16, 0, fore);
    G(new THREE.SphereGeometry(0.07, 10, 8), skinM, 0, -0.31, 0, fore);
    return { sh, fore };
  };
  const aL = mkArm(-1), aR = mkArm(1);
  const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), new THREE.MeshStandardMaterial({ color: 0xaab2bd, metalness: 0.8, roughness: 0.3 }));
  wrench.position.set(0, -0.36, 0.1); wrench.visible = false; wrench.castShadow = true;
  aR.fore.add(wrench);
  // ноги
  const mkLeg = (sx: number) => {
    const hip = pivot(body, sx * 0.13, 0.95);
    G(caps(0.1 * sc, 0.28), pantsM, 0, -0.22, 0, hip);
    const shin = pivot(hip, 0, -0.46);
    G(caps(0.085 * sc, 0.28), pantsM, 0, -0.22, 0, shin);
    G(new THREE.BoxGeometry(0.17, 0.11, 0.3), shoeM, 0, -0.45, 0.05, shin);
    return { hip, shin };
  };
  const lL = mkLeg(-1), lR = mkLeg(1);
  const outfit = new THREE.Group(); body.add(outfit);
  scene.add(g);
  g.scale.setScalar(female ? 0.96 : 1);
  return {
    group: g, body, torso, head, legL: lL.hip, legR: lR.hip, shinL: lL.shin, shinR: lR.shin,
    armL: aL.sh, armR: aR.sh, foreL: aL.fore, foreR: aR.fore, eyes, wrench, outfit,
    phase: Math.random() * 6, female, shirt, pants, hair, skin, sleeping: false
  };
}

/** Одежда и аксессуары по профессии. Вызывается повторно — прежний наряд заменяется. */
export function dress(h: Human, prof: string) {
  while (h.outfit.children.length) { const c = h.outfit.children.pop()!; c.parent?.remove(c); }
  // аксессуары крепим к частям тела, поэтому собираем в отдельный список и храним в userData
  const old = (h.outfit.userData.items || []) as THREE.Object3D[];
  old.forEach(o => o.parent?.remove(o));
  const items: THREE.Object3D[] = [];
  const add = (parent: THREE.Object3D, o: THREE.Object3D) => { parent.add(o); items.push(o); return o; };
  const mk = (geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D, x: number, y: number, z: number, tex?: string, r = 0.75) => {
    const m = G(geo, fabric(color, tex, r), x, y, z); items.push(m); parent.add(m); return m;
  };
  const sh = h.female ? 0.94 : 1;
  const torso = h.torso, head = h.head;
  const coat = (color: number, tex: string, len = 0.55) => {
    const c = mk(caps(0.25 * sh, 0.5), color, torso, 0, 0.3, 0, tex); c.scale.set(1.32, 1, 0.9); c.position.y = 0.3;
    mk(new THREE.CylinderGeometry(0.31 * sh, 0.36 * sh, len, 14, 1, true), color, h.torso, 0, 0.02 - len / 2 + 0.1, 0, tex).material.side = THREE.DoubleSide;
  };
  const hat = (color: number, y = 0.4) => { mk(new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, head, 0, y - 0.15, 0, undefined, 0.5); mk(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 18), color, head, 0, y - 0.15, 0.06, undefined, 0.5); };
  const glasses = (color = 0x1b1f26) => { for (const x of [-0.085, 0.085]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.01, 6, 14), new THREE.MeshStandardMaterial({ color })); r.position.set(x, 0.2, 0.225); head.add(r); items.push(r); } };
  const apron = (color: number) => { mk(new THREE.BoxGeometry(0.42, 0.62, 0.04), color, torso, 0, 0.2, 0.2, 'cloth-apron'); };
  const vest = (color: number, tex: string) => { const v = mk(caps(0.235 * sh, 0.3), color, torso, 0, 0.42, 0.005, tex); v.scale.set(1.36, 1.02, 0.88); mk(new THREE.BoxGeometry(0.46, 0.05, 0.03), 0xe8e8d0, torso, 0, 0.33, 0.2); };
  switch (prof) {
    case 'Механик-дизелист': hat(0xf2c230); vest(0xd9731f, 'cloth-hivis'); break;
    case 'Радиоинженер связи': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 6, 22, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a2f38 })); band.position.set(0, 0.2, 0); band.rotation.z = 0; head.add(band); items.push(band);
      mk(new THREE.SphereGeometry(0.07, 8, 6), 0x2a2f38, head, -0.25, 0.15, 0); mk(new THREE.SphereGeometry(0.07, 8, 6), 0x2a2f38, head, 0.25, 0.15, 0);
      mk(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), 0x2a2f38, head, -0.2, 0.05, 0.12).rotation.z = 1.2;
      break;
    }
    case 'Врач скорой помощи': coat(0xf1f3f5, 'cloth-labcoat'); { const st = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14), new THREE.MeshStandardMaterial({ color: 0x2a2f38 })); st.position.set(0, 0.62, 0.17); torso.add(st); items.push(st); } break;
    case 'Медсестра-реаниматолог': mk(caps(0.245 * sh, 0.32), 0x6fb8b0, torso, 0, 0.42, 0.005, 'cloth-labcoat').scale.set(1.34, 1.02, 0.88); mk(new THREE.BoxGeometry(0.26, 0.09, 0.2), 0xffffff, head, 0, 0.42, 0.0); break;
    case 'Ботаник': hat(0xd9c27a, 0.42); apron(0x4f7a4a); break;
    case 'Биотехнолог-селекционер': coat(0xe9efe6, 'cloth-labcoat', 0.5); glasses(0x2a3a44); break;
    case 'Эколог-гидролог': vest(0x2d6aa8, 'cloth-workwear'); mk(new THREE.CylinderGeometry(0.255, 0.265, 0.1, 16), 0x2d6aa8, head, 0, 0.36, 0); break;
    case 'Инструктор по выживанию': mk(new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a5a35, head, 0, 0.24, -0.01, 'cloth-knit'); mk(new THREE.BoxGeometry(0.4, 0.5, 0.2), 0x55603a, torso, 0, 0.4, -0.24, 'cloth-camo'); break;
    case 'Логист-кладовщик': vest(0xe8892a, 'cloth-hivis'); mk(new THREE.BoxGeometry(0.2, 0.28, 0.02), 0xc9b896, torso, 0.28, 0.1, 0.18); break;
    case 'Юрист-арбитр': mk(caps(0.24 * sh, 0.3), 0x23262e, torso, 0, 0.42, 0.005, 'cloth-suit').scale.set(1.36, 1.02, 0.9); mk(new THREE.BoxGeometry(0.06, 0.34, 0.02), 0x9a2a2a, torso, 0, 0.5, 0.2); glasses(); break;
    case 'Хакер': { const hood = mk(new THREE.SphereGeometry(0.28, 14, 10), h.shirt, torso, 0, 0.9, -0.1, 'cloth-knit'); hood.scale.set(1.05, 0.9, 0.7); glasses(0x2a2f38); break; }
    case 'Криминалист': coat(0xb8a27a, 'cloth-leather', 0.62); mk(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 16), 0x4a3f2c, head, 0, 0.38, 0); break;
    case 'Пекарь-кондитер': mk(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 14), 0xffffff, head, 0, 0.48, 0); mk(new THREE.SphereGeometry(0.25, 14, 10), 0xffffff, head, 0, 0.62, 0).scale.set(1, 0.7, 1); apron(0xf4f4ee); break;
    default: break;
  }
  h.outfit.userData.items = items;
}

const lerpA = (cur: number, target: number, k: number) => cur + (target - cur) * k;

/** Анимация: ходьба с коленями и локтями, дыхание, взгляд по сторонам, моргание, жесты, сон. speed — пройденный путь за кадр. */
export function animate(h: Human, speed: number, t: number, working = false, panic = false, talk = false, sleep = false) {
  const k = 0.25;
  const blinkT = (t + h.phase * 2.3) % 3.8;
  const blink = blinkT < 0.12 ? 0.1 : 1;
  h.eyes.forEach(e => (e.scale.y = 0.85 * (sleep ? 0.1 : blink)));
  h.sleeping = sleep;
  if (sleep) {
    h.body.rotation.x = lerpA(h.body.rotation.x, -Math.PI / 2, 0.3);
    h.body.position.y = lerpA(h.body.position.y, 0.15, 0.3);
    h.torso.scale.y = 1 + Math.sin(t * 1.4 + h.phase) * 0.02;
    [h.armL, h.armR].forEach((a, i) => { a.rotation.x = lerpA(a.rotation.x, 0.1, k); a.rotation.z = (i ? -1 : 1) * 0.15; });
    [h.foreL, h.foreR].forEach(f => (f.rotation.x = lerpA(f.rotation.x, -0.4, k)));
    [h.legL, h.legR, h.shinL, h.shinR].forEach(l => (l.rotation.x = lerpA(l.rotation.x, 0, k)));
    h.head.rotation.set(0, 0.3, 0);
    return;
  }
  h.body.rotation.x = lerpA(h.body.rotation.x, 0, 0.3);
  h.body.position.y = lerpA(h.body.position.y, 0, 0.3);
  h.armL.rotation.z = lerpA(h.armL.rotation.z, 0.06, k); h.armR.rotation.z = lerpA(h.armR.rotation.z, -0.06, k);
  if (working) {
    const s = Math.sin(t * 11);
    h.armR.rotation.x = -1.35 + s * 0.4; h.foreR.rotation.x = -0.9 + s * 0.3;
    h.armL.rotation.x = -0.95 + Math.sin(t * 11 + 1) * 0.2; h.foreL.rotation.x = -0.8;
    h.legL.rotation.x = lerpA(h.legL.rotation.x, 0.15, k); h.legR.rotation.x = lerpA(h.legR.rotation.x, -0.25, k);
    h.shinL.rotation.x = 0.1; h.shinR.rotation.x = 0.35;
    h.torso.rotation.x = 0.22 + s * 0.06; h.torso.rotation.y = s * 0.1;
    h.head.rotation.set(0.15, 0, 0);
    h.group.position.y = 0;
    return;
  }
  h.phase += speed * 2.6;
  const amt = Math.min(1, speed * 14);
  const sw = Math.sin(h.phase) * amt;
  const lift = (p: number) => Math.max(0, Math.sin(p)) * amt;
  h.legL.rotation.x = sw * 0.75; h.legR.rotation.x = -sw * 0.75;
  h.shinL.rotation.x = 0.1 * amt + lift(h.phase + 1.9) * 0.9; h.shinR.rotation.x = 0.1 * amt + lift(h.phase + 1.9 + Math.PI) * 0.9;
  h.torso.rotation.y = lerpA(h.torso.rotation.y, Math.sin(h.phase) * 0.14 * amt, 0.3);
  h.torso.rotation.x = lerpA(h.torso.rotation.x, amt * 0.05, 0.3);
  h.torso.scale.y = 1 + Math.sin(t * 1.7 + h.phase * 0.3) * 0.012;
  if (panic) {
    h.armL.rotation.x = -2.6 + Math.sin(t * 16) * 0.3; h.armR.rotation.x = -2.6 + Math.sin(t * 16 + 1.5) * 0.3;
    h.foreL.rotation.x = -0.3; h.foreR.rotation.x = -0.3;
    h.head.rotation.set(0, Math.sin(t * 14) * 0.4, 0);
  } else if (talk && amt < 0.2) {
    h.armR.rotation.x = -0.9 + Math.sin(t * 5 + h.phase) * 0.35; h.foreR.rotation.x = -1.1 + Math.sin(t * 5.5) * 0.25;
    h.armL.rotation.x = lerpA(h.armL.rotation.x, -0.15, k); h.foreL.rotation.x = lerpA(h.foreL.rotation.x, -0.25, k);
    h.head.rotation.set(Math.sin(t * 6) * 0.07, Math.sin(t * 0.9 + h.phase) * 0.25, 0);
  } else {
    h.armL.rotation.x = -sw * 0.85; h.armR.rotation.x = sw * 0.85;
    h.foreL.rotation.x = -0.15 - amt * 0.5 * Math.max(0, Math.sin(h.phase + 0.5)) - 0.05;
    h.foreR.rotation.x = -0.15 - amt * 0.5 * Math.max(0, -Math.sin(h.phase + 0.5)) - 0.05;
    // взгляд по сторонам, пока стоит
    h.head.rotation.set(Math.sin(t * 0.7 + h.phase) * 0.04, Math.sin(t * 0.45 + h.phase) * 0.4 * (1 - amt), 0);
  }
  h.group.position.y = Math.abs(Math.sin(h.phase)) * amt * 0.05;
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
