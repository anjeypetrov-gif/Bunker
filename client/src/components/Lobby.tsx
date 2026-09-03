import React, { useState } from 'react';
import { Shield, Play, Users, LogIn, Bot, LogOut } from './icons';
import { RoomState } from '../types/game';
import { getBotAvatarArt } from '../data/botAvatars';

interface LobbyProps {
  onCreateRoom: (name: string, avatar: string) => void;
  onJoinRoom: (code: string, name: string, avatar: string) => void;
  onStartGame: () => void;
  onUpdateSettings: (settings: { maxPlayers?: number; turnDuration?: number }) => void;
  onAddBot?: () => void;
  onFillBots?: () => void;
  onLeaveGame?: () => void;
  room: RoomState | null;
  currentSocketId: string;
}

const AVATARS = [
  { id: 'avatar-1', icon: '☣️', label: 'Защитник' },
  { id: 'avatar-2', icon: '👨‍⚕️', label: 'Доктор' },
  { id: 'avatar-3', icon: '👨‍🌾', label: 'Агроном' },
  { id: 'avatar-4', icon: '👷', label: 'Инженер' },
  { id: 'avatar-5', icon: '🕵️', label: 'Разведчик' },
  { id: 'avatar-6', icon: '👩‍🔬', label: 'Ученый' }
];

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onUpdateSettings,
  onAddBot,
  onFillBots,
  onLeaveGame,
  room,
  currentSocketId
}) => {

  const [name, setName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1');
  const [joinMode, setJoinMode] = useState<'CHOICE' | 'CREATE' | 'JOIN'>('CHOICE');

  const isHost = room && room.hostId === currentSocketId;
  const playersCount = room ? Object.keys(room.players).length : 0;

  if (room && room.phase === 'LOBBY') {
    return (
      <div className="max-w-4xl mx-auto my-8 p-6 bg-slate-900/90 border border-slate-800 notch shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-400" />
            <div>
              <h2 className="text-2xl font-black tracking-wider text-slate-100 uppercase font-display">ШЛЮЗ БУНКЕРА</h2>
              <p className="text-xs text-slate-400 font-mono">КОД КОМНАТЫ: <span className="text-amber-400 font-bold text-base px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 notch-sm">{room.code}</span></p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-mono">ВМЕСТИМОСТЬ БУНКЕРА</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">{room.bunkerCapacity} из {playersCount} МЕСТ</span>
            </div>
            {onLeaveGame && (
              <button
                onClick={() => {
                  if (window.confirm('Покинуть комнату?')) onLeaveGame();
                }}
                className="p-2.5 notch-sm border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer shrink-0"
                title="Выйти из игры"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">ВЫЙТИ</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Players List */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> УЧАСТНИКИ В ОЧЕРЕДИ ({playersCount}/{room.maxPlayers})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {Object.values(room.players).map(p => {
                const botArt = getBotAvatarArt(p.avatar);
                const avatarObj = AVATARS.find(a => a.id === p.avatar) || AVATARS[0];
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-3 notch-sm border ${
                      p.id === currentSocketId
                        ? 'bg-amber-500/10 border-amber-500/40 text-white'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                    }`}
                  >
                    {botArt ? (
                      <img
                        src={botArt}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover border border-slate-700/60 shrink-0"
                      />
                    ) : (
                      <span className="text-2xl">{avatarObj.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{p.name}</span>
                        {p.isHost && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 notch-sm font-semibold">
                            ХОСТ
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 block truncate">
                        {p.id === currentSocketId ? 'Вы' : 'Готов к входу'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls & Settings */}
          <div className="bg-slate-950/60 p-4 notch-sm border border-slate-800/80 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">НАСТРОЙКИ МИССИИ</h3>
              {isHost ? (
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">МАКСИМУМ ИГРОКОВ: {room.maxPlayers}</label>
                    <input
                      type="range"
                      min="4"
                      max="12"
                      value={room.maxPlayers}
                      onChange={(e) => onUpdateSettings({ maxPlayers: parseInt(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">ТАЙМЕР ХОДА: {room.turnDuration} СЕК</label>
                    <input
                      type="range"
                      min="30"
                      max="120"
                      step="15"
                      value={room.turnDuration}
                      onChange={(e) => onUpdateSettings({ turnDuration: parseInt(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 space-y-2 font-mono">
                  <p>Ожидание запуска игры организатором...</p>
                  <p>Таймер выступающего: <span className="text-white font-bold">{room.turnDuration} сек</span></p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 space-y-3">
              {isHost && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onAddBot}
                    className="py-2 px-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-[11px] notch-sm border border-amber-500/30 flex items-center justify-center gap-1 transition-all cursor-pointer font-mono"
                  >
                    <Bot className="w-4 h-4 text-amber-400" /> +1 БОТ
                  </button>
                  <button
                    onClick={onFillBots}
                    className="py-2 px-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-[11px] notch-sm border border-amber-500/30 flex items-center justify-center gap-1 transition-all cursor-pointer font-mono"
                  >
                    <Bot className="w-4 h-4 text-amber-400" /> ЗАПОЛНИТЬ
                  </button>
                </div>
              )}

              {isHost ? (
                <button
                  onClick={onStartGame}
                  disabled={playersCount < 2}
                  className={`w-full py-4 px-4 notch font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl ${
                    playersCount >= 2
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30 cursor-pointer active:scale-98'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" /> НАЧАТЬ ИГРУ
                </button>

              ) : (
                <div className="text-center py-2 text-sm text-amber-400 font-mono animate-pulse">
                  Ожидание лидера для старта...
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-slate-900/90 border border-slate-800 notch shadow-2xl backdrop-blur-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border border-amber-500/30 notch-sm mb-3 bunker-glow">
          <Shield className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-wider font-display uppercase">БУНКЕР</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">Психологическая онлайн-игра</p>
      </div>

      {joinMode === 'CHOICE' && (
        <div className="space-y-4">
          <button
            onClick={() => setJoinMode('CREATE')}
            className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold notch shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3 transition-all"
          >
            <Shield className="w-5 h-5" /> СОЗДАТЬ БУНКЕР (ХОСТ)
          </button>
          <button
            onClick={() => setJoinMode('JOIN')}
            className="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold notch border border-slate-700 flex items-center justify-center gap-3 transition-all"
          >
            <LogIn className="w-5 h-5 text-amber-400" /> ВОЙТИ ПО КОДУ
          </button>
        </div>
      )}

      {(joinMode === 'CREATE' || joinMode === 'JOIN') && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">ВАШЕ ИМЯ ИЛИ ПОЗЫВНОЙ</label>
            <input
              type="text"
              placeholder="Например: Станислав, Док"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 notch-sm px-4 py-3 text-slate-100 focus:outline-none focus:border-amber-500 text-sm font-medium"
            />
          </div>

          {joinMode === 'JOIN' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">КОД БУНКЕРА</label>
              <input
                type="text"
                placeholder="6-значный код комнаты"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full bg-slate-950 border border-slate-700 notch-sm px-4 py-3 text-slate-100 focus:outline-none focus:border-amber-500 text-sm font-mono text-center tracking-widest uppercase font-bold"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">ВЫБЕРИТЕ АВАТАР</label>
            <div className="grid grid-cols-3 gap-2">
              {AVATARS.map(av => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => setSelectedAvatar(av.id)}
                  className={`p-2.5 notch-sm border flex flex-col items-center gap-1 transition-all ${
                    selectedAvatar === av.id
                      ? 'bg-amber-500/20 border-amber-500 text-white'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-2xl">{av.icon}</span>
                  <span className="text-[10px] font-medium">{av.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setJoinMode('CHOICE')}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold notch-sm text-sm"
            >
              НАЗАД
            </button>
            <button
              type="button"
              disabled={!name.trim() || (joinMode === 'JOIN' && roomCodeInput.length < 6)}
              onClick={() => {
                if (joinMode === 'CREATE') {
                  onCreateRoom(name, selectedAvatar);
                } else {
                  onJoinRoom(roomCodeInput, name, selectedAvatar);
                }
              }}
              className={`flex-1 py-3 px-4 notch-sm font-bold uppercase tracking-wider text-sm shadow-lg transition-all ${
                name.trim() && (joinMode === 'CREATE' || roomCodeInput.length >= 6)
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {joinMode === 'CREATE' ? 'СОЗДАТЬ БУНКЕР' : 'ПОДКЛЮЧИТЬСЯ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
