import { CardColor } from './types';

export const COLORS = [CardColor.RED, CardColor.BLUE, CardColor.GREEN, CardColor.YELLOW];

export const COLOR_MAP: Record<CardColor, string> = {
  [CardColor.RED]: 'bg-red-500',
  [CardColor.BLUE]: 'bg-blue-500',
  [CardColor.GREEN]: 'bg-green-500',
  [CardColor.YELLOW]: 'bg-yellow-400',
  [CardColor.BLACK]: 'bg-slate-800',
};

export const TEXT_COLOR_MAP: Record<CardColor, string> = {
  [CardColor.RED]: 'text-red-600',
  [CardColor.BLUE]: 'text-blue-600',
  [CardColor.GREEN]: 'text-green-600',
  [CardColor.YELLOW]: 'text-yellow-600',
  [CardColor.BLACK]: 'text-slate-800',
};

export const BORDER_COLOR_MAP: Record<CardColor, string> = {
  [CardColor.RED]: 'border-red-600',
  [CardColor.BLUE]: 'border-blue-600',
  [CardColor.GREEN]: 'border-green-600',
  [CardColor.YELLOW]: 'border-yellow-500',
  [CardColor.BLACK]: 'border-slate-900',
};
