import React from 'react';
import { Card, CardColor, CardType } from '../types';
import { COLOR_MAP, BORDER_COLOR_MAP } from '../constants';

interface CardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  isFaceDown?: boolean;
  className?: string;
  playable?: boolean;
  ownerName?: string;
  isDrawPile?: boolean;
}

const CardComponent: React.FC<CardProps> = ({ card, onClick, disabled, isFaceDown, className = '', playable, ownerName, isDrawPile }) => {
  // Base classes for structure and shape
  const baseClasses = "relative w-24 h-36 md:w-32 md:h-48 rounded-xl shadow-lg border-4 flex items-center justify-center select-none overflow-hidden transition-all duration-200";
  
  // Interactive classes only if NOT handled by parent (determined by disabled/playable context usually)
  // But we want visual feedback always if it's playable.
  // Note: Parent wrapper handles the "Pop up" animation. We handle the "Glow" here.
  const interactiveClasses = !disabled && !isFaceDown && playable ? "cursor-pointer" : "";
  
  if (isFaceDown) {
    return (
      <div className={`${baseClasses} bg-slate-950 border-slate-800 ${className}`}>
        <div className="w-full h-full p-2 relative flex items-center justify-center">
            <div className="w-full h-full rounded-lg border-2 border-slate-800 bg-gradient-to-br from-slate-900 to-black flex items-center justify-center relative shadow-inner">
                 {/* Card Back Text */}
                <span className={`text-4xl md:text-5xl font-black ${isDrawPile ? 'text-red-600' : 'text-red-500'} italic transform -rotate-12 select-none tracking-tighter drop-shadow-md`}>
                    {isDrawPile ? 'DRAW' : 'UNO'}
                </span>
                
                {/* Gemini Label */}
                <span className="absolute bottom-2 text-[8px] md:text-[10px] font-bold text-slate-600 tracking-[0.2em] uppercase opacity-70">
                    GEMINI
                </span>
            </div>
            {ownerName && (
                <span className="absolute bottom-1 w-full text-center text-[8px] text-slate-500 font-mono tracking-widest uppercase opacity-75 truncate px-2">
                    {ownerName}
                </span>
            )}
        </div>
      </div>
    );
  }

  const bgColor = COLOR_MAP[card.color] || 'bg-gray-500';
  const borderColor = BORDER_COLOR_MAP[card.color] || 'border-gray-600';
  const textColor = 'text-white'; // All cards white text for contrast
  
  // Render symbol based on type
  const renderSymbol = () => {
    switch (card.type) {
      case CardType.NUMBER: return <span className="text-6xl font-black italic shadow-black drop-shadow-md">{card.value}</span>;
      case CardType.SKIP: return (
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-14 h-14 drop-shadow-md">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      );
      case CardType.REVERSE: return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-14 h-14 drop-shadow-md">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      );
      case CardType.DRAW_TWO: return (
        <div className="flex flex-col items-center leading-none drop-shadow-md">
             <span className="text-2xl font-bold">+</span>
             <span className="text-5xl font-black">2</span>
        </div>
      );
      case CardType.WILD: return (
          <div className="grid grid-cols-2 gap-1 w-16 h-16 p-2 bg-white rounded-full shadow-inner">
              <div className="bg-red-500 rounded-tl-full"></div>
              <div className="bg-blue-500 rounded-tr-full"></div>
              <div className="bg-yellow-400 rounded-bl-full"></div>
              <div className="bg-green-500 rounded-br-full"></div>
          </div>
      );
      case CardType.WILD_DRAW_FOUR: return (
        <div className="flex flex-col items-center justify-center drop-shadow-md">
             <div className="grid grid-cols-2 gap-0.5 w-10 h-10 mb-1">
                <div className="bg-red-500 rounded-sm"></div>
                <div className="bg-blue-500 rounded-sm"></div>
                <div className="bg-yellow-400 rounded-sm"></div>
                <div className="bg-green-500 rounded-sm"></div>
             </div>
             <span className="text-3xl font-black">+4</span>
        </div>
      );
      default: return null;
    }
  };

  const smallSymbol = () => {
       if (card.type === CardType.NUMBER) return card.value;
       if (card.type === CardType.SKIP) return "⊘";
       if (card.type === CardType.REVERSE) return "⇄";
       if (card.type === CardType.DRAW_TWO) return "+2";
       if (card.type === CardType.WILD) return "W";
       if (card.type === CardType.WILD_DRAW_FOUR) return "+4";
  };

  return (
    <div 
        onClick={(!disabled && playable) ? onClick : undefined} 
        className={`${baseClasses} ${bgColor} ${borderColor} ${textColor} ${interactiveClasses} ${className}`}
    >
        {/* Main Center Symbol */}
        <div className="w-20 h-32 md:w-24 md:h-40 bg-white/20 rounded-[45%] transform rotate-12 flex items-center justify-center backdrop-blur-sm border border-white/30 shadow-inner">
            {renderSymbol()}
        </div>

        {/* Corner Numbers/Icons */}
        <div className="absolute top-2 left-2 text-xl font-bold leading-none drop-shadow-sm">{smallSymbol()}</div>
        <div className="absolute bottom-2 right-2 text-xl font-bold leading-none transform rotate-180 drop-shadow-sm">{smallSymbol()}</div>
        
        {/* Owner Name Label */}
        {ownerName && (
            <div className="absolute inset-x-0 bottom-1 flex justify-center">
                 <span className="text-[8px] font-bold uppercase tracking-widest opacity-60 text-white drop-shadow-sm truncate px-4">
                    {ownerName}
                 </span>
            </div>
        )}
    </div>
  );
};

export default CardComponent;