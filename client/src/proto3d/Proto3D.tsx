import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Прототип 3D-режима «Бункер»: один отсек, протечка, починка гайки.
 * Локальный (без сети): цель — проверить ощущения, управление на телефоне и идею
 * «карты дают действия в пространстве».
 */

type Loadout = 'pro' | 'wrench' | 'none';

const LOADOUTS: { id: Loadout; label: string; hint: string }[] = [
  { id: 'pro', label: 'Сантехник + ящик инструментов', hint: 'Чинит быстро' },
  { id: 'wrench', label: 'Только ящик инструментов', hint: 'Чинит медленно' },
  { id: 'none', label: 'Без навыков и инструмента', hint: 'Нечем закрутить гайку' }
];

interface Hud {
  flood: number;
  progress: number;
  near: boolean;
  leak: boolean;
  msg: string;
  fixed: number;
  failed: boolean;
}

const ROOM_W = 15;
const ROOM_D = 10;
const SPEED = 4.6;

export const Proto3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ flood: 0, progress: 0, near: false, leak: false, msg: 'Осмотрись в отсеке', fixed: 0, failed: false });
  const [loadout, setLoadout] = useState<Loadout>('pro');
  const loadoutRef = useRef<Loadout>('pro');
  const holdRef = useRef(false);
  const joyRef = useRef({ x: 0, y: 0 });
  const resetRef = useRef<() => void>(() => {});
  const joyBase = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [cardsOpen, setCardsOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => { loadoutRef.current = loadout; }, [loadout]);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x07090d);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07090d, 14, 30);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    let camScale = 1;
    const cam = { yaw: 0, pitch: 0.95, dist: 11 };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camScale = Math.max(1, 1.15 / camera.aspect);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    // ---------- Свет ----------
    scene.add(new THREE.HemisphereLight(0x8fa3c0, 0x1a1410, 0.75));
    const lamp = new THREE.PointLight(0xffa23a, 28, 22, 1.6);
    lamp.position.set(0, 3.6, 0);
    scene.add(lamp);
    const lamp2 = new THREE.PointLight(0xff7a2a, 10, 12, 1.8);
    lamp2.position.set(-5, 3, -3);
    scene.add(lamp2);

    // ---------- Материалы ----------
    const mat = (c: number, r = 0.85, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const floorMat = mat(0x2b3039, 0.9, 0.2);
    const wallMat = mat(0x424a55, 0.8, 0.15);
    const darkMat = mat(0x1d2128);
    const pipeMat = mat(0x6b7480, 0.45, 0.7);
    const orangeMat = mat(0xe8a33d, 0.5, 0.2);
    const crateMat = mat(0x5a4a33);

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    // Пол и стены
    const floor = box(ROOM_W, 0.2, ROOM_D, floorMat, 0, -0.1, 0);
    floor.receiveShadow = false;
    box(ROOM_W, 3.4, 0.3, wallMat, 0, 1.7, -ROOM_D / 2);
    box(0.3, 3.4, ROOM_D, wallMat, -ROOM_W / 2, 1.7, 0);
    box(0.3, 3.4, ROOM_D, wallMat, ROOM_W / 2, 1.7, 0);
    // Рёбра жёсткости на задней стене
    for (let i = -3; i <= 3; i++) box(0.25, 3.4, 0.2, darkMat, i * 2.1, 1.7, -ROOM_D / 2 + 0.2);
    // Полосы пола
    for (let i = -3; i <= 3; i++) box(0.05, 0.02, ROOM_D, darkMat, i * 2.1, 0.01, 0);

    // Мебель: нары, ящики, стол
    box(2.4, 0.5, 1, mat(0x3a3f47), -5.2, 0.35, 3.6);
    box(2.4, 0.5, 1, mat(0x3a3f47), -5.2, 1.5, 3.6);
    box(0.12, 1.9, 0.12, darkMat, -6.3, 0.95, 3.2);
    box(0.12, 1.9, 0.12, darkMat, -4.1, 0.95, 3.2);
    box(1, 0.9, 1, crateMat, 5.8, 0.45, 3.4);
    box(1, 0.9, 1, crateMat, 5.8, 1.35, 3.4);
    box(0.9, 0.7, 0.9, crateMat, 4.7, 0.35, 3.8);
    box(2, 0.1, 1.1, mat(0x55504a), 4, 0.8, -1.5);
    box(0.12, 0.8, 0.12, darkMat, 3.1, 0.4, -1.9);
    box(0.12, 0.8, 0.12, darkMat, 4.9, 0.4, -1.9);
    box(0.12, 0.8, 0.12, darkMat, 3.1, 0.4, -1.1);
    box(0.12, 0.8, 0.12, darkMat, 4.9, 0.4, -1.1);
    // Люк
    const hatch = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 12, 36), orangeMat);
    hatch.position.set(ROOM_W / 2 - 0.25, 1.6, -1);
    hatch.rotation.y = Math.PI / 2;
    scene.add(hatch);

    // Труба вдоль задней стены + стыки
    const pipeY = 2.3, pipeZ = -ROOM_D / 2 + 0.55;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, ROOM_W - 1, 16), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, pipeY, pipeZ);
    scene.add(pipe);
    const joints: THREE.Vector3[] = [];
    for (const x of [-5, -1.6, 2, 5.4]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 6), orangeMat);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(x, pipeY, pipeZ);
      scene.add(ring);
      joints.push(new THREE.Vector3(x, pipeY, pipeZ));
    }

    // ---------- Протечка ----------
    const MAX = 70;
    const pPos = new Float32Array(MAX * 3);
    const pVel = new Float32Array(MAX * 3);
    const pLife = new Float32Array(MAX);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const spray = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x6fd0ff, size: 0.14, transparent: true, opacity: 0.9 }));
    spray.frustumCulled = false;
    spray.visible = false;
    scene.add(spray);
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0x2a8fd0, transparent: true, opacity: 0.55 })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.03;
    puddle.visible = false;
    scene.add(puddle);
    const leakMark = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
    leakMark.visible = false;
    scene.add(leakMark);

    const standMark = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: 0x5ee08a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    standMark.rotation.x = -Math.PI / 2;
    standMark.position.y = 0.05;
    standMark.visible = false;
    scene.add(standMark);

    // ---------- Персонажи ----------
    interface Human {
      group: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
      wrench: THREE.Mesh; phase: number;
    }
    const makeHuman = (shirt: number, pants: number, hair: number, skin = 0xd9b89a): Human => {
      const g = new THREE.Group();
      const m = (c: number, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });
      const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number) => {
        const me = new THREE.Mesh(geo, mt); me.position.set(x, y, z); parent.add(me); return me;
      };
      // Торс, таз, шея, голова, волосы
      add(g, new THREE.BoxGeometry(0.62, 0.72, 0.34), m(shirt), 0, 1.38, 0);
      add(g, new THREE.BoxGeometry(0.58, 0.22, 0.32), m(pants), 0, 0.93, 0);
      add(g, new THREE.CylinderGeometry(0.09, 0.1, 0.12, 8), m(skin), 0, 1.8, 0);
      add(g, new THREE.SphereGeometry(0.24, 18, 14), m(skin), 0, 2.0, 0);
      const hairM = add(g, new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), m(hair, 0.9), 0, 2.03, -0.02);
      hairM.rotation.x = -0.15;
      // Нос — чтобы было видно, куда смотрит
      add(g, new THREE.BoxGeometry(0.06, 0.08, 0.08), m(skin), 0, 1.98, 0.24);
      // Ноги (пивот в бедре)
      const mkLeg = (x: number) => {
        const pv = new THREE.Group(); pv.position.set(x, 0.88, 0); g.add(pv);
        add(pv, new THREE.BoxGeometry(0.24, 0.48, 0.26), m(pants), 0, -0.24, 0);
        add(pv, new THREE.BoxGeometry(0.22, 0.4, 0.24), m(pants), 0, -0.64, 0);
        add(pv, new THREE.BoxGeometry(0.24, 0.12, 0.38), m(0x20242b), 0, -0.86, 0.06);
        return pv;
      };
      const legL = mkLeg(-0.16), legR = mkLeg(0.16);
      // Руки (пивот в плече)
      const mkArm = (x: number) => {
        const pv = new THREE.Group(); pv.position.set(x, 1.68, 0); g.add(pv);
        add(pv, new THREE.BoxGeometry(0.17, 0.42, 0.2), m(shirt), 0, -0.2, 0);
        add(pv, new THREE.BoxGeometry(0.15, 0.4, 0.17), m(skin), 0, -0.58, 0);
        return pv;
      };
      const armL = mkArm(-0.4), armR = mkArm(0.4);
      // Гаечный ключ в правой руке (виден только у игрока с инструментом)
      const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), new THREE.MeshStandardMaterial({ color: 0xaab2bd, metalness: 0.8, roughness: 0.3 }));
      wrench.position.set(0, -0.85, 0.12);
      wrench.visible = false;
      armR.add(wrench);
      scene.add(g);
      return { group: g, legL, legR, armL, armR, wrench, phase: Math.random() * 6 };
    };
    const animate = (h: Human, speed: number, t: number, working = false) => {
      if (working) {
        h.armR.rotation.x = -1.3 + Math.sin(t * 12) * 0.35;
        h.armL.rotation.x = -0.9 + Math.sin(t * 12 + 1) * 0.15;
        h.legL.rotation.x = h.legR.rotation.x = 0;
        return;
      }
      h.phase += speed * 2.6;
      const sw = Math.sin(h.phase) * Math.min(1, speed * 14) * 0.7;
      h.legL.rotation.x = sw; h.legR.rotation.x = -sw;
      h.armL.rotation.x = -sw * 0.8; h.armR.rotation.x = sw * 0.8;
      h.group.position.y = Math.abs(Math.sin(h.phase)) * Math.min(1, speed * 14) * 0.06;
    };
    const playerH = makeHuman(0xe8a33d, 0x30363f, 0x3a2a1c);
    const player = playerH.group;
    player.position.set(0, 0, 2);
    const npcH = [
      makeHuman(0x4d78a6, 0x2b2f36, 0xc9b27a, 0xc99c7c),
      makeHuman(0x6f8f5e, 0x3a3326, 0x1b1b1b, 0xe2c2a2)
    ];
    const npcHome = [new THREE.Vector3(-2.5, 0, -1.2), new THREE.Vector3(2.4, 0, 1)];
    npcH[0].group.position.copy(npcHome[0]);
    npcH[1].group.position.copy(npcHome[1]);
    const npcPrev = npcH.map(n => n.group.position.clone());

    // ---------- Состояние ----------
    const S = {
      leak: null as THREE.Vector3 | null,
      leakAt: 3, // секунды до первой протечки
      flood: 0,
      progress: 0,
      fixed: 0,
      failed: false,
      msg: 'Осмотрись в отсеке',
      time: 0
    };
    // Вращение камеры: перетаскивание мышью/пальцем, колёсико — масштаб
    let drag: { x: number; y: number; id: number } | null = null;
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    const pd = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dom.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      cam.yaw -= (e.clientX - drag.x) * 0.008;
      cam.pitch = Math.max(0.35, Math.min(1.4, cam.pitch + (e.clientY - drag.y) * 0.006));
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const pu = () => { drag = null; };
    const wh = (e: WheelEvent) => { e.preventDefault(); cam.dist = Math.max(5, Math.min(17, cam.dist + e.deltaY * 0.01)); };
    dom.addEventListener('pointerdown', pd);
    dom.addEventListener('pointermove', pm);
    dom.addEventListener('pointerup', pu);
    dom.addEventListener('pointercancel', pu);
    dom.addEventListener('wheel', wh, { passive: false });
    dom.style.cursor = 'grab';
    const keys: Record<string, boolean> = {};
    const onKey = (e: KeyboardEvent, v: boolean) => {
      keys[e.code] = v;
      if (e.code === 'KeyE') holdRef.current = v;
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    resetRef.current = () => {
      S.leak = null; S.leakAt = 2; S.flood = 0; S.progress = 0; S.fixed = 0; S.failed = false;
      S.msg = 'Осмотрись в отсеке';
      player.position.set(0, 0, 2);
    };

    const spawnLeak = () => {
      S.leak = joints[Math.floor(Math.random() * joints.length)].clone();
      S.progress = 0;
      S.msg = 'Протечка! Встань на зелёный круг у трубы';
      for (let i = 0; i < MAX; i++) pLife[i] = 0;
    };

    // ---------- Цикл ----------
    const clock = new THREE.Clock();
    let raf = 0, hudTimer = 0;
    const tmp = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      S.time += dt;

      // Движение игрока
      let ix = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
      let iz = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
      ix += joyRef.current.x; iz += joyRef.current.y;
      const len = Math.hypot(ix, iz);
      const holdingFix = holdRef.current;
      let moveSpeed = 0;
      if (len > 0.08 && !S.failed) {
        const k = Math.min(1, len) / len;
        const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
        const wx = (ix * cy + iz * sy) * k, wz = (-ix * sy + iz * cy) * k;
        player.position.x += wx * SPEED * dt;
        player.position.z += wz * SPEED * dt;
        // плавный поворот лицом по ходу
        const targetRot = Math.atan2(wx, wz);
        let dr = targetRot - player.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        player.rotation.y += dr * Math.min(1, dt * 12);
        moveSpeed = Math.min(1, len) * SPEED * dt;
      }
      player.position.x = Math.max(-ROOM_W / 2 + 0.7, Math.min(ROOM_W / 2 - 0.7, player.position.x));
      player.position.z = Math.max(-ROOM_D / 2 + 1.5, Math.min(ROOM_D / 2 - 0.7, player.position.z));

      // Жители бродят вокруг своих мест, при протечке суетятся быстрее
      npcH.forEach((n, i) => {
        const panic = S.leak ? 1.8 : 0.5;
        const ang = S.time * 0.45 * panic + i * 2.1;
        const tx = npcHome[i].x + Math.cos(ang) * 1.6;
        const tz = npcHome[i].z + Math.sin(ang * 1.3) * 1.1;
        n.group.position.x += (tx - n.group.position.x) * Math.min(1, dt * 1.2);
        n.group.position.z += (tz - n.group.position.z) * Math.min(1, dt * 1.2);
        const dx = n.group.position.x - npcPrev[i].x, dz = n.group.position.z - npcPrev[i].z;
        const sp = Math.hypot(dx, dz);
        if (sp > 0.0005) n.group.rotation.y = Math.atan2(dx, dz);
        npcPrev[i].copy(n.group.position);
        animate(n, sp, S.time);
      });

      // Спавн протечки
      if (!S.leak && !S.failed) {
        S.leakAt -= dt;
        if (S.leakAt <= 0) spawnLeak();
      }

      // Протечка и починка
      let near = false;
      if (S.leak) {
        const target = new THREE.Vector3(S.leak.x, 0, S.leak.z + 1.4);
        near = player.position.distanceTo(target) < 2.3;
        standMark.position.set(target.x, 0.05, target.z);
        standMark.scale.setScalar(1 + Math.sin(S.time * 6) * 0.1);
        const lo = loadoutRef.current;
        const canFix = lo !== 'none';
        const rate = lo === 'pro' ? 0.34 : lo === 'wrench' ? 0.15 : 0;
        if (near && holdingFix && canFix && !S.failed) {
          S.progress = Math.min(1, S.progress + rate * dt);
          S.msg = 'Закручиваю гайку…';
        } else {
          S.progress = Math.max(0, S.progress - 0.12 * dt);
          if (near && !canFix) S.msg = 'Нечем закрутить гайку: нужен ящик инструментов';
          else if (near) S.msg = 'Зажми «Закрутить гайку» (или E)';
          else if (!S.failed) S.msg = 'Протечка! Встань на зелёный круг у трубы';
        }
        if (S.progress >= 1) {
          S.leak = null; S.fixed += 1; S.leakAt = 4; S.progress = 0;
          S.msg = 'Протечка устранена! +шанс выживания бункера';
        }
        S.flood = Math.min(100, S.flood + (100 / 55) * dt);
        if (S.flood >= 100 && !S.failed) { S.failed = true; S.msg = 'Отсек затоплен. Бункер потерян…'; }
      } else {
        S.flood = Math.max(0, S.flood - 6 * dt);
      }

      // Анимация игрока
      playerH.wrench.visible = loadoutRef.current !== 'none';
      const working = near && holdingFix && loadoutRef.current !== 'none' && !S.failed;
      if (working && S.leak) {
        const dx = S.leak.x - player.position.x, dz = S.leak.z - player.position.z;
        player.rotation.y = Math.atan2(dx, dz);
      }
      animate(playerH, moveSpeed, S.time, working);

      // Визуал протечки
      spray.visible = !!S.leak;
      standMark.visible = !!S.leak;
      leakMark.visible = !!S.leak;
      if (S.leak) {
        leakMark.position.copy(S.leak);
        leakMark.position.z += 0.3;
        leakMark.scale.setScalar(1 + Math.sin(S.time * 8) * 0.12);
        for (let i = 0; i < MAX; i++) {
          if (pLife[i] <= 0) {
            pLife[i] = 0.5 + Math.random() * 0.6;
            pPos[i * 3] = S.leak.x + (Math.random() - 0.5) * 0.1;
            pPos[i * 3 + 1] = S.leak.y - 0.1;
            pPos[i * 3 + 2] = S.leak.z + 0.25;
            pVel[i * 3] = (Math.random() - 0.5) * 1.2;
            pVel[i * 3 + 1] = 0.5 + Math.random() * 1.2;
            pVel[i * 3 + 2] = 1.2 + Math.random() * 1.6;
          }
          pLife[i] -= dt;
          pVel[i * 3 + 1] -= 9 * dt;
          pPos[i * 3] += pVel[i * 3] * dt;
          pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
          pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
          if (pPos[i * 3 + 1] < 0.05) pLife[i] = 0;
        }
        pGeo.attributes.position.needsUpdate = true;
      }
      puddle.visible = S.flood > 1;
      if (puddle.visible) {
        const r = 0.8 + S.flood * 0.075;
        puddle.scale.set(r, r, 1);
        const base = S.leak ?? tmp.set(0, 0, -ROOM_D / 2 + 2);
        puddle.position.x = base.x;
        puddle.position.z = Math.min(base.z + 1.8, 0);
      }

      // Аварийная лампа мерцает
      lamp.intensity = 26 + Math.sin(S.time * 3) * 3 + (S.leak ? Math.sin(S.time * 18) * 4 : 0);
      lamp.color.setHex(S.failed ? 0xff3a2a : S.leak ? 0xff7a3a : 0xffa23a);

      // Камера: орбита вокруг игрока
      const d = cam.dist * camScale;
      const cp = Math.cos(cam.pitch);
      const hx = ROOM_W / 2 - 0.6, hz = ROOM_D / 2 - 0.6;
      tmp.set(
        Math.max(-hx, Math.min(hx, player.position.x + Math.sin(cam.yaw) * cp * d)),
        Math.sin(cam.pitch) * d + 0.8,
        Math.max(-hz - 3, Math.min(hz + 6, player.position.z + Math.cos(cam.yaw) * cp * d))
      );
      camera.position.lerp(tmp, 1 - Math.pow(0.0005, dt));
      camera.lookAt(player.position.x, 1.0, player.position.z);

      renderer.render(scene, camera);

      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud({ flood: S.flood, progress: S.progress, near, leak: !!S.leak, msg: S.msg, fixed: S.fixed, failed: S.failed });
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      dom.removeEventListener('pointerdown', pd);
      dom.removeEventListener('pointermove', pm);
      dom.removeEventListener('pointerup', pu);
      dom.removeEventListener('pointercancel', pu);
      dom.removeEventListener('wheel', wh);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // ---------- Джойстик ----------
  const joyMove = (e: React.PointerEvent) => {
    const base = joyBase.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    joyRef.current = { x: dx, y: dy };
    setKnob({ x: dx, y: dy });
  };
  const joyEnd = () => { joyRef.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }); };

  const canFix = loadout !== 'none';
  const pct = Math.round(hud.flood);

  return (
    <div className="fixed inset-0 bg-[#07090d] text-slate-100 font-mono select-none touch-none overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Верхняя панель */}
      <div className="absolute top-0 left-0 right-0 p-2 pr-44 md:pr-60 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <a href="/" className="px-2 py-1 text-[11px] whitespace-nowrap border border-slate-600 bg-slate-900/80 rounded hover:border-amber-500">← В игру</a>
          <span className="hidden sm:inline text-[11px] text-amber-400 font-bold tracking-wide">3D ПРОТОТИП · ОТСЕК 1</span>
          <span className="ml-auto text-[11px] text-emerald-400 whitespace-nowrap">Починено: {hud.fixed}</span>
        </div>
        <div className="max-w-md">
          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5"><span>ЗАТОПЛЕНИЕ ОТСЕКА</span><span>{pct}%</span></div>
          <div className="h-2.5 bg-slate-800 border border-slate-600 rounded overflow-hidden">
            <div className={`h-full transition-[width] duration-100 ${pct > 70 ? 'bg-red-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className={`text-xs px-2 py-1 rounded bg-slate-900/85 border w-fit max-w-md ${hud.failed ? 'border-red-500 text-red-300' : hud.leak ? 'border-amber-500 text-amber-200' : 'border-slate-600 text-slate-300'}`}>
          {hud.msg}
        </div>
      </div>

      {/* Выбор карт */}
      <div className="absolute right-2 top-2 md:top-14 w-[170px] md:w-[210px] flex flex-col gap-1.5 z-10">
        <button
          onClick={() => setCardsOpen(o => !o)}
          className="px-2 py-1.5 rounded border border-slate-600 bg-slate-900/90 text-[11px] text-amber-300 font-bold uppercase tracking-wide cursor-pointer text-left"
        >
          Мои карты {cardsOpen ? '▴' : '▾'}
        </button>
        {cardsOpen && LOADOUTS.map(l => (
          <button
            key={l.id}
            onClick={() => setLoadout(l.id)}
            className={`text-left px-2 py-1.5 rounded border text-[10px] md:text-[11px] leading-tight cursor-pointer ${loadout === l.id ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-600 bg-slate-900/80 text-slate-300'}`}
          >
            <div className="font-bold">{l.label}</div>
            <div className="opacity-70">{l.hint}</div>
          </button>
        ))}
        {cardsOpen && <button
          onClick={() => resetRef.current()}
          className="mt-1 px-2 py-1.5 rounded border border-slate-600 bg-slate-900/80 text-[11px] text-slate-300 hover:border-amber-500 cursor-pointer"
        >
          ↻ Начать заново
        </button>}
      </div>

      {/* Действие */}
      {hud.leak && (
        <div className="absolute bottom-6 right-4 md:right-1/2 md:translate-x-1/2 flex flex-col items-center gap-1">
          {hud.near && canFix && (
            <div className="w-40 h-2 bg-slate-800 border border-slate-600 rounded overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
            </div>
          )}
          <button
            onPointerDown={e => { e.preventDefault(); holdRef.current = true; }}
            onPointerUp={() => { holdRef.current = false; }}
            onPointerLeave={() => { holdRef.current = false; }}
            onPointerCancel={() => { holdRef.current = false; }}
            disabled={!hud.near}
            className={`w-28 h-28 md:w-auto md:h-auto md:px-6 md:py-3 rounded-full md:rounded font-bold text-xs md:text-sm border-2 cursor-pointer ${hud.near ? (canFix ? 'bg-amber-500 text-slate-950 border-amber-300' : 'bg-slate-700 text-slate-300 border-slate-500') : 'bg-slate-900/80 text-slate-500 border-slate-700'}`}
          >
            {hud.near ? 'ЗАКРУТИТЬ ГАЙКУ' : 'ПОДОЙДИ К ТРУБЕ'}
            <div className="hidden md:block text-[10px] font-normal opacity-70">удерживай · клавиша E</div>
          </button>
        </div>
      )}

      {/* Джойстик */}
      <div
        ref={joyBase}
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); joyMove(e); }}
        onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') joyMove(e); }}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
        className="absolute bottom-6 left-4 w-32 h-32 rounded-full border-2 border-slate-600 bg-slate-900/50 touch-none"
      >
        <div
          className="absolute w-14 h-14 rounded-full bg-amber-500/80 border-2 border-amber-300 pointer-events-none"
          style={{ left: `calc(50% - 28px + ${knob.x * 38}px)`, top: `calc(50% - 28px + ${knob.y * 38}px)` }}
        />
      </div>
      <div className="hidden md:block absolute bottom-3 left-40 text-[10px] text-slate-500">WASD / стрелки — ходьба · зажми мышь и тяни — камера · колёсико — масштаб</div>

      {hud.failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="p-6 border border-red-500 bg-slate-950 text-center max-w-xs">
            <div className="text-red-400 font-bold mb-2">ОТСЕК ЗАТОПЛЕН</div>
            <div className="text-xs text-slate-300 mb-4">Шанс выживания бункера упал. Попробуй с другими картами.</div>
            <button onClick={() => resetRef.current()} className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-sm cursor-pointer">ЕЩЁ РАЗ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proto3D;
