import { PROFESSIONS, BAGGAGE, THEMES, type Theme, type IncidentType } from '../proto3d/data';
import { EVENTS, type GameEvent, type Choice, type Outcome, type Res, type ResKey, type Req } from './events';

export const TOTAL_DAYS = 20;
const KEYS: ResKey[] = ['f', 'w', 'p', 'a', 'm'];

export interface Resident {
  id: number; name: string; female: boolean; prof: string; bag: string; hp: number; alive: boolean; joined: number; died?: number;
}
export interface LogEntry { day: number; kind: 'event' | 'death' | 'night' | 'join' | 'start' | 'end'; text: string }
export interface State {
  day: number; res: Res; residents: Resident[]; flags: string[]; used: string[]; log: LogEntry[]; themeId: string; nextId: number;
}
export interface Picked { ev: GameEvent; A: Resident | null; B: Resident | null }

const MALE = ['Алексей', 'Виктор', 'Игорь', 'Денис', 'Павел', 'Сергей', 'Артём', 'Михаил', 'Роман'];
const FEMALE = ['Мария', 'Ольга', 'Анна', 'Елена', 'Ирина', 'Наталья', 'Светлана', 'Дарья'];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]): T[] => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export const alive = (s: State) => s.residents.filter(r => r.alive);

export function newResident(s: { residents: Resident[]; nextId: number }, day: number, prof?: string, bag?: string): Resident {
  const taken = new Set(s.residents.map(r => r.name));
  const p = prof ?? pick(PROFESSIONS);
  const female = p === 'Медсестра-реаниматолог' ? true : Math.random() < 0.45;
  const names = (female ? FEMALE : MALE).filter(n => !taken.has(n));
  return { id: s.nextId++, name: names.length ? pick(names) : pick(female ? FEMALE : MALE), female, prof: p, bag: bag ?? pick(BAGGAGE), hp: 100, alive: true, joined: day };
}

export function newGame(themeId: string, residents?: Resident[]): State {
  const base = { residents: [] as Resident[], nextId: 1 };
  let list = residents;
  if (!list) {
    list = [];
    const profs = shuffle(PROFESSIONS).slice(0, 5), bags = shuffle(BAGGAGE).slice(0, 5);
    profs.forEach((p, i) => list!.push(newResident({ residents: list!, nextId: base.nextId++ }, 1, p, bags[i])));
  }
  return {
    day: 1, res: { f: 80, w: 80, p: 80, a: 85, m: 70 }, residents: list, flags: [], used: [], themeId,
    nextId: Math.max(0, ...list.map(r => r.id)) + 1,
    log: [{ day: 1, kind: 'start', text: `Бункер «${(THEMES.find(t => t.id === themeId) || THEMES[0]).name}» закрыт. Внутри ${list.length} человек: ${list.map(r => r.name).join(', ')}.` }]
  };
}

/** Подстановка имён и родовых окончаний: {A},{B},{S} и {g:муж|жен} по последнему упомянутому. */
export function fmt(text: string, A: Resident | null, B: Resident | null, S: Resident | null): string {
  let last: Resident | null = A;
  const nm = (r: Resident | null) => { if (r) last = r; return r ? r.name : 'кто-то'; };
  return text.replace(/\{([ABS])\}|\{g:([^|}]*)\|([^}]*)\}/g, (_m, k, m, f) => {
    if (k) return nm(k === 'A' ? A : k === 'B' ? B : S);
    return last && last.female ? f : m;
  });
}

const has = (rs: Resident[], req?: Req): Resident | null => {
  if (!req) return null;
  return rs.find(r => (req.pro && req.pro.includes(r.prof)) || (req.bag && req.bag.includes(r.bag))) || null;
};
export const skilled = (s: State, req?: Req) => has(alive(s), req);

export interface ChoiceView { choice: Choice; locked: boolean; who: Resident | null; boostWho: Resident | null; chance: number | null }
export function viewChoice(s: State, c: Choice): ChoiceView {
  const rs = alive(s);
  const who = has(rs, c.req);
  const boostWho = has(rs, c.boost);
  const locked = !!c.req && !who;
  const chance = c.p === undefined ? null : clamp(c.p + (boostWho ? 0.3 : 0), 0.05, 0.97);
  return { choice: c, locked, who, boostWho, chance };
}

