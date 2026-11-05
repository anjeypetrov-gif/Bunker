import type { LineageEntry, LineageEvent, LineageOption, LineageState, Player, RoomState } from '../types/game';

// «Продолжить род»: после финала прошедшие в бункер проживают несколько
// поколений. Каждое поколение — событие и выбор реакции; исход зависит
// от карт выживших и от удачи.

const EVENTS: LineageEvent[] = [
  { id: 'epidemic', title: 'Эпидемия в бункере', desc: 'Лихорадка перекидывается из отсека в отсек. Нужно быстро решить, как остановить заразу.', options: [
    { id: 'quarantine', label: 'Закрыть больных в карантин', hint: 'Надёжно, но жестоко', keys: ['врач', 'хирург', 'медсестр', 'инфекцион', 'здоров'], risk: 0.35 },
    { id: 'medicine', label: 'Тратить запасы лекарств', hint: 'Нужны медики', keys: ['врач', 'аптечк', 'лекарств', 'биохим', 'травами', 'медицин'], risk: 0.45 },
    { id: 'ignore', label: 'Положиться на иммунитет', hint: 'Рискованно', keys: ['иммунитет', 'здоров'], risk: 0.7 } ] },
  { id: 'water', title: 'Заканчивается чистая вода', desc: 'Фильтры отработали ресурс, вода мутнеет.', options: [
    { id: 'filter', label: 'Починить систему очистки', hint: 'Нужны инженеры', keys: ['инженер', 'сантехник', 'механик', 'фильтр', 'гидро'], risk: 0.35 },
    { id: 'surface', label: 'Искать источник снаружи', hint: 'Опасная вылазка', keys: ['следопыт', 'охот', 'ориентир', 'выжить', 'вод'], risk: 0.6 },
    { id: 'ration', label: 'Жёстко ограничить выдачу', hint: 'Спасёт не всех', keys: ['лидер', 'переговор', 'стресс'], risk: 0.5 } ] },
  { id: 'raiders', title: 'У входа мародёры', desc: 'Чужаки требуют пустить их в бункер или отдать припасы.', options: [
    { id: 'fight', label: 'Дать отпор', hint: 'Нужны бойцы', keys: ['военн', 'офицер', 'снайпер', 'самбо', 'стрельб', 'оружи', 'охран'], risk: 0.55 },
    { id: 'talk', label: 'Договориться', hint: 'Нужны переговорщики', keys: ['переговор', 'дипломат', 'юрист', 'психотерапевт', 'лидер'], risk: 0.4 },
    { id: 'hide', label: 'Затаиться и закрыть шлюз', hint: 'Надёжно, но надолго', keys: ['инженер', 'замок', 'охран'], risk: 0.35 } ] },
  { id: 'air', title: 'Поломка вентиляции', desc: 'Воздух становится тяжёлым, лампы мигают.', options: [
    { id: 'repair', label: 'Всем отрядом чинить', hint: 'Нужны мастера', keys: ['инженер', 'электрик', 'механик', 'строител', 'радио'], risk: 0.4 },
    { id: 'open', label: 'Приоткрыть шлюз', hint: 'Риск радиации', keys: ['дозиметр', 'радио', 'ориентир'], risk: 0.7 },
    { id: 'sleep', label: 'Снизить нагрузку и спать по сменам', hint: 'Выиграет время', keys: ['врач', 'стресс', 'лидер'], risk: 0.5 } ] },
  { id: 'harvest', title: 'Неурожай в теплице', desc: 'Грибы и зелень гибнут, запасы еды тают.', options: [
    { id: 'replant', label: 'Пересадить культуры', hint: 'Нужны аграрии', keys: ['агроном', 'биолог', 'ботаник', 'миколог', 'садовод', 'семян', 'сад'], risk: 0.35 },
    { id: 'hunt', label: 'Отправить охотников наверх', hint: 'Рискованно', keys: ['охот', 'рыб', 'ловуш', 'следопыт', 'лук'], risk: 0.6 },
    { id: 'cook', label: 'Вытянуть запасы кулинарией', hint: 'Замедлит голод', keys: ['повар', 'пекар', 'запас'], risk: 0.5 } ] },
  { id: 'schism', title: 'Раскол в общине', desc: 'Потомки спорят, кто главный, и бункер делится на лагеря.', options: [
    { id: 'council', label: 'Созвать совет', hint: 'Нужны лидеры', keys: ['лидер', 'учитель', 'юрист', 'психотерапевт', 'переговор'], risk: 0.35 },
    { id: 'strict', label: 'Ввести жёсткий порядок', hint: 'Быстро, но не всем по вкусу', keys: ['офицер', 'военн', 'охран'], risk: 0.5 },
    { id: 'split', label: 'Разделить отсеки', hint: 'Мир ценой единства', keys: ['инженер', 'строител'], risk: 0.55 } ] },
  { id: 'surface', title: 'Первый выход на поверхность', desc: 'Датчики показывают, что снаружи, возможно, уже безопасно.', options: [
    { id: 'scout', label: 'Выслать разведку', hint: 'Нужны следопыты', keys: ['следопыт', 'ориентир', 'геолог', 'охот', 'походы'], risk: 0.5 },
    { id: 'wait', label: 'Подождать ещё поколение', hint: 'Осторожно', keys: ['астроном', 'метеоролог', 'радио'], risk: 0.3 },
    { id: 'all', label: 'Выйти всем сразу', hint: 'Всё или ничего', keys: ['здоров', 'выжить'], risk: 0.75 } ] },
  { id: 'cache', title: 'Найден тайный склад', desc: 'За стеной обнаружен закрытый отсек с неизвестным содержимым.', options: [
    { id: 'open', label: 'Вскрыть немедленно', hint: 'Нужны мастера', keys: ['инженер', 'механик', 'взлом', 'хакер', 'сантехник'], risk: 0.5 },
    { id: 'inspect', label: 'Сначала осмотреть и проверить', hint: 'Разумно', keys: ['химик', 'биохим', 'криминалист', 'детектив', 'антиквар'], risk: 0.3 },
    { id: 'leave', label: 'Оставить закрытым', hint: 'Без выгоды', keys: [], risk: 0.25 } ] }
];

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function survivorsOf(room: RoomState): Player[] {
  return Object.values(room.players).filter(p => !p.isExiled);
}

