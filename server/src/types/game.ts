export type CardType =
  | 'profession'
  | 'health'
  | 'biology'
  | 'hobby'
  | 'trait'
  | 'baggage'
  | 'secret'
  | 'condition'
  | 'phobia'
  | 'knowledge'
  | 'actionCard';

export interface Card {
  id: string;
  type: CardType;
  title: string;
  description: string;
  isRevealed: boolean;
  meta?: Record<string, any>;
}

export interface Role {
  id: string;
  title: string;
  description: string;
  goal: string;
  icon: string;
}

export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isExiled: boolean;
  role?: Role;
  cards: Record<CardType, Card>;
  actionCards: Card[];
  votesCount: number;
  hasVoted: boolean;
  audioMuted: boolean;
  videoOff: boolean;
  revealedThisRound: boolean;
  actionCardUsed: boolean;
  hasImmunity: boolean;
  voteWeight: number;
  isConnected: boolean;
}

export interface Catastrophe {
  id: string;
  title: string;
  description: string;
  destructionPercent: number;
  survivorsPercent: number;
  durationYears: number;
  icon: string;
}

export interface Shelter {
  id: string;
  title: string;
  description: string;
  areaSqM: number;
  capacity: number;
  foodWaterYears: number;
  equipment: string[];
  problems: string[];
}

export type GamePhase = 
  | 'LOBBY' 
  | 'INTRO' 
  | 'CARD_REVEAL' 
  | 'DISCUSSION' 
  | 'VOTING' 
  | 'VOTE_RESULTS' 
  | 'GAME_OVER';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
  ghost?: boolean; // сообщение изгнанного: видят только изгнанные
}

export interface VoteRecord {
  voterId: string;
  targetId: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  maxPlayers: number;
  bunkerCapacity: number;
  turnDuration: number;
  currentRound: number;
  phase: GamePhase;
  activePlayerIndex: number;
  catastrophe: Catastrophe | null;
  shelter: Shelter | null;
  players: Record<string, Player>;
  turnOrder: string[];
  votes: Record<string, string>;
  lastExiledPlayerId: string | null;
  chatMessages: ChatMessage[];
  revealedCountInRound: number;
  // Очередь выступлений в фазе обсуждения (управляется сервером).
  speakerId: string | null;
  speakerQueue: string[];
  roundEvent: { title: string; desc: string; needs: string } | null;
  paused: boolean;
  speechDuration: number;
  // Сколько мс осталось у говорящего на момент отправки (без зависимости от часов клиента).
  speechRemainingMs: number;
  // Настройки партии (задаёт хост в лобби)
  secretVoting: boolean;
  // true — никто не видит, кто за кого проголосовал
  survivalChance?: number;
  roleResults?: RoleResult[];
  gameFailed?: boolean;   // шанс выживания < 40% — партия провалена
  lineageEnabled: boolean; // после финала — игра «Продолжить род» для прошедших в бункер
  lineage?: LineageState;
}

// ---- «Продолжить род» ----
export interface LineageOption { id: string; label: string; hint: string; keys: string[]; risk: number }
export interface LineageEvent { id: string; title: string; desc: string; options: LineageOption[] }

export interface LineageEntry {
  generation: number;
  title: string;
  choice: string;
  outcome: 'great' | 'ok' | 'bad';
  text: string;
  population: number;
}

export interface LineageState {
  step: 'CHOOSE' | 'RESULT' | 'DONE';
  generation: number;
  maxGenerations: number;
  startPopulation: number;
  population: number;
  event: LineageEvent | null;
  votes: Record<string, string>;
  history: LineageEntry[];
  extinct: boolean;
  survivorIds: string[];
}

// Итоги тайных ролей (считаются в конце партии)
export interface RoleResult {
  playerId: string;
  playerName: string;
  roleTitle: string;
  goal: string;
  survived: boolean;
  achieved: boolean;
}
