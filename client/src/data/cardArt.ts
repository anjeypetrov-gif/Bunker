import { CardType } from '../types/game';

// Maps each specific card VALUE (by its exact in-game title) to an
// illustration file living in client/public/cards/ — Vite serves that
// folder as-is, so the path is just /cards/<file>.
//
// Not every card has art yet (72 total, generated in batches). Missing
// files simply 404 — CharacterCards.tsx and VideoGrid.tsx catch that with
// an onError handler and fall back to the generic icon, so nothing breaks
// as more art gets dropped in later. To add art for a card, drop a PNG
// named to match the slug below into client/public/cards/ — no code
// changes needed.

const BASE = '/cards/';

const PROFESSION: Record<string, string> = {
  'Врач-хирург': 'profession-vrach-khirurg.png',
  'Инженер-гидротехник': 'profession-inzhener-gidrotekhnik.png',
  'Сантехник-электрик': 'profession-santekhnik-elektrik.png',
  'Агроном-биоэколог': 'profession-agronom-bioekolog.png',
  'Физик-ядерщик': 'profession-fizik-yadershchik.png',
  'Пожарный-спасатель': 'profession-pozharnyy-spasatel.png',
  'Программист-робототехник': 'profession-programmist-robototekhnik.png',
  'Психотерапевт': 'profession-psikhoterapevt.png',
  'Повар-технолог': 'profession-povar-tekhnolog.png',
  'Ветеринар-зоолог': 'profession-veterinar-zoolog.png',
  'Офицер тактической разведки': 'profession-ofitser-takticheskoy-razvedki.png',
  'Строитель-каменщик': 'profession-stroitel-kamenshchik.png',
  'Химик-лаборант': 'profession-khimik-laborant.png',
  'Механик автотранспорта': 'profession-mekhanik-avtotransporta.png',
  'Учитель начальных классов': 'profession-uchitel-nachalnykh-klassov.png',
};

const HEALTH: Record<string, string> = {
  'Идеально здоров': 'health-idealno-zdorov.png',
  'Легкая астма': 'health-legkaya-astma.png',
  'Сахарный диабет (1 тип)': 'health-sakharnyy-diabet-1-tip.png',
  'Частичная глухота': 'health-chastichnaya-glukhota.png',
  'Хронический гастрит': 'health-khronicheskiy-gastrit.png',
  'Миопия (-3.5)': 'health-miopiya-3-5.png',
  'Дальтонизм': 'health-daltonizm.png',
  'Бесплодие': 'health-besplodie.png',
  'Высокий иммунитет к инфекциям': 'health-vysokiy-immunitet-k-infektsiyam.png',
  'Перелом руки в гипсе': 'health-perelom-ruki-v-gipse.png',
};

const HOBBY: Record<string, string> = {
  'Охота и рыбалка': 'hobby-okhota-i-rybalka.png',
  'Стрельба из лука': 'hobby-strelba-iz-luka.png',
  'Радиолюбительство': 'hobby-radiolyubitelstvo.png',
  'Первая помощь и дежурство': 'hobby-pervaya-pomoshch-i-dezhurstvo.png',
  'Садоводство и гидропоника': 'hobby-sadovodstvo-i-gidroponika.png',
  'Игра на гитаре и пение': 'hobby-igra-na-gitare-i-penie.png',
  'Шахматы и стратегия': 'hobby-shakhmaty-i-strategiya.png',
  'Рукопашный бой (Самбо)': 'hobby-rukopashnyy-boy-sambo.png',
  'Шитьё и ремонт одежды': 'hobby-shite-i-remont-odezhdy.png',
  'Столярное дело': 'hobby-stolyarnoe-delo.png',
};

const TRAIT: Record<string, string> = {
  'Оптимист': 'trait-optimist.png',
  'Хладнокровный аналитик': 'trait-khladnokrovnyy-analitik.png',
  'Лидерские качества': 'trait-liderskie-kachestva.png',
  'Трудоголик': 'trait-trudogolik.png',
  'Клаустрофобия': 'trait-klaustrofobiya.png',
  'Педант': 'trait-pedant.png',
  'Скромный и молчаливый': 'trait-skromnyy-i-molchalivyy.png',
  'Параноик': 'trait-paranoik.png',
};

