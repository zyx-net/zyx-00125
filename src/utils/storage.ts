import type { Level, SaveData, GameState, Action } from '../types/game';

const STORAGE_KEYS = {
  LEVELS: 'puzzle_levels',
  SAVES: 'puzzle_saves',
  BEST_MOVES: 'puzzle_best_moves',
  CURRENT_STATE: 'puzzle_current_state',
};

export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('保存到本地存储失败:', error);
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('从本地存储读取失败:', error);
    return defaultValue;
  }
}

export function saveCustomLevels(levels: Level[]): void {
  saveToStorage(STORAGE_KEYS.LEVELS, levels);
}

export function loadCustomLevels(): Level[] {
  return loadFromStorage<Level[]>(STORAGE_KEYS.LEVELS, []);
}

export function saveSaves(saves: SaveData[]): void {
  saveToStorage(STORAGE_KEYS.SAVES, saves);
}

export function loadSaves(): SaveData[] {
  return loadFromStorage<SaveData[]>(STORAGE_KEYS.SAVES, []);
}

export function saveBestMoves(levelId: string, moves: number): void {
  const bestMoves = loadFromStorage<Record<string, number>>(STORAGE_KEYS.BEST_MOVES, {});
  if (!bestMoves[levelId] || moves < bestMoves[levelId]) {
    bestMoves[levelId] = moves;
    saveToStorage(STORAGE_KEYS.BEST_MOVES, bestMoves);
  }
}

export function loadBestMoves(levelId: string): number | null {
  const bestMoves = loadFromStorage<Record<string, number>>(STORAGE_KEYS.BEST_MOVES, {});
  return bestMoves[levelId] ?? null;
}

export function saveCurrentState(
  gameState: GameState,
  actionHistory: Action[],
  historyIndex: number
): void {
  saveToStorage(STORAGE_KEYS.CURRENT_STATE, {
    gameState,
    actionHistory,
    historyIndex,
    timestamp: Date.now(),
  });
}

export function loadCurrentState(): {
  gameState: GameState | null;
  actionHistory: Action[] | null;
  historyIndex: number;
} | null {
  try {
    const item = localStorage.getItem(STORAGE_KEYS.CURRENT_STATE);
    if (!item) return null;
    const data = JSON.parse(item);
    return {
      gameState: data.gameState,
      actionHistory: data.actionHistory,
      historyIndex: data.historyIndex ?? 0,
    };
  } catch (error) {
    console.error('恢复当前状态失败:', error);
    return null;
  }
}

export function clearCurrentState(): void {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_STATE);
}

export function clearAllStorage(): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}
