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

/** Выталкивает круг радиуса r из стен (скольжение вдоль стены). */
export function collide(x: number, z: number, r: number): { x: number; z: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of WALLS) {
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
export function findPath(from: Pt, to: Pt): Pt[] {
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

export const pathLength = (from: Pt, path: Pt[]): number => {
  let len = 0, cur = from;
  for (const p of path) { len += Math.hypot(p.x - cur.x, p.z - cur.z); cur = p; }
  return len;
};
