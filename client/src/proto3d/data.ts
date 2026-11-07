import type { CardType } from '../types/game';

/** Профессии и багаж из колоды игры — их выбирает игрок, ими же наделяются боты. */
export const PROFESSIONS = [
  'Механик-дизелист', 'Радиоинженер связи', 'Врач скорой помощи', 'Медсестра-реаниматолог',
  'Ботаник', 'Биотехнолог-селекционер', 'Эколог-гидролог', 'Инструктор по выживанию',
  'Логист-кладовщик', 'Юрист-арбитр', 'Хакер', 'Криминалист', 'Пекарь-кондитер'
];

export const BAGGAGE = [
  'Топор и мультитул', 'Лопата', 'Набор для первой помощи', 'Запас противовирусных препаратов',
  'Портативный зарядник', 'Рация дальнего действия', 'Пакет с семенами', 'Портативный фильтр для воды',
  'Ручной насос-фильтр для воды'
];

export const cardType = (t: 'profession' | 'baggage'): CardType => t as CardType;

export type IncidentType = 'leak' | 'power' | 'vent' | 'mold' | 'rats' | 'fever' | 'radio' | 'panic' | 'theft';

export interface IncidentDef {
  type: IncidentType;
  title: string;          // как в игровых сценариях
  hint: string;
  room: string;           // id комнаты
  icon: string;
  color: number;
  severity: number;       // %/с урона целостности, пока не устранено
  pros: string[];         // профессии, ускоряющие починку
  tools: string[];        // багаж, ускоряющий починку
  verb: string;
  alert: string;          // реплика бота при обнаружении
}

export const INCIDENTS: Record<IncidentType, IncidentDef> = {
  leak: {
    type: 'leak', title: 'Протечка в шлюзе', hint: 'Нужны слесарные навыки и инструмент', room: 'airlock', icon: '💧', color: 0x4fc3f7, severity: 0.42,
    pros: ['Механик-дизелист', 'Эколог-гидролог'], tools: ['Топор и мультитул', 'Ручной насос-фильтр для воды'], verb: 'Закручиваю гайку', alert: 'Протечка в шлюзе!'
  },
  power: {
    type: 'power', title: 'Отключилось питание', hint: 'Нужен механик или радиоинженер', room: 'generator', icon: '⚡', color: 0xffe14d, severity: 0.5,
    pros: ['Механик-дизелист', 'Радиоинженер связи'], tools: ['Портативный зарядник', 'Топор и мультитул'], verb: 'Запускаю генератор', alert: 'Свет погас! Генератор встал!'
  },
  vent: {
    type: 'vent', title: 'Обрушение вентиляции', hint: 'Разобрать завал: лопата, топор, опыт выживания', room: 'vent', icon: '🌬', color: 0xb0b6bd, severity: 0.36,
    pros: ['Инструктор по выживанию', 'Механик-дизелист'], tools: ['Лопата', 'Топор и мультитул'], verb: 'Разбираю завал', alert: 'Вентиляцию завалило!'
  },
  mold: {
    type: 'mold', title: 'Плесень в оранжерее', hint: 'Нужны ботаник или биолог, семена, фильтр', room: 'greenhouse', icon: '🍄', color: 0x7ddc5a, severity: 0.28,
    pros: ['Ботаник', 'Биотехнолог-селекционер', 'Эколог-гидролог'], tools: ['Пакет с семенами', 'Портативный фильтр для воды'], verb: 'Очищаю грядки', alert: 'Плесень в оранжерее!'
  },
  rats: {
    type: 'rats', title: 'Стая крыс на складе', hint: 'Нужны выживальщик или кладовщик', room: 'storage', icon: '🐀', color: 0xb08a5a, severity: 0.26,
    pros: ['Инструктор по выживанию', 'Логист-кладовщик'], tools: ['Топор и мультитул', 'Лопата'], verb: 'Гоню крыс', alert: 'Крысы на складе!'
  },
  fever: {
    type: 'fever', title: 'Вспышка лихорадки', hint: 'Нужен врач и лекарства', room: 'medical', icon: '🤒', color: 0xff5a6a, severity: 0.42,
    pros: ['Врач скорой помощи', 'Медсестра-реаниматолог'], tools: ['Набор для первой помощи', 'Запас противовирусных препаратов'], verb: 'Лечу больных', alert: 'Лихорадка в медблоке!'
  },
  radio: {
    type: 'radio', title: 'Сбой связи', hint: 'Нужен радиоинженер, хакер или рация', room: 'radio', icon: '📡', color: 0x6a8bff, severity: 0.16,
    pros: ['Радиоинженер связи', 'Хакер'], tools: ['Рация дальнего действия', 'Портативный зарядник'], verb: 'Настраиваю связь', alert: 'Пропала связь с поверхностью!'
  },
  panic: {
    type: 'panic', title: 'Паника в отсеке', hint: 'Успокоить людей: юрист, врач', room: 'hub', icon: '😱', color: 0xff9a3c, severity: 0.32,
    pros: ['Юрист-арбитр', 'Врач скорой помощи', 'Медсестра-реаниматолог'], tools: [], verb: 'Успокаиваю людей', alert: 'Паника в жилом зале!'
  },
  theft: {
    type: 'theft', title: 'Ночная кража', hint: 'Найти вора: криминалист, юрист, хакер', room: 'workshop', icon: '🕵', color: 0xc77dff, severity: 0.22,
    pros: ['Криминалист', 'Юрист-арбитр', 'Хакер'], tools: [], verb: 'Веду расследование', alert: 'В мастерской пропали инструменты!'
  }
};

