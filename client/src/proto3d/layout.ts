/** Планировка бункера 3×3 отсека, стены, двери и простая навигация по комнатам. */
export const CW = 14; // ширина комнаты (x)
export const CD = 9;  // глубина комнаты (z)
export const COLS = 3;
export const ROWS = 3;
export const WALL_T = 0.4;
export const DOOR_W = 2.8;
export const MAP_X0 = -(COLS * CW) / 2;
export const MAP_Z0 = -(ROWS * CD) / 2;

export interface Room {
  id: string; name: string; col: number; row: number;
  x0: number; x1: number; z0: number; z1: number; cx: number; cz: number;
  station: { x: number; z: number };
}

const GRID: [string, string][][] = [
  [['workshop', 'Мастерская'], ['generator', 'Генераторная'], ['radio', 'Радиорубка']],
  [['storage', 'Склад'], ['hub', 'Жилой зал'], ['medical', 'Медблок']],
  [['greenhouse', 'Оранжерея'], ['vent', 'Вентиляция и фильтры'], ['airlock', 'Шлюз']]
];

export const ROOMS: Room[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const [id, name] = GRID[r][c];
    const x0 = MAP_X0 + c * CW, z0 = MAP_Z0 + r * CD;
    ROOMS.push({
      id, name, col: c, row: r, x0, x1: x0 + CW, z0, z1: z0 + CD,
      cx: x0 + CW / 2, cz: z0 + CD / 2, station: { x: x0 + CW / 2, z: z0 + CD / 2 - 1.2 }
    });
  }
}
export const roomById = (id: string) => ROOMS.find(r => r.id === id)!;
export const roomAt = (x: number, z: number): Room => {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - MAP_X0) / CW)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((z - MAP_Z0) / CD)));
  return ROOMS[r * COLS + c];
};

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Door { x: number; z: number; a: string; b: string }

export const WALLS: Rect[] = [];
export const DOORS: Door[] = [];

// Вертикальные границы (между колонками и по периметру)
for (let i = 0; i <= COLS; i++) {
  const x = MAP_X0 + i * CW;
  for (let r = 0; r < ROWS; r++) {
    const z0 = MAP_Z0 + r * CD, z1 = z0 + CD, cz = (z0 + z1) / 2;
    if (i === 0 || i === COLS) {
      WALLS.push({ x0: x - WALL_T / 2, x1: x + WALL_T / 2, z0: z0 - WALL_T / 2, z1: z1 + WALL_T / 2 });
    } else {
      WALLS.push({ x0: x - WALL_T / 2, x1: x + WALL_T / 2, z0: z0 - WALL_T / 2, z1: cz - DOOR_W / 2 });
      WALLS.push({ x0: x - WALL_T / 2, x1: x + WALL_T / 2, z0: cz + DOOR_W / 2, z1: z1 + WALL_T / 2 });
      DOORS.push({ x, z: cz, a: ROOMS[r * COLS + i - 1].id, b: ROOMS[r * COLS + i].id });
    }
  }
}
// Горизонтальные границы
for (let j = 0; j <= ROWS; j++) {
  const z = MAP_Z0 + j * CD;
  for (let c = 0; c < COLS; c++) {
    const x0 = MAP_X0 + c * CW, x1 = x0 + CW, cx = (x0 + x1) / 2;
    if (j === 0 || j === ROWS) {
      WALLS.push({ x0: x0 - WALL_T / 2, x1: x1 + WALL_T / 2, z0: z - WALL_T / 2, z1: z + WALL_T / 2 });
    } else {
      WALLS.push({ x0: x0 - WALL_T / 2, x1: cx - DOOR_W / 2, z0: z - WALL_T / 2, z1: z + WALL_T / 2 });
      WALLS.push({ x0: cx + DOOR_W / 2, x1: x1 + WALL_T / 2, z0: z - WALL_T / 2, z1: z + WALL_T / 2 });
      DOORS.push({ x: cx, z, a: ROOMS[(j - 1) * COLS + c].id, b: ROOMS[j * COLS + c].id });
    }
  }
}

/** Мебель и реквизит, в которые «упираются» люди. Заполняется при построении мира. */
export const OBSTACLES: Rect[] = [];