function skillText(p: Player): string {
  return Object.values(p.cards || {})
    .filter(c => c && c.type !== 'actionCard' && c.type !== 'secret')
    .map(c => `${c.title} ${c.description}`)
    .join(' ')
    .toLowerCase();
}

/** Сколько выживших имеют карты, подходящие под вариант. */
function skilledCount(room: RoomState, ids: string[], opt: LineageOption): number {
  if (opt.keys.length === 0) return 0;
  return ids.filter(id => {
    const p = room.players[id];
    if (!p) return false;
    const txt = skillText(p);
    return opt.keys.some(k => txt.includes(k));
  }).length;
}

function nextEvent(room: RoomState, used: string[]): LineageEvent {
  // Событие, которое пока не выпадало; если все прошли — любое.
  const pool = EVENTS.filter(e => !used.includes(e.id));
  return pick(pool.length ? pool : EVENTS);
}

export function startLineage(room: RoomState): LineageState | null {
  if (room.phase !== 'GAME_OVER' || !room.lineageEnabled) return null;
  const alive = survivorsOf(room);
  if (!alive.length) return null;
  const start = alive.length * 6;
  const lineage: LineageState = {
    step: 'CHOOSE',
    generation: 1,
    maxGenerations: 3 + Math.floor(Math.random() * 3),
    startPopulation: start,
    population: start,
    event: null,
    votes: {},
    history: [],
    extinct: false,
    survivorIds: alive.map(p => p.id)
  };
  lineage.event = nextEvent(room, []);
  // Боты голосуют сами
  for (const p of alive) if (p.id.startsWith('bot-')) lineage.votes[p.id] = pick(lineage.event.options).id;
  room.lineage = lineage;
  return lineage;
}

export function lineageVote(room: RoomState, voterId: string, optionId: string): boolean {
  const l = room.lineage;
  if (!l || l.step !== 'CHOOSE' || !l.event) return false;
  if (!l.survivorIds.includes(voterId) || l.votes[voterId]) return false;
  if (!l.event.options.some(o => o.id === optionId)) return false;
  l.votes[voterId] = optionId;
  return true;
}

export function allLineageVoted(room: RoomState): boolean {
  const l = room.lineage;
  if (!l || l.step !== 'CHOOSE') return false;
  return l.survivorIds.every(id => !!l.votes[id]);
}

/** Подводит итог поколения. */
export function resolveGeneration(room: RoomState): boolean {
  const l = room.lineage;
  if (!l || l.step !== 'CHOOSE' || !l.event) return false;

  // Не проголосовавшие — случайный вариант (община решила сама)
  for (const id of l.survivorIds) if (!l.votes[id]) l.votes[id] = pick(l.event.options).id;

  const tally: Record<string, number> = {};
  Object.values(l.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
  const top = Math.max(...Object.values(tally));
  const winnerId = pick(Object.keys(tally).filter(k => tally[k] === top));
  const opt = l.event.options.find(o => o.id === winnerId)!;

  const skilled = skilledCount(room, l.survivorIds, opt);
  const share = skilled / Math.max(1, l.survivorIds.length);
  // Шанс успеха: от риска варианта, поднимается картами выживших.
  const success = Math.min(0.92, Math.max(0.1, (1 - opt.risk) * 0.8 + share * 0.5));
  const roll = Math.random();

  let outcome: LineageEntry['outcome'];
  let factor: number;
  let text: string;
  if (roll < success * 0.6) {
    outcome = 'great'; factor = 1.45;
    text = skilled
      ? `Навыки выживших (${skilled}) пригодились: решение сработало, род окреп.`
      : 'Решение неожиданно сработало: род окреп.';
  } else if (roll < success) {
    outcome = 'ok'; factor = 1.1;
    text = 'Кризис удалось пережить с потерями, но община выстояла.';
  } else {
    outcome = 'bad'; factor = 0.55;
    text = skilled
      ? 'Даже знающие люди не смогли переломить ситуацию, потери тяжёлые.'
      : 'Выбор оказался неудачным, и потери тяжёлые. Не хватило нужных навыков.';
  }

  l.population = Math.max(0, Math.round(l.population * factor));
  l.history.push({
    generation: l.generation,
    title: l.event.title,
    choice: opt.label,
    outcome,
    text,
    population: l.population
  });

  if (l.population < 2) {
    l.extinct = true;
    l.step = 'DONE';
  } else if (l.generation >= l.maxGenerations) {
    l.step = 'DONE';
  } else {
    l.step = 'RESULT';
  }
  return true;
}

/** Переход к следующему поколению. */
export function nextGeneration(room: RoomState): boolean {
  const l = room.lineage;
  if (!l || l.step !== 'RESULT') return false;
  l.generation += 1;
  l.step = 'CHOOSE';
  l.votes = {};
  l.event = nextEvent(room, l.history.map(h => EVENT_BY_TITLE.get(h.title) || ''));
  for (const id of l.survivorIds) if (id.startsWith('bot-')) l.votes[id] = pick(l.event.options).id;
  return true;
}

const EVENT_BY_TITLE = new Map(EVENTS.map(e => [e.title, e.id]));
