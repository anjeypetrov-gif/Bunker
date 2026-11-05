import React from 'react';
import { Trophy, Skull, Home, RefreshCw } from './icons';
import { RoomState } from '../types/game';
import { LineagePanel } from './LineagePanel';
import { sfx } from '../utils/sfx';

interface GameOverProps {
  room: RoomState;
  currentSocketId: string;
  onRestart: () => void;
  onStartLineage: () => void;
  onLineageVote: (optionId: string) => void;
  onLineageResolve: () => void;
  onLineageNext: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({
  room,
  currentSocketId,
  onRestart,
  onStartLineage,
  onLineageVote,
  onLineageResolve,
  onLineageNext
}) => {
  const isHost = room.hostId === currentSocketId;
  const survivors = Object.values(room.players).filter(p => !p.isExiled);
  const exiled = Object.values(room.players).filter(p => p.isExiled);

  // Оценка бункера по составу выживших (по названиям их карт)
  const titles = (get: (p: typeof survivors[number]) => string | undefined) =>
    survivors.map(p => (get(p) || '').toLowerCase());
  const profs = titles(p => p.cards.profession?.title);
  const healths = titles(p => p.cards.health?.title);
  const extras = survivors.map(p =>
    [p.cards.hobby?.title, p.cards.baggage?.title, p.cards.trait?.title, p.cards.condition?.title].join(' ').toLowerCase());
  const has = (list: string[], words: string[]) => list.some(t => words.some(w => t.includes(w)));

  const hasDoctor = has(profs, ['врач', 'хирург', 'медсестр', 'стоматолог']) || has(extras, ['первая помощь', 'аптечк']);
  const hasEngineer = has(profs, ['инженер', 'сантехник', 'механик', 'строител', 'электрик', 'радиоинженер', 'геолог']);
  const hasAgronomist = has(profs, ['агроном', 'биолог', 'повар', 'пекарь', 'биотехнолог']) || has(extras, ['сад', 'семян']);
  const hasLeader = has(profs, ['психотерапевт', 'юрист', 'учитель', 'офицер']) || has(extras, ['лидер', 'дипломат', 'переговорщик']);
  const badHealth = healths.filter(t =>
    ['диабет', 'астма', 'гастрит', 'глухот', 'миопия', 'перелом', 'мигрен', 'гипертон', 'протез', 'слабое сердце', 'дальтонизм'].some(w => t.includes(w))).length;

  let survivalChance = 40;
  if (hasDoctor) survivalChance += 18;
  if (hasEngineer) survivalChance += 14;
  if (hasAgronomist) survivalChance += 14;
  if (hasLeader) survivalChance += 8;
  survivalChance -= Math.min(24, badHealth * 6);
  if (survivors.length < room.bunkerCapacity) survivalChance -= 10;
  survivalChance = Math.min(97, Math.max(8, survivalChance));
  if (typeof room.survivalChance === 'number') survivalChance = room.survivalChance;
  const failed = room.gameFailed ?? survivalChance < 40;

  const missing: string[] = [];
  if (!hasDoctor) missing.push('врача');
  if (!hasEngineer) missing.push('инженера');
  if (!hasAgronomist) missing.push('человека, который накормит группу');
  const years = room.catastrophe?.durationYears || 10;
  const verdict = survivalChance >= 80 ? 'Сильная команда' : survivalChance >= 55 ? 'Держатся на упрямстве' : survivalChance >= 35 ? 'Шаткое убежище' : 'Бункер доживает последние месяцы';
  const epilogue =
    survivalChance >= 80
      ? `Бункер встретил «${room.catastrophe?.title || 'катастрофу'}» с запасом: у группы есть и руки, и голова. Через ${years} лет двери откроются, и выжившие выйдут уже не группой незнакомцев, а основателями нового мира.`
      : survivalChance >= 55
      ? `Группа держится: первые годы были трудными, но общими усилиями им удалось не потерять голову. Не хватало ${missing.length ? missing.join(', ') : 'удачи'}, и именно это стало причиной самых громких ссор.`
      : survivalChance >= 35
      ? `Без ${missing.length ? missing.join(' и ') : 'надёжного плана'} зима выдалась тяжёлой. Запасы таяли, болезни не отпускали, но вера в общее дело всё же не давала сдаться. Дальше всё решит одна-две удачные зимы.`
      : `Бункер заперт, но внутри не хватало слишком многого${missing.length ? `: ${missing.join(', ')}` : ''}. Хроника прервалась на третьей зиме. Возможно, голосование было слишком поспешным.`;

  const shareText = `БУНКЕР — итог партии\n${verdict}: шанс на возрождение ${survivalChance}%${failed ? ' (ПРОВАЛ)' : ''}\nВыжили: ${survivors.map(p => p.name).join(', ')}\nИзгнаны: ${exiled.map(p => p.name).join(', ') || 'никто'}\nИграть: ${window.location.origin}`;
  const roleResults = room.roleResults || [];
  const infected = roleResults.find(r => r.roleTitle === 'Тайный Зараженный');
  const alarmKey = `${room.code}:${infected?.playerId || ''}:${infected?.achieved ? 1 : 0}`;
  React.useEffect(() => {
    if (infected?.achieved) sfx.alarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmKey]);
  const [shared, setShared] = React.useState(false);
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: shareText }); return; }
      await navigator.clipboard.writeText(shareText);
      setShared(true); setTimeout(() => setShared(false), 2000);
    } catch { window.prompt('Скопируйте результат:', shareText); }
  };

  return (
    <div className="max-w-4xl mx-auto my-8 p-6 bg-slate-900 border border-slate-800 notch shadow-2xl space-y-6">
      <div className="text-center space-y-2 border-b border-slate-800 pb-6">
        <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/30 notch mb-2 bunker-glow">
          <Trophy className="w-12 h-12 text-amber-400" />
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-wider uppercase font-display">
          {failed ? 'ПРОВАЛЬНАЯ ПАРТИЯ' : 'БУНКЕР УСПЕШНО ЗАПЕЧАТАН!'}
        </h1>
        {failed && (
          <p className="text-sm font-bold text-red-400 font-mono uppercase">Шанс выживания ниже 40%: группа подобрана неудачно</p>
        )}
        <p className="text-sm text-slate-400 font-mono">
          Двери закрыты. Группа изоляции готова к выживанию в течение {room.catastrophe?.durationYears || 10} лет.
        </p>
      </div>

      {infected?.achieved && (
        <div className="p-4 notch border-2 border-red-500 bg-red-950/50 text-center animate-pulse">
          <div className="text-xl font-black text-red-400 uppercase tracking-widest font-display">⚠ ТРЕВОГА: В БУНКЕРЕ ЗАРАЖЁННЫЙ</div>
          <p className="text-sm text-red-200 mt-1">Тайный зараженный пробрался внутрь и выиграл свою партию.</p>
        </div>
      )}

      {roleResults.length > 0 && (
        <div className="bg-slate-950 p-4 notch border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-widest text-center">ТАЙНЫЕ ЦЕЛИ ИГРОКОВ</div>
          {roleResults.map(r => (
            <div key={r.playerId} className={`p-2.5 border notch-sm text-xs flex items-start justify-between gap-3 ${r.achieved ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-slate-800 bg-slate-900'}`}>
              <div>
                <div className="font-bold text-slate-100 text-sm">{r.playerName} · <span className="text-amber-300">{r.roleTitle}</span></div>
                <div className="text-slate-400">{r.goal}</div>
              </div>
              <span className={`font-mono font-bold whitespace-nowrap ${r.achieved ? 'text-emerald-400' : 'text-red-400'}`}>{r.achieved ? 'ЦЕЛЬ ВЫПОЛНЕНА' : 'ПРОВАЛ'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Survival Rating Card */}
      <div className="bg-slate-950 p-6 notch border border-slate-800 text-center space-y-3">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">
          ШАНС НА ВОЗРОЖДЕНИЕ ЧЕЛОВЕЧЕСТВА
        </div>
        <div className={`text-5xl font-black font-mono ${failed ? 'text-red-400' : 'text-amber-400'}`}>
          {survivalChance}%
        </div>
        <div className="text-sm font-bold text-slate-100 uppercase tracking-wider">{verdict}</div>
        <p className="text-sm text-slate-300 font-sans leading-relaxed max-w-xl mx-auto">{epilogue}</p>
        <div className="flex justify-center gap-4 text-xs font-mono text-slate-400 pt-2">
          <span>Врачебный уход: <strong className={hasDoctor ? 'text-emerald-400' : 'text-red-400'}>{hasDoctor ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
          <span>Инженерный блок: <strong className={hasEngineer ? 'text-emerald-400' : 'text-red-400'}>{hasEngineer ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
          <span>Продовольствие: <strong className={hasAgronomist ? 'text-emerald-400' : 'text-red-400'}>{hasAgronomist ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
          <span>Лидер: <strong className={hasLeader ? 'text-emerald-400' : 'text-red-400'}>{hasLeader ? 'ЕСТЬ' : 'НЕТ'}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Survivors inside */}
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 notch-sm space-y-3">
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <Home className="w-4 h-4" /> В БУНКЕРЕ ({survivors.length})
          </h3>
          <div className="space-y-2">
            {survivors.map(p => (
              <div key={p.id} className="p-3 bg-slate-900 notch-sm border border-slate-800 text-xs space-y-1">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>{p.name}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">ВЫЖИЛ</span>
                </div>
                <div className="text-slate-400">Профессия: <span className="text-amber-300 font-semibold">{p.cards.profession?.title}</span></div>
                <div className="text-slate-400">Здоровье: <span className="text-slate-200">{p.cards.health?.title}</span></div>
                <div className="text-slate-400">Багаж: <span className="text-amber-200">{p.cards.baggage?.title}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Exiled outside */}
        <div className="bg-red-950/20 border border-red-900/40 p-4 notch-sm space-y-3">
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
            <Skull className="w-4 h-4" /> ИЗГНАНО СНАРУЖИ ({exiled.length})
          </h3>
          <div className="space-y-2">
            {exiled.map(p => (
              <div key={p.id} className="p-3 bg-slate-900/60 notch-sm border border-slate-800/80 text-xs space-y-1 opacity-75">
                <div className="font-bold text-slate-300 text-sm flex items-center justify-between">
                  <span>{p.name}</span>
                  <span className="text-[10px] text-red-400 font-mono">ИЗГНАН</span>
                </div>
                <div className="text-slate-400">Профессия: <span className="text-slate-300">{p.cards.profession?.title}</span></div>
                <div className="text-slate-400">Здоровье: <span className="text-slate-300">{p.cards.health?.title}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {room.lineageEnabled && survivors.length > 0 && (
        <LineagePanel room={room} currentSocketId={currentSocketId} onStart={onStartLineage} onVote={onLineageVote} onResolve={onLineageResolve} onNext={onLineageNext} />
      )}

      <div className="pt-4 border-t border-slate-800 text-center">
        <button
          onClick={share}
          className="py-3 px-6 border border-slate-600 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold notch inline-flex items-center gap-2 uppercase tracking-wider text-xs transition-all cursor-pointer"
        >
          {shared ? '✓ Скопировано' : '📤 Поделиться результатом'}
        </button>
      </div>

      {isHost && (
        <div className="pt-4 text-center">
          <button
            onClick={onRestart}
            className="py-4 px-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold notch shadow-lg shadow-amber-500/30 inline-flex items-center gap-3 uppercase tracking-wider text-sm transition-all cursor-pointer"
          >
            <RefreshCw className="w-5 h-5" /> СЫГРАТЬ ЕЩЕ РАЗ
          </button>
        </div>
      )}
    </div>
  );
};