/** Свободные коридоры: от каждой двери до центра отсека и «пятно» у рабочей точки. Реквизит их не перекрывает. */
export const LANES: Rect[] = [];
const LANE_HALF = 1.4;
for (const d of DOORS) {
  for (const id of [d.a, d.b]) {
    const r = roomById(id);
    if (roomById(d.a).row === roomById(d.b).row) {
      LANES.push({ x0: Math.min(d.x, r.cx), x1: Math.max(d.x, r.cx), z0: r.cz - LANE_HALF, z1: r.cz + LANE_HALF });
    } else {
      LANES.push({ x0: r.cx - LANE_HALF, x1: r.cx + LANE_HALF, z0: Math.min(d.z, r.cz), z1: Math.max(d.z, r.cz) });
    }
  }
}
for (const r of ROOMS) LANES.push({ x0: r.station.x - 1, x1: r.station.x + 1, z0: r.station.z - 1, z1: r.station.z + 1 });

export const OBSTACLE_VIOLATIONS: Rect[] = [];
let obsVer = 0;
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
export function addObstacle(rc: Rect) {
  OBSTACLES.push(rc); obsVer++;
  if (LANES.some(l => overlaps(l, rc))) OBSTACLE_VIOLATIONS.push(rc);
}
export function clearObstacles() { OBSTACLES.length = 0; OBSTACLE_VIOLATIONS.length = 0; obsVer++; }

/** Ближайшая свободная точка (для случайных целей прогулок). */
export function freePoint(x: number, z: number, r = 0.5): { x: number; z: number } { return collide(x, z, r); }

/** Выталкивает круг радиуса r из стен и мебели (скольжение вдоль препятствия). */
export function collide(x: number, z: number, r: number): { x: number; z: number } {
  for (let pass = 0; pass < 3; pass++) {
    for (const w of WALLS.concat(OBSTACLES)) {
      const nx = Math.max(w.x0, Math.min(x, w.x1));
      const nz = Math.max(w.z0, Math.min(z, w.z1));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r; z = nz + (dz / d) * r;
        } else {
          // центр внутри прямоугольника — выталкиваем по короткой оси
          const left = x - w.x0, right = w.x1 - x, up = z - w.z0, down = w.z1 - z;
          const m = Math.min(left, right, up, down);
          if (m === left) x = w.x0 - r; else if (m === right) x = w.x1 + r;
          else if (m === up) z = w.z0 - r; else z = w.z1 + r;
        }
      }
    }
  }
  const lim = (COLS * CW) / 2 - 0.6, limZ = (ROWS * CD) / 2 - 0.6;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-limZ, Math.min(limZ, z)) };
}

const neighbors = (id: string): { room: string; door: Door }[] => {
  const out: { room: string; door: Door }[] = [];
  for (const d of DOORS) {
    if (d.a === id) out.push({ room: d.b, door: d });
    else if (d.b === id) out.push({ room: d.a, door: d });
  }
  return out;
};

export interface Pt { x: number; z: number }

/** Путь из точки в точку: точки у дверей (до и после порога) + цель. */
function findPathDoors(from: Pt, to: Pt): Pt[] {
  const start = roomAt(from.x, from.z).id, goal = roomAt(to.x, to.z).id;
  if (start === goal) return [to];
  const prev = new Map<string, { room: string; door: Door } | null>([[start, null]]);
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    for (const n of neighbors(cur)) {
      if (!prev.has(n.room)) { prev.set(n.room, { room: cur, door: n.door }); q.push(n.room); }
    }
  }
  const chain: { from: string; door: Door; to: string }[] = [];
  let at = goal;
  while (at !== start) {
    const p = prev.get(at);
    if (!p) return [to];
    chain.unshift({ from: p.room, door: p.door, to: at });
    at = p.room;
  }
  const pts: Pt[] = [];
  for (const step of chain) {
    const d = step.door;
    const dir = step.from === d.a ? 1 : -1;
    if (roomById(d.a).row === roomById(d.b).row) {
      pts.push({ x: d.x - dir * 1.4, z: d.z }, { x: d.x + dir * 1.4, z: d.z });
    } else {
      pts.push({ x: d.x, z: d.z - dir * 1.4 }, { x: d.x, z: d.z + dir * 1.4 });
    }
  }
  pts.push(to);
  return pts;
}

