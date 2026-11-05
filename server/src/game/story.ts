import type { Player, RoomState } from '../types/game';

// История бункера: текстовый финал о том, как выжившие прожили годы в убежище.
// Если задан ANTHROPIC_API_KEY, текст пишет модель по карточкам игроков;
// без ключа или при сбое используется встроенный генератор по шаблонам.

export interface StoryState { text: string; source: 'ai' | 'template' }

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const female = (p: Player) => /^жен/i.test(p.cards.biology?.title || '');
const g = (p: Player, m: string, f: string) => (female(p) ? f : m);
const low = (s?: string) => (s || '').toLowerCase();
const has = (text: string, words: string[]) => words.some(w => text.includes(w));

function cardsOf(p: Player) {
  const c = p.cards;
  return {
    prof: c.profession?.title || 'без профессии',
    health: c.health?.title || '',
    hobby: c.hobby?.title || '',
    trait: c.trait?.title || '',
    baggage: c.baggage?.title || '',
    secret: c.secret?.title || '',
    phobia: c.phobia?.title || '',
    knowledge: c.knowledge?.title || '',
    bio: c.biology?.title || ''
  };
}

function vignette(p: Player): string {
  const c = cardsOf(p);
  const prof = low(c.prof);
  const n = p.name;
  const options: string[] = [];

  if (has(prof, ['врач', 'хирург', 'медсестр', 'стоматолог', 'инфекцион'])) {
    options.push(`${n} (${c.prof}) в первую же зиму вытащил${g(p, '', 'а')} бункер из лихорадки, а потом всю жизнь делал${g(p, '', 'а')} вид, что это было просто.`);
  }
  if (has(prof, ['инженер', 'механик', 'электрик', 'сантехник', 'строител'])) {
    options.push(`${n} (${c.prof}) собрал${g(p, '', 'а')} систему вентиляции из того, что нашлось, и с тех пор бункер дышит с характерным свистом.`);
  }
  if (has(prof, ['повар', 'пекар', 'агроном', 'биолог', 'ботаник', 'миколог'])) {
    options.push(`${n} (${c.prof}) вырастил${g(p, '', 'а')} в темноте грибы и зелень, и вскоре от этого зависело настроение всей общины.`);
  }
  if (has(prof, ['юрист', 'психотерапевт', 'учитель', 'офицер', 'прокурор'])) {
    options.push(`${n} (${c.prof}) взял${g(p, '', 'а')} на себя споры жителей: к третьему году в бункере появились правила, расписание и даже суд.`);
  }
  if (has(prof, ['хакер', 'радио'])) {
    options.push(`${n} (${c.prof}) каждую ночь ловил${g(p, '', 'а')} эфир и однажды услышал${g(p, '', 'а')} в нём чей-то голос.`);
  }
  if (!options.length) {
    options.push(`${n} (${c.prof}) оказал${g(p, 'ся', 'ась')} тем человеком, о ком в бункере сначала не думали, а потом без него не могли обойтись.`);
  }

  const extras: string[] = [];
  if (c.phobia) extras.push(`Мешала ${low(c.phobia)}: ${g(p, 'ему', 'ей')} пришлось учиться жить с ней в замкнутом пространстве.`);
  if (c.health && !/здоров|идеаль/i.test(c.health)) extras.push(`Здоровье (${low(c.health)}) напоминало о себе в самые неудобные моменты.`);
  if (c.baggage) extras.push(`Ценнее всего оказался багаж: ${low(c.baggage).replace(/\.$/, '')}.`);
  if (c.knowledge) extras.push(`Знание «${low(c.knowledge)}» пригодилось, когда никто уже не надеялся на запасы.`);
  if (c.hobby) extras.push(`По вечерам ${g(p, 'он', 'она')} занимался${g(p, '', 'ась')} своим хобби (${low(c.hobby)}), и это спасало группу от уныния.`);
  if (c.trait) extras.push(`Характер (${low(c.trait)}) делал общую жизнь то легче, то интереснее.`);

  return `${pick(options)} ${pick(extras) || ''}`.trim();
}

function pairs(survivors: Player[]): string {
  if (survivors.length < 2) return '';
  const a = survivors[0];
  const b = survivors[survivors.length - 1];
  const lines = [
    `Дольше всех в бункере спорили ${a.name} и ${b.name}: сначала из-за еды, потом из принципа, а потом уже по привычке.`,
    `${a.name} и ${b.name} поначалу не выносили друг друга, но к пятой зиме именно они делили последний паёк пополам.`,
    `Между ${a.name} и ${b.name} возник негласный союз: они молча проверяли запасы, пока остальные ссорились.`
  ];
  return pick(lines);
}

