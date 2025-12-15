export enum CardColor {
  RED = 'RED',
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  BLACK = 'BLACK', // Wild cards
}

export enum CardType {
  NUMBER = 'NUMBER',
  SKIP = 'SKIP',
  REVERSE = 'REVERSE',
  DRAW_TWO = 'DRAW_TWO',
  WILD = 'WILD',
  WILD_DRAW_FOUR = 'WILD_DRAW_FOUR',
}

export interface Card {
  id: string; // Unique ID for React keys
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for NUMBER types
}

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  hand: Card[];
  score: number;
  avatar: string;
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  ROUND_OVER = 'ROUND_OVER',
  GAME_OVER = 'GAME_OVER',
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayerIndex: number; // 0 or 1
  direction: 1 | -1; // 1 for clockwise (next), -1 for counter-clockwise
  status: GameStatus;
  winner: string | null;
  currentColor: CardColor; // Tracks active color (important for Wilds)
  aiComment: string;
  isAiThinking: boolean;
  roundWinner?: string; // Name of the round winner
  pointsWon?: number; // Points gained in the last round
}

export interface AiMoveResponse {
  action: 'play' | 'draw';
  cardIndex?: number; // Index in hand
  wildColor?: CardColor; // Required if playing a wild card
  comment: string;
}

export type WittinessLevel = 'Friendly' | 'Sassy' | 'Ruthless';

export interface GameStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  currentStreak: number;
  bestStreak: number;
  totalCardsPlayed: number;
  longestMatchTime: number; // Seconds
  // Map of "Color|Type|Value" -> count
  cardUsage: Record<string, number>;
}

export type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

export interface MultiplayerMessage {
  type: 'STATE_UPDATE' | 'PLAYER_MOVE' | 'PLAYER_DRAW' | 'RESTART_REQUEST';
  payload?: any;
}