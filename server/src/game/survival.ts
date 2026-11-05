import type { RoomState } from '../types/game';

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