// ---------- Навигационная сетка: путь огибает мебель ----------
const NC = 0.3, NR = 0.56;
let navVer = -1, navGrid = new Uint8Array(0);
const navW = Math.round((COLS * CW) / NC), navH = Math.round((ROWS * CD) / NC);
function ensureNav() {
  if (navVer === obsVer && navGrid.length) return;
  navGrid = new Uint8Array(navW * navH);
  const solids = WALLS.concat(OBSTACLES);
  for (let i = 0; i < navW; i++) {
    const x = MAP_X0 + (i + 0.5) * NC;
    for (let j = 0; j < navH; j++) {
      const z = MAP_Z0 + (j + 0.5) * NC;
      for (const w of solids) {
        if (x < w.x0 - NR || x > w.x1 + NR || z < w.z0 - NR || z > w.z1 + NR) continue;
        const cx = Math.max(w.x0, Math.min(x, w.x1)), cz = Math.max(w.z0, Math.min(z, w.z1));
        if ((x - cx) ** 2 + (z - cz) ** 2 < NR * NR) { navGrid[i * navH + j] = 1; break; }
      }
    }
  }
  navVer = obsVer;
}
const cellI = (x: number) => Math.max(0, Math.min(navW - 1, Math.floor((x - MAP_X0) / NC)));
const cellJ = (z: number) => Math.max(0, Math.min(navH - 1, Math.floor((z - MAP_Z0) / NC)));
const cx0 = (i: number) => MAP_X0 + (i + 0.5) * NC, cz0 = (j: number) => MAP_Z0 + (j + 0.5) * NC;
const freeAt = (x: number, z: number) => !navGrid[cellI(x) * navH + cellJ(z)];
function nearestFree(i: number, j: number): [number, number] | null {
  if (!navGrid[i * navH + j]) return [i, j];
  for (let rad = 1; rad < 14; rad++) {
    let best: [number, number] | null = null, bd = 1e9;
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== rad) continue;
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= navW || y >= navH || navGrid[x * navH + y]) continue;
      const d = a * a + b * b; if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) return best;
  }
  return null;
}
function los(a: Pt, b: Pt): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
  for (let k = 1; k < n; k++) { const t = k / n; if (!freeAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
  return true;
}

/** Путь из точки в точку: A* по сетке, огибает мебель и проходит через двери; затем спрямление. */
export function findPath(from: Pt, to: Pt): Pt[] {
  ensureNav();
  const s = nearestFree(cellI(from.x), cellJ(from.z)), g = nearestFree(cellI(to.x), cellJ(to.z));
  if (!s || !g) return findPathDoors(from, to);
  const N = navW * navH;
  const gs = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap: number[] = [], fs = new Float32Array(N);
  const push = (n: number) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (fs[heap[p]] <= fs[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && fs[heap[l]] < fs[heap[m]]) m = l; if (r < heap.length && fs[heap[r]] < fs[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const sIdx = s[0] * navH + s[1], gIdx = g[0] * navH + g[1];
  const h = (i: number, j: number) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
  gs[sIdx] = 0; fs[sIdx] = h(s[0], s[1]); push(sIdx);
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === gIdx) { found = true; break; }
    const ci = Math.floor(cur / navH), cj = cur % navH;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      const ni = ci + a, nj = cj + b;
      if (ni < 0 || nj < 0 || ni >= navW || nj >= navH) continue;
      const nIdx = ni * navH + nj;
      if (navGrid[nIdx] || closed[nIdx]) continue;
      if (a && b && (navGrid[(ci + a) * navH + cj] || navGrid[ci * navH + cj + b])) continue;
      const ng = gs[cur] + (a && b ? Math.SQRT2 : 1);
      if (ng < gs[nIdx]) { gs[nIdx] = ng; prev[nIdx] = cur; fs[nIdx] = ng + h(ni, nj); push(nIdx); }
    }
  }
  if (!found) return findPathDoors(from, to);
  const cells: Pt[] = [];
  for (let n = gIdx; n !== -1; n = prev[n]) cells.push({ x: cx0(Math.floor(n / navH)), z: cz0(n % navH) });
  cells.reverse();
  const pts: Pt[] = [from, ...cells.slice(1)];
  if (freeAt(to.x, to.z)) pts.push(to);
  // спрямление: идём к самой дальней видимой точке
  const out: Pt[] = [];
  let cur = 0;
  while (cur < pts.length - 1) {
    let j = pts.length - 1;
    while (j > cur + 1 && !los(pts[cur], pts[j])) j--;
    out.push(pts[j]); cur = j;
  }
  return out;
}

export const pathLength = (from: Pt, path: Pt[]): number => {
  let len = 0, cur = from;
  for (const p of path) { len += Math.hypot(p.x - cur.x, p.z - cur.z); cur = p; }
  return len;
};