export function pickEvent(s: State): Picked {
  const theme: Theme = THEMES.find(t => t.id === s.themeId) || THEMES[0];
  const rs = alive(s);
  let pool = EVENTS.filter(e => !s.used.includes(e.id) && s.day >= (e.min ?? 1) && s.day <= (e.max ?? 99) && (!e.needFlag || s.flags.includes(e.needFlag)) && rs.length >= (e.minAlive ?? 1));
  if (!pool.length) pool = EVENTS.filter(e => !e.once && s.day >= (e.min ?? 1) && rs.length >= (e.minAlive ?? 1));
  if (!pool.length) pool = EVENTS.filter(e => rs.length >= (e.minAlive ?? 1));
  // события-цепочки и особые — в приоритете, остальные взвешены по сценарию бункера
  const w = (e: GameEvent) => {
    let x = 1;
    if (e.needFlag) x *= 4;
    const tw = (theme.weights as Partial<Record<IncidentType, number>>)[e.tag as IncidentType];
    if (tw) x *= tw;
    if (e.min && s.day - e.min < 3) x *= 1.5; // свежие по сроку чаще
    return x;
  };
  let tot = 0; pool.forEach(e => (tot += w(e)));
  let r = Math.random() * tot, ev = pool[0];
  for (const e of pool) { r -= w(e); if (r <= 0) { ev = e; break; } }
  const sh = shuffle(rs);
  return { ev, A: sh[0] || null, B: sh[1] || sh[0] || null };
}

export interface Result {
  text: string; success: boolean; S: Resident | null; deaths: Resident[]; joined: Resident | null; deltas: Partial<Res>; hurtA: number; outcome: Outcome;
}

function damage(s: State, r: Resident, amount: number, cause: string, deaths: Resident[]) {
  if (!r.alive) return;
  r.hp = clamp(r.hp - amount);
  if (r.hp <= 0) { r.alive = false; r.died = s.day; deaths.push(r); s.log.push({ day: s.day, kind: 'death', text: `✝ ${r.name} ${r.female ? 'погибла' : 'погиб'}: ${cause}.` }); }
}

export function resolve(s: State, p: Picked, ci: number): Result {
  const c = p.ev.choices[ci];
  const v = viewChoice(s, c);
  const success = c.p === undefined ? true : Math.random() < (v.chance as number);
  const out = success || !c.lose ? c.win : c.lose;
  const S = v.who || v.boostWho;
  const deaths: Resident[] = [];
  const deltas: Partial<Res> = {};
  if (out.d) for (const k of KEYS) if (out.d[k]) { s.res[k] = clamp(s.res[k] + (out.d[k] as number)); deltas[k] = out.d[k]; }
  const rs = alive(s);
  const A = p.A && p.A.alive ? p.A : rs[0] || null;
  if (out.hurt && A) damage(s, A, out.hurt, p.ev.title.toLowerCase(), deaths);
  if (out.kill && A && A.alive) { A.hp = 0; A.alive = false; A.died = s.day; deaths.push(A); s.log.push({ day: s.day, kind: 'death', text: `✝ ${A.name} ${A.female ? 'ушла и не вернулась' : 'ушёл и не вернулся'}.` }); }
  if (out.hurtAll) alive(s).forEach(r => damage(s, r, out.hurtAll as number, p.ev.title.toLowerCase(), deaths));
  if (out.heal) alive(s).forEach(r => (r.hp = clamp(r.hp + (out.heal as number))));
  let joined: Resident | null = null;
  if (out.join) { joined = newResident(s, s.day); s.residents.push(joined); s.log.push({ day: s.day, kind: 'join', text: `В бункер вошёл${joined.female ? 'ла' : ''} ${joined.name} (${joined.prof}).` }); }
  if (out.set && !s.flags.includes(out.set)) s.flags.push(out.set);
  if (!s.used.includes(p.ev.id)) s.used.push(p.ev.id);
  const text = fmt(out.text, p.A, p.B, S);
  s.log.push({ day: s.day, kind: 'event', text: `${p.ev.icon} ${p.ev.title}. ${fmt(c.label.replace('{A}', '{A}'), p.A, p.B, S)} — ${text}` });
  return { text, success, S, deaths, joined, deltas, hurtA: out.hurt || 0, outcome: out };
}

export interface Night { lines: string[]; before: Res; after: Res; deaths: Resident[]; ended: boolean }

