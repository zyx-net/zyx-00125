import React from 'react';
import { useGameStore } from '../store/useGameStore';
import type { Cell as CellType, Color } from '../types/game';

const colorClasses: Record<Color, string> = {
  red: 'bg-red-500 border-red-600',
  blue: 'bg-blue-500 border-blue-600',
  green: 'bg-green-500 border-green-600',
  yellow: 'bg-yellow-400 border-yellow-500',
};

const colorGlow: Record<Color, string> = {
  red: 'shadow-red-500/50',
  blue: 'shadow-blue-500/50',
  green: 'shadow-green-500/50',
  yellow: 'shadow-yellow-400/50',
};

interface CellProps {
  cell: CellType;
  isPlayer: boolean;
  onClick: () => void;
  mode: 'edit' | 'play';
}

const Cell: React.FC<CellProps> = ({ cell, isPlayer, onClick, mode }) => {
  const element = cell.element;

  const renderElement = () => {
    if (isPlayer) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-2xl animate-bounce z-10">
          🧍
        </div>
      );
    }

    if (!element) return null;

    switch (element.type) {
      case 'wall':
        return (
          <div className="absolute inset-0 bg-gray-700 border-2 border-gray-600 rounded-sm" />
        );
      case 'start':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-green-900/50 border-2 border-green-500 rounded-sm">
            <span className="text-lg">🚩</span>
          </div>
        );
      case 'end':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-purple-900/50 border-2 border-purple-500 rounded-sm animate-pulse">
            <span className="text-lg">🏁</span>
          </div>
        );
      case 'key':
        return (
          <div className={`absolute inset-1 flex items-center justify-center rounded-full ${colorClasses[element.color!]} shadow-lg ${colorGlow[element.color!]}`}>
            <span className="text-lg">🔑</span>
          </div>
        );
      case 'door':
        return (
          <div className={`absolute inset-0 flex items-center justify-center border-2 ${element.isOpen ? 'bg-gray-800/30 border-gray-600' : `${colorClasses[element.color!]}`} rounded-sm transition-all duration-300`}>
            <span className="text-lg">{element.isOpen ? '🚪' : '🔒'}</span>
          </div>
        );
      case 'mechanism':
        return (
          <div className={`absolute inset-1 flex items-center justify-center rounded-lg border-2 ${element.isActive ? `${colorClasses[element.color!]} shadow-lg ${colorGlow[element.color!]}` : 'bg-gray-700 border-gray-600'} transition-all duration-300`}>
            <span className="text-lg">⚙️</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`relative aspect-square border border-gray-700/50 transition-all duration-150 ${
        mode === 'edit' ? 'cursor-pointer hover:bg-cyan-900/30 hover:border-cyan-500/50' : ''
      } ${cell.x % 2 === cell.y % 2 ? 'bg-gray-900/30' : 'bg-gray-800/30'}`}
      onClick={onClick}
    >
      {renderElement()}
    </div>
  );
};

export const Grid: React.FC = () => {
  const { currentLevel, gameState, mode, handleCellClick } = useGameStore();
  const { grid, width, height } = currentLevel;
  const playerPos = gameState.player.position;

  return (
    <div
      className="relative bg-gray-950 rounded-xl p-3 border-2 border-gray-700 shadow-2xl"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
        gap: '2px',
        maxWidth: 'min(90vw, 600px)',
        maxHeight: '70vh',
        aspectRatio: `${width} / ${height}`,
      }}
    >
      {grid.map((row, y) =>
        row.map((cell, x) => (
          <Cell
            key={`${x}-${y}`}
            cell={cell}
            isPlayer={mode === 'play' && playerPos.x === x && playerPos.y === y}
            onClick={() => handleCellClick(x, y)}
            mode={mode}
          />
        ))
      )}
    </div>
  );
};
