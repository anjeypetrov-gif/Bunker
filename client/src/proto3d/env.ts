import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Мягкое окружающее освещение (карта окружения): даёт тканям, коже и металлу объём и блики. */
export function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.32) {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    (scene as any).environmentIntensity = intensity;
    pm.dispose();
  } catch { /* без карты окружения сцена просто чуть плоше */ }
}

/** Щипок двумя пальцами: возвращает расстояние между двумя активными указателями. */
export class Pinch {
  private pts = new Map<number, { x: number; y: number }>();
  private base = 0;
  down(e: PointerEvent): boolean { this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pts.size === 2) { this.base = this.gap(); return true; } return false; }
  up(e: PointerEvent) { this.pts.delete(e.pointerId); }
  get active() { return this.pts.size >= 2; }
  get count() { return this.pts.size; }
  /** Обновляет точку; при щипке возвращает коэффициент масштаба (>1 — пальцы разводят) относительно начала жеста. */
  move(e: PointerEvent): number | null {
    if (!this.pts.has(e.pointerId)) return null;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size < 2) return null;
    const g = this.gap(); return this.base > 5 && g > 5 ? g / this.base : null;
  }
  private gap() { const v = [...this.pts.values()]; return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); }
}