const BAGGAGE: Record<string, string> = {
  'Набор хирургических инструментов': 'baggage-nabor-khirurgicheskikh-instrumentov.png',
  'Канистра очищенной воды (20 л)': 'baggage-kanistra-ochishchennoy-vody-20-l.png',
  'Армейский сухой паек (на 1 месяц)': 'baggage-armeyskiy-sukhoy-paek-na-1-mesyats.png',
  'Солнечная панель 100W + Пауэрбанк': 'baggage-solnechnaya-panel-100w-pauerbank.png',
  'Счетчик Гейгера (Дозиметр)': 'baggage-schetchik-geygera-dozimetr.png',
  'Набор семян овощей и злаков': 'baggage-nabor-semyan-ovoshchey-i-zlakov.png',
  'Мощная бензопила + канистра топлива': 'baggage-moshchnaya-benzopila-kanistra-topliva.png',
  'Набор фильтров для очистки воды': 'baggage-nabor-filtrov-dlya-ochistki-vody.png',
  'Электроакустическая гитара': 'baggage-elektroakusticheskaya-gitara.png',
  'Складная ящик инструментов механика': 'baggage-skladnaya-yashchik-instrumentov-mekhanika.png',
};

const SECRET: Record<string, string> = {
  'Служил в спецназе': 'secret-sluzhil-v-spetsnaze.png',
  'Тайный иммунитет': 'secret-taynyy-immunitet.png',
  'Скрытый запас оружия': 'secret-skrytyy-zapas-oruzhiya.png',
  'Фальшивый диплом': 'secret-falshivyy-diplom.png',
  'Спас 5 человек': 'secret-spas-5-chelovek.png',
  'Знает инженерный план бункера': 'secret-znaet-inzhenernyy-plan-bunkera.png',
};

// NOTE (02.09): these 5 files are temporary placeholders — the real
// action-card illustrations from Gemini never arrived in full resolution
// (only tiny preview icons inside a shared contact sheet, see project
// notes), so each filename below currently holds a COPY of a thematically
// close image from another category (optimism → second chance, leadership
// → double vote, a profession icon → profession swap, surgical kit →
// health check, secret immunity → round immunity). Drop the real
// full-resolution art into these exact filenames whenever it's ready —
// no code change needed, same as the rest of this table.
const ACTION: Record<string, string> = {
  'Второй шанс': 'action-vtoroy-shans.png',
  'Удвоение голоса': 'action-udvoenie-golosa.png',
  'Обмен профессией': 'action-obmen-professiey.png',
  'Проверка здоровья': 'action-proverka-zdorovya.png',
  'Иммунитет раунда': 'action-immunitet-raunda.png',
};

// Biology cards don't have a stable title in decks.ts — GameEngine.ts builds
// it on the fly as `${sex}, ${age} лет`, so we match by (sex, age) instead.
const BIOLOGY: Array<{ sex: string; age: number; file: string }> = [
  { sex: 'Мужчина', age: 24, file: 'biology-muzhchina-24.png' },
  { sex: 'Женщина', age: 26, file: 'biology-zhenshchina-26.png' },
  { sex: 'Мужчина', age: 35, file: 'biology-muzhchina-35.png' },
  { sex: 'Женщина', age: 29, file: 'biology-zhenshchina-29.png' }, // placeholder (02.09): copy of the 26-year-old portrait, closest age match — swap in real art whenever it arrives
  { sex: 'Мужчина', age: 42, file: 'biology-muzhchina-42.png' },
  { sex: 'Женщина', age: 38, file: 'biology-zhenshchina-38-mat.png' },
  { sex: 'Мужчина', age: 19, file: 'biology-muzhchina-19.png' },
  { sex: 'Женщина', age: 22, file: 'biology-zhenshchina-22-sportsmenka.png' },
];

const BY_TYPE: Partial<Record<CardType, Record<string, string>>> = {
  profession: PROFESSION,
  health: HEALTH,
  hobby: HOBBY,
  trait: TRAIT,
  baggage: BAGGAGE,
  secret: SECRET,
  actionCard: ACTION,
};

/** Returns the /cards/... URL for a card's art, or null if none is mapped. */
export function getCardArt(type: CardType, title: string): string | null {
  if (type === 'biology') {
    const match = title.match(/^(.+?),\s*(\d+)\s*лет$/);
    if (!match) return null;
    const sex = match[1];
    const age = parseInt(match[2], 10);
    const entry = BIOLOGY.find(b => b.sex === sex && b.age === age);
    return entry ? BASE + entry.file : null;
  }
  const table = BY_TYPE[type];
  const file = table ? table[title] : undefined;
  return file ? BASE + file : null;
}
