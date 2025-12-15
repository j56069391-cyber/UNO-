import { Card, CardColor, CardType } from '../types';
import { COLORS } from '../constants';

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  const addCard = (color: CardColor, type: CardType, value?: number) => {
    deck.push({ id: `card-${idCounter++}`, color, type, value });
  };

  COLORS.forEach((color) => {
    // One 0 card
    addCard(color, CardType.NUMBER, 0);

    // Two of 1-9
    for (let i = 1; i <= 9; i++) {
      addCard(color, CardType.NUMBER, i);
      addCard(color, CardType.NUMBER, i);
    }

    // Two Skips, Reverses, Draw Twos
    for (let i = 0; i < 2; i++) {
      addCard(color, CardType.SKIP);
      addCard(color, CardType.REVERSE);
      addCard(color, CardType.DRAW_TWO);
    }
  });

  // Four Wilds and Wild Draw Fours
  for (let i = 0; i < 4; i++) {
    addCard(CardColor.BLACK, CardType.WILD);
    addCard(CardColor.BLACK, CardType.WILD_DRAW_FOUR);
  }

  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const isValidMove = (card: Card, topCard: Card, currentColor: CardColor): boolean => {
  // Wilds are always valid
  if (card.color === CardColor.BLACK) return true;

  // Match color (using the active active color state, not just card color)
  if (card.color === currentColor) return true;

  // Match value/symbol
  if (card.type === topCard.type) {
    if (card.type === CardType.NUMBER) {
      return card.value === topCard.value;
    }
    return true; // Special cards match by type (e.g., Skip on Skip)
  }

  return false;
};

// Helper to check if a player CAN play any card
export const canPlayAny = (hand: Card[], topCard: Card, currentColor: CardColor): boolean => {
  return hand.some(card => isValidMove(card, topCard, currentColor));
};

export const calculateHandScore = (hand: Card[]): number => {
  return hand.reduce((total, card) => {
    if (card.type === CardType.NUMBER) {
      return total + (card.value || 0);
    }
    if (card.type === CardType.SKIP || card.type === CardType.REVERSE || card.type === CardType.DRAW_TWO) {
      return total + 20;
    }
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      return total + 50;
    }
    return total;
  }, 0);
};
