import { GameStats, Card, CardType, CardColor } from '../types';

const STATS_KEY = 'gemini_uno_stats_v1';

const INITIAL_STATS: GameStats = {
  matchesPlayed: 0,
  matchesWon: 0,
  matchesLost: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCardsPlayed: 0,
  longestMatchTime: 0,
  cardUsage: {},
};

export const loadStats = (): GameStats => {
  try {
    const stored = localStorage.getItem(STATS_KEY);
    if (stored) {
      return { ...INITIAL_STATS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load stats", e);
  }
  return INITIAL_STATS;
};

export const saveStats = (stats: GameStats) => {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("Failed to save stats", e);
  }
};

export const updateStats = (
  currentStats: GameStats,
  isWin: boolean,
  matchDurationSec: number,
  cardsPlayedByHuman: Card[]
): GameStats => {
  const newStats = { ...currentStats };

  // Match Counts
  newStats.matchesPlayed += 1;
  if (isWin) {
    newStats.matchesWon += 1;
    newStats.currentStreak += 1;
    if (newStats.currentStreak > newStats.bestStreak) {
      newStats.bestStreak = newStats.currentStreak;
    }
  } else {
    newStats.matchesLost += 1;
    newStats.currentStreak = 0;
  }

  // Duration
  if (matchDurationSec > newStats.longestMatchTime) {
    newStats.longestMatchTime = matchDurationSec;
  }

  // Card Usage
  newStats.totalCardsPlayed += cardsPlayedByHuman.length;
  
  cardsPlayedByHuman.forEach(card => {
    // Create a unique key for the card type. 
    // We group numbers by color+value, specials by color+type, wilds by type.
    let key = "";
    if (card.color === CardColor.BLACK) {
        key = `BLACK|${card.type}|0`;
    } else {
        key = `${card.color}|${card.type}|${card.value ?? 0}`;
    }

    newStats.cardUsage[key] = (newStats.cardUsage[key] || 0) + 1;
  });

  return newStats;
};

export const parseCardKey = (key: string): Card => {
    const [color, type, value] = key.split('|');
    return {
        id: 'stat-card',
        color: color as CardColor,
        type: type as CardType,
        value: parseInt(value)
    };
};

export const getMostPlayedCards = (stats: GameStats, limit: number = 3): { card: Card, count: number }[] => {
    return Object.entries(stats.cardUsage)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, limit)
        .map(([key, count]) => ({
            card: parseCardKey(key),
            count
        }));
};