export function endDay(s: State): Night {
  const before = { ...s.res };
  const rs = alive(s);
  const n = rs.length;
  const deaths: Resident[] = [];
  const lines: string[] = [];
  // потребление
  s.res.f -= 1.8 * n; s.res.w -= 1.55 * n; s.res.p -= 3.6; s.res.a -= 1.3;
  // работа жителей
  const has1 = (arr: string[]) => rs.filter(r => arr.includes(r.prof)).length;
  const hasB = (b: string[]) => rs.filter(r => b.includes(r.bag)).length;
  s.res.f += 3.5 * has1(['Ботаник', 'Биотехнолог-селекционер']) + 1.2 * has1(['Логист-кладовщик', 'Инструктор по выживанию', 'Пекарь-кондитер']) + 1.2 * hasB(['Пакет с семенами']);
  s.res.w += 3 * has1(['Эколог-гидролог']) + 1.2 * hasB(['Ручной насос-фильтр для воды', 'Портативный фильтр для воды']);
  s.res.p += 3 * has1(['Механик-дизелист']) + 1.2 * has1(['Радиоинженер связи']) + 1.2 * hasB(['Портативный зарядник']);
  s.res.a += 1.2 * has1(['Эколог-гидролог', 'Механик-дизелист']);
  s.res.m += 1.5 * has1(['Пекарь-кондитер', 'Юрист-арбитр']) + 0.8 * has1(['Врач скорой помощи', 'Медсестра-реаниматолог']);
  const med = has1(['Врач скорой помощи', 'Медсестра-реаниматолог']);
  // мораль дрейфует к 50-60 и страдает от нехватки
  s.res.m += (55 - s.res.m) * 0.04 - (KEYS.some(k => k !== 'm' && s.res[k] < 25) ? 3.5 : 0);
  for (const k of KEYS) s.res[k] = clamp(s.res[k]);
  // последствия нехватки
  const dmg = (what: string, amount: number) => { rs.forEach(r => damage(s, r, amount, what, deaths)); };
  if (s.res.f <= 0) { dmg("голод", 9); lines.push('Еда закончилась: все голодают.'); }
  if (s.res.w <= 0) { dmg("жажда", 12); lines.push('Вода закончилась: люди слабеют.'); }
  if (s.res.a <= 0) { dmg("нехватка воздуха", 20); lines.push('Воздуха нет: людям тяжело дышать.'); }
  if (s.res.p <= 0) { s.res.m = clamp(s.res.m - 6); s.res.a = clamp(s.res.a - 2); lines.push('Нет питания: темнота и холод.'); }
  if (s.res.m <= 0) { const a = pick(alive(s).length ? alive(s) : rs); if (a && a.alive) { damage(s, a, 28, 'срыв и драка', deaths); lines.push('Дух на нуле: в бункере вспыхнула драка.'); } }
  // восстановление
  if (s.res.f > 20 && s.res.w > 20 && s.res.a > 20) alive(s).forEach(r => (r.hp = clamp(r.hp + 2)));
  if (med && s.res.f > 0) { const hurt = alive(s).filter(r => r.hp < 100).sort((a, b) => a.hp - b.hp)[0]; if (hurt) { hurt.hp = clamp(hurt.hp + 8 * med); lines.push(`${hurt.name} ${hurt.female ? 'выхожена' : 'выхожен'} врачами (+${8 * med}).`); } }
  const low = KEYS.filter(k => k !== 'm' && s.res[k] < 25).map(k => k);
  if (low.length) lines.push(`Запасы на исходе: ${low.map(k => ({ f: 'еда', w: 'вода', p: 'энергия', a: 'воздух', m: 'дух' } as Record<string, string>)[k]).join(', ')}.`);
  const after = { ...s.res };
  s.log.push({ day: s.day, kind: 'night', text: `Ночь. ${lines.join(' ') || 'Тихо.'}` });
  const ended = alive(s).length === 0 || s.day >= TOTAL_DAYS;
  if (!ended) s.day++;
  return { lines, before, after, deaths, ended };
}

export function verdict(s: State): { title: string; text: string; grade: number } {
  const n = alive(s).length, total = s.residents.length;
  const rescued = s.flags.includes('rescued');
  if (n === 0) return { title: 'БУНКЕР ЗАМОЛЧАЛ', grade: 0, text: `Последний житель ушёл на день ${s.log.filter(l => l.kind === 'death').length ? s.day : s.day}. Через много лет сюда придут исследователи и найдут журнал, в котором записана вся ваша история.` };
  if (rescued && n >= 3) return { title: 'ВЫШЛИ НА СВЕТ', grade: 3, text: `${n} из ${total} человек дошли до эвакуации. Хроника их выживания станет легендой для тех, кто придёт следом.` };
  if (n >= Math.ceil(total * 0.7)) return { title: 'БУНКЕР ВЫСТОЯЛ', grade: 3, text: `${n} из ${total} дожили до конца срока. Бункер выстоял, и вы стали для него настоящими хозяевами.` };
  if (n >= 2) return { title: 'ВЫЖИЛИ, НО ДОРОГОЙ ЦЕНОЙ', grade: 2, text: `Из ${total} человек остались ${n}. Они будут помнить тех, кого не удалось спасти.` };
  return { title: 'ПОСЛЕДНИЙ ИЗ СВОИХ', grade: 1, text: `Из ${total} человек остался ${alive(s)[0].name}. История выживания закончилась тихо, но он справился.` };
}

export const chronicleText = (s: State, v?: { title: string; text: string }) =>
  `ХРОНИКА БУНКЕРА\n\n` + s.log.map(l => `[День ${l.day}] ${l.text}`).join('\n') + (v ? `\n\n${v.title}. ${v.text}` : '');