export function templateStory(room: RoomState): string {
  const all = Object.values(room.players);
  const survivors = all.filter(p => !p.isExiled);
  const exiled = all.filter(p => p.isExiled);
  const years = room.catastrophe?.durationYears || 10;
  const chance = room.survivalChance ?? 50;
  const parts: string[] = [];

  parts.push(`Когда «${room.catastrophe?.title || 'катастрофа'}» накрыла мир, в бункер «${room.shelter?.title || 'Шлюз'}» вошли ${survivors.length}: ${survivors.map(p => p.name).join(', ')}. Двери закрылись, и снаружи осталось всё остальное, включая ${exiled.length ? exiled.map(p => p.name).join(', ') : 'прошлую жизнь'}.`);
  survivors.forEach(p => parts.push(vignette(p)));
  const pr = pairs(survivors);
  if (pr) parts.push(pr);

  const infected = (room.roleResults || []).find(r => r.roleTitle === 'Тайный Зараженный' && r.achieved);
  if (infected) {
    parts.push(`Но у бункера был секрет: ${infected.playerName} пришёл с тихой инфекцией. Сначала это были случайные кашли и странные взгляды, а потом бункер понял, что вопрос был не «заболеет ли кто-то», а «кто следующий».`);
  }

  if (chance >= 80) {
    parts.push(`Через ${years} лет двери открылись. Оставшиеся вышли на солнце, прищурились и поняли, что построили не просто убежище, а новый мир.`);
  } else if (chance >= 55) {
    parts.push(`Через ${years} лет двери открылись. Выжившие вышли поредевшей, но упрямой общиной, и начали с того, что снова научились спорить вслух.`);
  } else if (chance >= 40) {
    parts.push(`К ${years}-му году бункер держался на последних запасах и упрямстве. Выйдут ли они на поверхность, зависело от одной удачной зимы.`);
  } else {
    parts.push(`Хроника бункера оборвалась задолго до открытия дверей. Говорят, последним, что нашли в журнале, была запись: «Нужно было выгнать кого-то другого».`);
  }
  return parts.join('\n\n');
}

function aiPrompt(room: RoomState): string {
  const all = Object.values(room.players);
  const survivors = all.filter(p => !p.isExiled);
  const exiled = all.filter(p => p.isExiled);
  const dossier = (p: Player) => {
    const c = cardsOf(p);
    const role = (room.roleResults || []).find(r => r.playerId === p.id);
    return [
      `Имя: ${p.name}`,
      `Пол и возраст: ${c.bio}`,
      `Профессия: ${c.prof}`,
      `Здоровье: ${c.health}`,
      `Хобби: ${c.hobby}`,
      `Характер: ${c.trait}`,
      `Багаж: ${c.baggage}`,
      `Секрет: ${c.secret}`,
      `Фобия: ${c.phobia}`,
      `Знание: ${c.knowledge}`,
      p.role ? `Тайная роль: ${p.role.title} (${role?.achieved ? 'цель выполнена' : 'цель не выполнена'})` : ''
    ].filter(Boolean).join('\n');
  };
  return [
    `Катастрофа: ${room.catastrophe?.title} (${room.catastrophe?.description}). Бункер: ${room.shelter?.title}, проблемы: ${(room.shelter?.problems || []).slice(0, 2).join('; ')}. Срок изоляции: ${room.catastrophe?.durationYears} лет. Шанс возрождения человечества: ${room.survivalChance}%.`,
    '',
    'ПРОШЛИ В БУНКЕР:',
    ...survivors.map(dossier).map(d => d + '\n'),
    `ИЗГНАНЫ (упомяни одной фразой): ${exiled.map(p => p.name).join(', ') || 'никто'}`
  ].join('\n');
}

const SYSTEM = [
  'Ты пишешь финал настольной игры «Бункер» для компании друзей.',
  'По карточкам выживших напиши связный рассказ на русском языке (250–350 слов, 4–6 абзацев) о том, как они прожили годы в бункере и как взаимодействовали.',
  'Требования: у каждого выжившего должен быть свой яркий момент, который вытекает из его карточек (профессия, здоровье, хобби, характер, багаж, фобия, знание, секрет).',
  'Тон: тёмный юмор, ирония, неожиданные повороты, но без жестокости ради жестокости. Если у игрока тайная роль «Тайный Зараженный» и цель выполнена, сделай её сюжетным поворотом.',
  'Исход соответствует шансу возрождения: высокий шанс означает, что вышли на поверхность общиной; низкий означает, что хроника оборвалась драматично.',
  'Не выдумывай новых игроков, используй только имена из карточек. Не добавляй заголовков, списков и комментариев, только текст рассказа.'
].join(' ');

/** Пытается получить рассказ от модели. Возвращает null, если ключа нет или запрос не удался. */
export async function aiStory(room: RoomState): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.STORY_MODEL || 'claude-haiku-5-5',
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: aiPrompt(room) }]
      })
    });
    if (!res.ok) { console.warn('[Story] API status', res.status); return null; }
    const data: any = await res.json();
    const text = String(data?.content?.[0]?.text || '').trim();
    return text.length > 80 ? text.slice(0, 3500) : null;
  } catch (e) {
    console.warn('[Story] API error', (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
