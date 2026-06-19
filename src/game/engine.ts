import type { GameState, Level, PlayerState, Direction } from '../types/game';
import { cloneGrid } from './grid';
import { checkMove } from './rules';

export function createInitialGameState(level: Level): GameState {
  const player: PlayerState = {
    position: { ...level.startPos },
    inventory: [],
  };

  return {
    level: {
      ...level,
      grid: cloneGrid(level.grid),
    },
    player,
    turn: 0,
    isGameOver: false,
    isWin: false,
    message: '🎮 游戏开始！使用方向键或按钮移动',
  };
}

export function movePlayer(
  currentState: GameState,
  direction: Direction
): { valid: boolean; message: string; newState?: GameState; actionType?: 'move' | 'pickup' | 'openDoor' | 'triggerMechanism' } {
  if (currentState.isGameOver) {
    return {
      valid: false,
      message: '❌ 游戏已结束，请重置关卡',
    };
  }

  const result = checkMove(currentState, direction);
  return {
    valid: result.valid,
    message: result.message,
    newState: result.newState,
    actionType: result.actionType,
  };
}

export function resetGame(level: Level): GameState {
  return createInitialGameState(level);
}

export function getAllDoors(state: GameState): Array<{ id: string; color: string; isOpen: boolean; x: number; y: number }> {
  const doors: Array<{ id: string; color: string; isOpen: boolean; x: number; y: number }> = [];
  const { grid } = state.level;
  
  for (const row of grid) {
    for (const cell of row) {
      if (cell.element?.type === 'door') {
        doors.push({
          id: cell.element.id || `door-${cell.x}-${cell.y}`,
          color: cell.element.color || 'unknown',
          isOpen: cell.element.isOpen ?? false,
          x: cell.x,
          y: cell.y,
        });
      }
    }
  }
  
  return doors;
}

export function getAllMechanisms(state: GameState): Array<{ id: string; color: string; isActive: boolean; x: number; y: number }> {
  const mechanisms: Array<{ id: string; color: string; isActive: boolean; x: number; y: number }> = [];
  const { grid } = state.level;
  
  for (const row of grid) {
    for (const cell of row) {
      if (cell.element?.type === 'mechanism') {
        mechanisms.push({
          id: cell.element.id || `mech-${cell.x}-${cell.y}`,
          color: cell.element.color || 'unknown',
          isActive: cell.element.isActive ?? false,
          x: cell.x,
          y: cell.y,
        });
      }
    }
  }
  
  return mechanisms;
}
