import type { RoleResult, RoomState } from '../types/game';

/** Порог: ниже этого шанса партия считается проваленной. */
export const FAIL_THRESHOLD = 40;

const has = (list: string[], words: string[]) => list.some(t => words.some(w => t.includes(w)));

/** Шанс на возрождение цивилизации по составу выживших. Считается на сервере. */
export function computeSurvival(room: RoomState) {
  const survivors = Object.values(room.players).filter(p => !p.isExiled);
  const low = (s?: string) => (s || '').toLowerCase();
  const profs = survivors.map(p => low(p.cards.profession?.title));
  const healths = survivors.map(p => low(p.cards.health?.title));
  const extras = survivors.map(p =>
    [p.cards.hobby?.title, p.cards.baggage?.title, p.cards.trait?.title, p.cards.condition?.title, p.cards.knowledge?.title]
      .join(' ').toLowerCase());

  const hasDoctor = has(profs, ['врач', 'хирург', 'медсестр', 'стоматолог']) || has(extras, ['первая помощь', 'аптечк', 'медицин']);
  const hasEngineer = has(profs, ['инженер', 'сантехник', 'механик', 'строител', 'электрик', 'радиоинженер', 'геолог']);
  const hasAgronomist = has(profs, ['агроном', 'биолог', 'повар', 'пекарь', 'биотехнолог']) || has(extras, ['сад', 'семян', 'выращива']);
  const hasLeader = has(profs, ['психотерапевт', 'юрист', 'учитель', 'офицер']) || has(extras, ['лидер', 'дипломат', 'переговорщик']);
  const badHealth = healths.filter(t =>
    ['диабет', 'астма', 'гастрит', 'глухот', 'миопия', 'перелом', 'мигрен', 'гипертон', 'протез', 'слабое сердце', 'дальтонизм'].some(w => t.includes(w))).length;

  let chance = 40;
  if (hasDoctor) chance += 18;
  if (hasEngineer) chance += 14;
  if (hasAgronomist) chance += 14;
  if (hasLeader) chance += 8;
  chance -= Math.min(24, badHealth * 6);
  if (survivors.length < room.bunkerCapacity) chance -= 10;
  chance = Math.min(97, Math.max(8, chance));

  return { chance, failed: chance < FAIL_THRESHOLD };
}

/** Выполнили ли игроки цели своих тайных ролей (только роли с однозначным критерием). */
export function computeRoleResults(room: RoomState): RoleResult[] {
  const all = Object.values(room.players);
  const survivors = all.filter(p => !p.isExiled);
  const low = (s?: string) => (s || '').toLowerCase();
  const anyProf = (words: string[]) => survivors.some(p => words.some(w => low(p.cards.profession?.title).includes(w)));
  const out: RoleResult[] = [];
  for (const p of all) {
    const r = p.role;
    if (!r) continue;
    const alive = !p.isExiled;
    let achieved: boolean | null = null;
    switch (r.id) {
      case 'role-1': case 'role-2': case 'role-8': case 'role-11': achieved = alive; break;
      case 'role-3': achieved = alive && anyProf(['врач', 'хирург', 'медсестр', 'стоматолог', 'инфекцион']); break;
      case 'role-4': achieved = alive && anyProf(['инженер', 'механик', 'электрик', 'сантехник']); break;
      default: achieved = null;
    }
    if (achieved === null) continue;
    out.push({ playerId: p.id, playerName: p.name, roleTitle: r.title, goal: r.goal, survived: alive, achieved });
  }
  return out;
}
