import React from 'react';
import { useGameStore } from '../store/useGameStore';
import type { Direction } from '../types/game';

export const Controls: React.FC = () => {
  const { move, mode, gameState } = useGameStore();

  if (mode === 'edit' || gameState.isGameOver) {
    return null;
  }

  const handleMove = (direction: Direction) => {
    move(direction);
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700 p-4 shadow-xl">
      <h3 className="text-sm font-medium text-gray-300 mb-3 text-center">🎮 移动控制</h3>
      <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
        <div />
        <button
          className="aspect-square bg-gray-800 hover:bg-cyan-700 active:bg-cyan-600 rounded-lg flex items-center justify-center text-xl transition-all active:scale-95 shadow-lg"
          onClick={() => handleMove('up')}
        >
          ↑
        </button>
        <div />
        <button
          className="aspect-square bg-gray-800 hover:bg-cyan-700 active:bg-cyan-600 rounded-lg flex items-center justify-center text-xl transition-all active:scale-95 shadow-lg"
          onClick={() => handleMove('left')}
        >
          ←
        </button>
        <div className="aspect-square bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-600 text-xs">
          WASD
        </div>
        <button
          className="aspect-square bg-gray-800 hover:bg-cyan-700 active:bg-cyan-600 rounded-lg flex items-center justify-center text-xl transition-all active:scale-95 shadow-lg"
          onClick={() => handleMove('right')}
        >
          →
        </button>
        <div />
        <button
          className="aspect-square bg-gray-800 hover:bg-cyan-700 active:bg-cyan-600 rounded-lg flex items-center justify-center text-xl transition-all active:scale-95 shadow-lg"
          onClick={() => handleMove('down')}
        >
          ↓
        </button>
        <div />
      </div>
    </div>
  );
};
