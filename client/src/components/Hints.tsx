import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RoomState } from '../types/game';
import { X } from './icons';

const LS_KEY = 'bunker:hints';

function readEnabled(): boolean {
  try { return localStorage.getItem(LS_KEY) !== 'off'; } catch { return true; }
}
function writeEnabled(v: boolean) {
  try { localStorage.setItem(LS_KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
}

interface HintProps {
  room: RoomState;
  currentSocketId: string;
  onOpenHelp: () => void;
}

/** Короткая подсказка «что делать сейчас» под шапкой. Зависит от фазы и роли игрока. */
export const HintBar: React.FC<HintProps> = ({ room, currentSocketId, onOpenHelp }) => {
  const [enabled, setEnabled] = useState(readEnabled);
  const [dismissedKey, setDismissedKey] = useState<string>('');
  const me = room.players[currentSocketId];
  const isHost = room.hostId === currentSocketId;

  let key = room.phase as string;
  let text: string | null = null;
  let action: { label: string; run: () => void } | null = null;

  if (me?.isExiled) {
    key = 'EXILED';
    text = 'Вас изгнали. Вы наблюдаете за игрой — голосовать и говорить больше нельзя.';
  } else {
    switch (room.phase) {
      case 'INTRO':
        text = 'Прочитайте катастрофу и описание бункера. Мест меньше, чем игроков — кого-то придётся исключить.';
        break;
      case 'CARD_REVEAL':
        if (me && !me.revealedThisRound) {
          key = 'CARD_REVEAL_TODO';
          text = 'Откройте ПЛАНШЕТ и раскройте одну карту, которая лучше всего убедит остальных, что вы нужны в бункере.';
          action = { label: 'Открыть планшет', run: () => window.dispatchEvent(new Event('bunker:open-dossier')) };
        } else {
          text = 'Вы раскрыли карту. Ждите остальных — нажмите на карту игрока в плитке, чтобы рассмотреть её.';
        }
        break;
      case 'DISCUSSION':
        if (room.speakerId === currentSocketId) {
          key = 'DISC_ME';
          text = 'Ваше слово! Скажите, чем вы полезны, и можно ли доверять соседям. Нажмите «Закончил», если успели раньше.';
        } else {
          text = 'Слушайте выступающего и запоминайте аргументы. Подозрения можно записать в чат.';
        }
        break;
      case 'VOTING':
        text = 'Выберите, кого исключить из бункера. Голос можно отдать только одному игроку.';
        break;
      case 'VOTE_RESULTS':
        text = 'Итоги голосования. Дальше начнётся новый раунд — откройте следующую карту.';
        break;
      default:
        text = null;
    }
  }

  useEffect(() => { setDismissedKey(''); }, [room.phase, room.currentRound]);

  if (!enabled || !text || dismissedKey === key) {
    return (
      <div className="shrink-0 px-2.5 pt-1 flex justify-end">
        <button
          onClick={() => { if (!enabled) { setEnabled(true); writeEnabled(true); } else onOpenHelp(); }}
          className="text-[10px] font-mono text-slate-500 hover:text-amber-300 cursor-pointer"
        >
          {enabled ? '? Как играть' : '? Включить подсказки'}
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 mx-2.5 mt-2 p-2 notch-sm border border-sky-500/30 [@media(max-height:760px)]:hidden bg-sky-950/30 text-[11px] md:text-xs font-sans text-sky-100 flex items-start gap-2">
      <span className="text-sky-300 font-black font-mono shrink-0">ПОДСКАЗКА</span>
      <span className="flex-1 leading-snug">{text}</span>
      {action && (
        <button onClick={action.run} className="shrink-0 px-2 py-1 notch-sm bg-sky-500 text-slate-950 font-bold font-mono text-[10px] cursor-pointer">
          {action.label}
        </button>
      )}
      <button onClick={onOpenHelp} className="shrink-0 text-sky-300 font-mono underline cursor-pointer">Правила</button>
      <button
        onClick={() => setDismissedKey(key)}
        onDoubleClick={() => { setEnabled(false); writeEnabled(false); }}
        title="Закрыть (двойной клик — выключить подсказки)"
        className="shrink-0 text-sky-300 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const HelpSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [enabled, setEnabled] = useState(readEnabled);
  const steps: Array<[string, string]> = [
    ['Цель', 'Выжить и попасть в бункер. Мест меньше, чем игроков, поэтому каждый раунд один игрок изгоняется голосованием.'],
    ['1. Раскрытие', 'Каждый раунд открывайте по одной карте из ПЛАНШЕТА: профессия, здоровье, хобби, черта, багаж, секрет.'],
    ['2. Обсуждение', 'Все выступают по очереди — на экране таймер. Убедите остальных, что вы нужны бункеру, и найдите слабые места соперников.'],
    ['3. Голосование', 'Проголосуйте за того, кого исключить. Больше всех голосов — выбывает.'],
    ['Спецкарта', 'У каждого есть одна особая карта действия — используйте её вовремя из планшета.'],
    ['Видео и звук', 'Кнопки микрофона и камеры — внизу. Если собеседника не видно, подождите несколько секунд: идёт соединение.'],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:max-w-md max-h-[85dvh] overflow-y-auto bg-slate-900 border border-amber-500/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 font-mono text-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-amber-300 font-black text-sm">КАК ИГРАТЬ</span>
          <button onClick={onClose} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {steps.map(([t, d]) => (
          <div key={t} className="space-y-0.5">
            <div className="text-amber-400 font-bold">{t}</div>
            <div className="text-slate-300 font-sans leading-relaxed">{d}</div>
          </div>
        ))}
        <label className="flex items-center gap-2 pt-2 border-t border-slate-800 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => { setEnabled(e.target.checked); writeEnabled(e.target.checked); }}
          />
          Показывать подсказки по ходу игры
        </label>
      </div>
    </div>,
    document.body
  );
};