export interface Theme {
  id: string; name: string; sub: string;
  wall: number; floor: number; lamp: number; accent: number; fog: number;
  weights: Partial<Record<IncidentType, number>>;
}

/** Бункеры из сценариев игры: меняют палитру и «характер» аварий. */
export const THEMES: Theme[] = [
  { id: 'titan', name: 'Титан-9', sub: 'Автономный бункер', wall: 0x4a525e, floor: 0x2b3039, lamp: 0xffa23a, accent: 0xe8a33d, fog: 0x07090d, weights: {} },
  { id: 'neptune', name: 'Нептун', sub: 'Подводная база: чаще течи', wall: 0x2f5560, floor: 0x1f3a44, lamp: 0x6fd8e8, accent: 0x4fd0e0, fog: 0x04101a, weights: { leak: 3, mold: 1.4 } },
  { id: 'salt', name: 'Глубина-7', sub: 'Соляная шахта: обвалы и завалы', wall: 0x8a7f80, floor: 0x4c4547, lamp: 0xffc8b0, accent: 0xff9d8a, fog: 0x100a0c, weights: { vent: 3, rats: 1.3 } },
  { id: 'eagle', name: 'Орлиное гнездо', sub: 'Горный бункер: энергия и связь', wall: 0x4d5a70, floor: 0x2a3140, lamp: 0xbcd4ff, accent: 0x8fb4ff, fog: 0x070b14, weights: { power: 3, radio: 2.2 } },
  { id: 'ark', name: 'Ковчег XXI', sub: 'Биокомплекс: плесень и лихорадка', wall: 0x3f5a46, floor: 0x24352a, lamp: 0xc8ff9a, accent: 0x7ddc5a, fog: 0x06100a, weights: { mold: 3, fever: 2.2 } }
];

export const BOT_NAMES = ['Алексей', 'Мария', 'Виктор', 'Ольга'];
export const BOT_SAY = {
  claim: ['Беру на себя!', 'Я разбираюсь в этом!', 'Бегу!', 'Сейчас всё исправлю!'],
  noskill: ['Я не спец, но помогу!', 'Руки есть — попробую!', 'Хоть чем-то помогу…'],
  work: ['Работаю…', 'Почти…', 'Держится!'],
  done: ['Готово!', 'Исправлено!', 'Порядок!'],
  panic: ['Мы все умрём!', 'Что делать?!', 'Нам конец!', 'Спасайся кто может!'],
  thanks: ['Спасибо, что позвал!', 'Иду на помощь!', 'Уже бегу!']
};
