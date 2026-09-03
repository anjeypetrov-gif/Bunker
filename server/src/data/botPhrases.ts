import { CardType } from '../types/game';

// Библиотека шаблонов реплик для ботов в чате. Каждая функция принимает
// реальные данные текущей партии (заголовки карт, имена игроков,
// катастрофу/бункер) и возвращает готовую фразу — так боты "аргументируют"
// по-настоящему релевантным контентом партии, а не одной случайной строкой
// из фиксированного списка.

export const CARD_TYPE_LABELS_RU: Record<CardType, string> = {
  profession: 'профессия',
  health: 'здоровье',
  biology: 'биология',
  hobby: 'хобби',
  trait: 'черта характера',
  baggage: 'багаж',
  secret: 'секретный факт',
  condition: 'условие/бонус',
  actionCard: 'спецкарта'
};

type SelfTemplate = (label: string, title: string, desc: string) => string;
export const SELF_ARGUMENT_TEMPLATES: SelfTemplate[] = [
  (label, title, desc) => `Обратите внимание на мою карту «${label}»: ${title}. ${desc}`,
  (label, title, desc) => `У меня весомый довод — ${label}: «${title}». ${desc}`,
  (label, title, desc) => `Не забывайте про мою карту «${label}»: ${title}. ${desc} Это точно пригодится бункеру.`,
  (label, title, desc) => `${title} — вот моя карта «${label}». ${desc} Думаю, это говорит само за себя.`,
  (label, title, desc) => `Раз уж заговорили о пользе — вот моё преимущество (${label}): ${title}. ${desc}`
];

type ConditionTemplate = (title: string, desc: string) => string;
export const CONDITION_TEMPLATES: ConditionTemplate[] = [
  (title, desc) => `Кстати, у меня есть козырь — «${title}»: ${desc}`,
  (title, desc) => `Напомню о своём качестве «${title}»: ${desc} Пригодится группе.`,
  (title, desc) => `Не только карты решают — вот моё преимущество: «${title}». ${desc}`
];

type ContextTemplate = (catastropheTitle: string, shelterTitle: string, bunkerCapacity: number, foodWaterYears: number, problem?: string) => string;
export const CONTEXT_TEMPLATES: ContextTemplate[] = [
  (cat, shelter, cap) => `Не забывайте — у нас случилась «${cat}», а в бункере «${shelter}» всего ${cap} мест. Каждое решение должно быть взвешенным.`,
  (_cat, shelter, _cap, years) => `Запасов в «${shelter}» хватит на ${years} лет — если наберём правильных людей, шансы выжить велики.`,
  (cat, _shelter, _cap, _years, problem) => problem
    ? `Учитывая проблему бункера («${problem}»), нам точно нужны практичные руки, а не только теория.`
    : `«${cat}» никого не пощадила — нельзя брать в бункер случайных людей, слишком высокая цена ошибки.`
];

type AttackNoCardsTemplate = (name: string) => string;
export const ATTACK_NO_CARDS_TEMPLATES: AttackNoCardsTemplate[] = [
  name => `Меня настораживает, что ${name} до сих пор ничего не раскрыл(а). Есть что скрывать?`,
  name => `${name}, а не пора ли показать хоть одну характеристику группе?`,
  name => `Пока ${name} держит карты в тайне, доверия к нему/ней у меня немного.`
];

type AttackWithCardTemplate = (name: string, revealedCount: number) => string;
export const ATTACK_WITH_CARD_TEMPLATES: AttackWithCardTemplate[] = [
  (name, n) => `${name} раскрыл(а) только ${n} из 8 карт. Разве этого достаточно, чтобы доверять на равных?`,
  (name, n) => `У ${name} открыто ${n} из 8 карт — маловато, чтобы судить о реальной пользе.`,
  name => `Хотелось бы, чтобы ${name} был(а) чуть откровеннее с группой.`
];

type AllianceTemplate = (speakerName: string) => string;
export const ALLIANCE_TEMPLATES: AllianceTemplate[] = [
  name => `Согласен(на) с ${name} — нужно смотреть на реальную пользу, а не на эмоции.`,
  name => `Поддерживаю ${name}. Мест в бункере мало, нельзя ошибаться.`,
  name => `${name}, разумная мысль, но я бы всё же обращал(а) внимание на навыки, а не только на слова.`,
  name => `Не совсем согласен(на) с ${name} — по-моему, стоит взглянуть на ситуацию шире.`
];

export const DEFENSE_TEMPLATES: string[] = [
  'Прошу не судить только по одной характеристике — у меня есть и другие сильные стороны.',
  'Да, у меня есть слабые места, но польза от меня всё равно перевесит любые риски.',
  'Не всё решают идеальные карты — важно ещё и то, как человек ведёт себя в группе.'
];

type VoteReasonWithCountTemplate = (name: string, revealedCount: number) => string;
export const VOTE_REASON_WITH_CARDS_TEMPLATES: VoteReasonWithCountTemplate[] = [
  (name, n) => `Голосую против ${name}: при ${n} из 8 раскрытых карт сложно понять, чем он/она полезнее остальных.`,
  (name) => `Мой голос — против ${name}. Пока не вижу веских причин доверять больше, чем другим.`
];

type VoteReasonTemplate = (name: string) => string;
export const VOTE_REASON_NO_CARDS_TEMPLATES: VoteReasonTemplate[] = [
  name => `Голосую против ${name} — молчание вызывает больше вопросов, чем ответов.`,
  name => `${name} до сих пор ничего не раскрыл(а). Мой голос — против.`
];

type ResultExiledTemplate = (exiledName: string) => string;
export const RESULT_EXILED_TEMPLATES: ResultExiledTemplate[] = [
  name => `Печально, но выбор сделан — удачи ${name} на поверхности.`,
  name => `Решение принято. Бункер стал немного безопаснее без ${name}.`,
  name => `Жаль ${name}, но у группы был свой резон.`
];

export const RESULT_NONE_TEMPLATES: string[] = [
  'Похоже, в этот раз никто не покинул бункер. Продолжим в следующем раунде.',
  'Никого не изгнали — что ж, у всех есть ещё один шанс проявить себя.'
];

type HumanReactionTemplate = (name: string) => string;
export const HUMAN_REACTION_AGREE_TEMPLATES: HumanReactionTemplate[] = [
  name => `${name}, согласен(на) — нужно решать по фактам, а не по эмоциям.`,
  name => `Хорошая мысль, ${name}. Учту это при голосовании.`
];
export const HUMAN_REACTION_DISAGREE_TEMPLATES: HumanReactionTemplate[] = [
  name => `${name}, услышал(а) тебя, но не думаю, что это меняет расклад сил.`,
  name => `Интересная позиция, ${name}. Но я по-прежнему считаю иначе.`
];

export const FILLER_TEMPLATES: string[] = [
  'Пока присматриваюсь к остальным — рано делать выводы.',
  'Давайте не будем спешить с оценками, всё-таки от этого зависят жизни.',
  'Молчание — тоже стратегия, но я лучше буду действовать открыто.'
];
