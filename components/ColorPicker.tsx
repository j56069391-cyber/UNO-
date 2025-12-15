import React from 'react';
import { CardColor } from '../types';
import { COLORS, COLOR_MAP } from '../constants';

interface ColorPickerProps {
  onSelect: (color: CardColor) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ onSelect }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-4 border-slate-200">
        <h2 className="text-2xl font-bold mb-6 text-slate-800">Choose a Color!</h2>
        <div className="grid grid-cols-2 gap-4">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onSelect(color)}
              className={`${COLOR_MAP[color]} w-full h-24 rounded-xl shadow-md hover:scale-105 transition-transform border-4 border-white/20 active:scale-95`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
