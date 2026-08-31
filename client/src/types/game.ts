export type CardType = 
  | 'profession' 
  | 'health' 
  | 'biology' 
  | 'hobby' 
  | 'trait' 
  | 'baggage' 
  | 'secret' 
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
}
