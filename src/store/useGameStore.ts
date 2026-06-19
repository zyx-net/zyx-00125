import { create } from 'zustand';
import type {
  GameState,
  Level,
  Action,
  Direction,
  Mode,
  EditorState,
  CellType,
  Color,
  SaveData,
} from '../types/game';
import {
  createInitialGameState,
  movePlayer,
  resetGame,
} from '../game/engine';
import {
  createHistory,
  addAction,
  canUndo,
  canRedo,
  undo as historyUndo,
  redo as historyRedo,
  resetHistory,
} from '../game/history';
import { sampleLevels, createEmptyLevel } from '../data/sampleLevels';
import { validateLevel } from '../game/rules';
import { cloneGrid, generateId } from '../game/grid';
import {
  saveCustomLevels,
  loadCustomLevels,
  saveSaves,
  loadSaves,
  saveBestMoves,
  loadBestMoves,
  saveCurrentState,
  loadCurrentState,
} from '../utils/storage';
import {
  exportLevel,
  exportLevelPack,
  exportSaveData,
  importLevelPack,
  triggerFileInput,
} from '../utils/export';

interface GameStore {
  mode: Mode;
  editorState: EditorState;
  currentLevel: Level;
  gameState: GameState;
  actionHistory: Action[];
  historyIndex: number;
  customLevels: Level[];
  savedGames: SaveData[];
  message: string;
  messageType: 'success' | 'error' | 'info';

  setMode: (mode: Mode) => void;
  setEditorTool: (tool: CellType | 'eraser') => void;
  setEditorColor: (color: Color) => void;
  setGridSize: (width: number, height: number) => void;
  handleCellClick: (x: number, y: number) => void;
  loadLevel: (level: Level) => void;
  loadSampleLevel: (id: string) => void;
  move: (direction: Direction) => void;
  undo: () => void;
  redo: () => void;
  resetLevel: () => void;
  saveLevel: (name: string) => { success: boolean; message: string };
  deleteCustomLevel: (id: string) => void;
  saveGame: (name: string) => void;
  loadGame: (saveData: SaveData) => void;
  deleteSavedGame: (id: string) => void;
  exportCurrentLevel: () => void;
  exportAllLevels: () => void;
  importLevels: () => Promise<{ success: boolean; message: string }>;
  exportCurrentSave: () => void;
  getBestMoves: (levelId: string) => number | null;
  showMessage: (message: string, type?: 'success' | 'error' | 'info') => void;
  restoreFromStorage: () => boolean;
}

export const useGameStore = create<GameStore>((set, get) => ({
  mode: 'play',
  editorState: {
    selectedTool: 'wall',
    selectedColor: 'red',
    gridWidth: 8,
    gridHeight: 6,
  },
  currentLevel: sampleLevels[0],
  gameState: createInitialGameState(sampleLevels[0]),
  actionHistory: [],
  historyIndex: -1,
  customLevels: [],
  savedGames: [],
  message: '🎮 游戏开始！使用方向键或按钮移动',
  messageType: 'info',

  setMode: (mode: Mode) => {
    set({ mode });
    if (mode === 'edit') {
      const { currentLevel } = get();
      set({
        editorState: {
          selectedTool: 'wall',
          selectedColor: 'red',
          gridWidth: currentLevel.width,
          gridHeight: currentLevel.height,
        },
      });
    }
  },

  setEditorTool: (tool: CellType | 'eraser') => {
    set({ editorState: { ...get().editorState, selectedTool: tool } });
  },

  setEditorColor: (color: Color) => {
    set({ editorState: { ...get().editorState, selectedColor: color } });
  },

  setGridSize: (width: number, height: number) => {
    const newGrid = createEmptyLevel(width, height);
    set({
      editorState: { ...get().editorState, gridWidth: width, gridHeight: height },
      currentLevel: newGrid,
    });
  },

  handleCellClick: (x: number, y: number) => {
    const { mode, editorState, currentLevel } = get();
    if (mode !== 'edit') return;

    const newGrid = cloneGrid(currentLevel.grid);
    const { selectedTool, selectedColor } = editorState;

    let newStartPos = { ...currentLevel.startPos };
    let newEndPos = { ...currentLevel.endPos };

    if (selectedTool === 'eraser') {
      const cell = newGrid[y][x];
      if (cell.element?.type === 'start') {
        get().showMessage('❌ 不能删除起点，请先在其他位置放置新起点', 'error');
        return;
      }
      if (cell.element?.type === 'end') {
        get().showMessage('❌ 不能删除终点，请先在其他位置放置新终点', 'error');
        return;
      }
      newGrid[y][x].element = null;
    } else if (selectedTool === 'start') {
      for (const row of newGrid) {
        for (const cell of row) {
          if (cell.element?.type === 'start') {
            cell.element = null;
          }
        }
      }
      newGrid[y][x].element = { type: 'start', id: generateId() };
      newStartPos = { x, y };
    } else if (selectedTool === 'end') {
      for (const row of newGrid) {
        for (const cell of row) {
          if (cell.element?.type === 'end') {
            cell.element = null;
          }
        }
      }
      newGrid[y][x].element = { type: 'end', id: generateId() };
      newEndPos = { x, y };
    } else if (selectedTool === 'wall') {
      if (newGrid[y][x].element?.type === 'start' || newGrid[y][x].element?.type === 'end') {
        get().showMessage('❌ 不能在起点或终点位置放置墙壁', 'error');
        return;
      }
      newGrid[y][x].element = { type: 'wall', id: generateId() };
    } else if (selectedTool === 'key') {
      if (newGrid[y][x].element?.type === 'start' || newGrid[y][x].element?.type === 'end') {
        get().showMessage('❌ 不能在起点或终点位置放置钥匙', 'error');
        return;
      }
      newGrid[y][x].element = { type: 'key', color: selectedColor, id: generateId() };
    } else if (selectedTool === 'door') {
      if (newGrid[y][x].element?.type === 'start' || newGrid[y][x].element?.type === 'end') {
        get().showMessage('❌ 不能在起点或终点位置放置门', 'error');
        return;
      }
      newGrid[y][x].element = {
        type: 'door',
        color: selectedColor,
        isOpen: false,
        id: generateId(),
      };
    } else if (selectedTool === 'mechanism') {
      if (newGrid[y][x].element?.type === 'start' || newGrid[y][x].element?.type === 'end') {
        get().showMessage('❌ 不能在起点或终点位置放置机关', 'error');
        return;
      }
      newGrid[y][x].element = {
        type: 'mechanism',
        color: selectedColor,
        isActive: false,
        id: generateId(),
      };
    }

    set({
      currentLevel: {
        ...currentLevel,
        grid: newGrid,
        startPos: newStartPos,
        endPos: newEndPos,
      },
    });
  },

  loadLevel: (level: Level) => {
    const initialState = createInitialGameState(level);
    const history = resetHistory(createHistory(), initialState);

    set({
      currentLevel: level,
      gameState: initialState,
      actionHistory: history.actions,
      historyIndex: history.currentIndex,
      message: initialState.message,
      messageType: 'info',
    });
  },

  loadSampleLevel: (id: string) => {
    const level = sampleLevels.find(l => l.id === id);
    if (level) {
      get().loadLevel(level);
      get().showMessage(`✅ 已加载关卡：${level.name}`, 'success');
    }
  },

  move: (direction: Direction) => {
    const { gameState, actionHistory, historyIndex } = get();
    const result = movePlayer(gameState, direction);

    if (!result.valid || !result.newState) {
      get().showMessage(result.message, 'error');
      return;
    }

    const currentHistory = { actions: actionHistory, currentIndex: historyIndex };
    const newHistory = addAction(
      currentHistory,
      result.actionType!,
      result.newState.player.position,
      result.message,
      result.newState,
      direction
    );

    if (result.newState.isWin) {
      saveBestMoves(result.newState.level.id, result.newState.turn);
    }

    saveCurrentState(result.newState, newHistory.actions, newHistory.currentIndex);

    set({
      gameState: result.newState,
      actionHistory: newHistory.actions,
      historyIndex: newHistory.currentIndex,
      message: result.message,
      messageType: result.newState.isWin ? 'success' : 'info',
    });
  },

  undo: () => {
    const { actionHistory, historyIndex } = get();
    const currentHistory = { actions: actionHistory, currentIndex: historyIndex };

    if (!canUndo(currentHistory)) {
      get().showMessage('❌ 无法撤销：已经是初始状态', 'error');
      return;
    }

    const result = historyUndo(currentHistory);
    if (!result) return;

    saveCurrentState(result.state, result.history.actions, result.history.currentIndex);

    set({
      gameState: result.state,
      actionHistory: result.history.actions,
      historyIndex: result.history.currentIndex,
      message: '↩️ 已撤销上一步操作',
      messageType: 'info',
    });
  },

  redo: () => {
    const { actionHistory, historyIndex } = get();
    const currentHistory = { actions: actionHistory, currentIndex: historyIndex };

    if (!canRedo(currentHistory)) {
      get().showMessage('❌ 无法重做：已经是最新状态', 'error');
      return;
    }

    const result = historyRedo(currentHistory);
    if (!result) return;

    saveCurrentState(result.state, result.history.actions, result.history.currentIndex);

    set({
      gameState: result.state,
      actionHistory: result.history.actions,
      historyIndex: result.history.currentIndex,
      message: '↪️ 已重做操作',
      messageType: 'info',
    });
  },

  resetLevel: () => {
    const { currentLevel } = get();
    const initialState = resetGame(currentLevel);
    const history = resetHistory(createHistory(), initialState);

    saveCurrentState(initialState, history.actions, history.currentIndex);

    set({
      gameState: initialState,
      actionHistory: history.actions,
      historyIndex: history.currentIndex,
      message: '🔄 关卡已重置',
      messageType: 'info',
    });
  },

  saveLevel: (name: string) => {
    const { currentLevel, customLevels } = get();
    const levelToSave = { ...currentLevel, name, id: currentLevel.id || generateId() };

    const validation = validateLevel(levelToSave);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }

    const existingIndex = customLevels.findIndex(l => l.id === levelToSave.id);
    let newLevels: Level[];

    if (existingIndex >= 0) {
      newLevels = [...customLevels];
      newLevels[existingIndex] = levelToSave;
    } else {
      newLevels = [...customLevels, levelToSave];
    }

    saveCustomLevels(newLevels);
    set({ customLevels: newLevels });

    return { success: true, message: `✅ 关卡 "${name}" 保存成功` };
  },

  deleteCustomLevel: (id: string) => {
    const { customLevels } = get();
    const newLevels = customLevels.filter(l => l.id !== id);
    saveCustomLevels(newLevels);
    set({ customLevels: newLevels });
    get().showMessage('✅ 关卡已删除', 'success');
  },

  saveGame: (name: string) => {
    const { gameState, actionHistory, historyIndex, savedGames } = get();
    const saveData: SaveData = {
      id: generateId(),
      name,
      timestamp: Date.now(),
      gameState,
      actionHistory,
      historyIndex,
    };

    const newSaves = [...savedGames, saveData];
    saveSaves(newSaves);
    set({ savedGames: newSaves });
    get().showMessage(`✅ 存档 "${name}" 保存成功`, 'success');
  },

  loadGame: (saveData: SaveData) => {
    saveCurrentState(saveData.gameState, saveData.actionHistory, saveData.historyIndex);
    set({
      currentLevel: saveData.gameState.level,
      gameState: saveData.gameState,
      actionHistory: saveData.actionHistory,
      historyIndex: saveData.historyIndex,
      message: `✅ 已读取存档：${saveData.name}`,
      messageType: 'success',
    });
  },

  deleteSavedGame: (id: string) => {
    const { savedGames } = get();
    const newSaves = savedGames.filter(s => s.id !== id);
    saveSaves(newSaves);
    set({ savedGames: newSaves });
    get().showMessage('✅ 存档已删除', 'success');
  },

  exportCurrentLevel: () => {
    const { gameState, mode, currentLevel } = get();
    const levelToExport = mode === 'play' ? gameState.level : currentLevel;
    exportLevel(levelToExport);
    get().showMessage(`✅ 关卡 "${levelToExport.name}" 已导出`, 'success');
  },

  exportAllLevels: () => {
    const { customLevels, gameState, mode } = get();
    const allLevels = [...sampleLevels, ...customLevels];

    if (mode === 'play' && gameState.level?.id) {
      const idx = allLevels.findIndex(l => l.id === gameState.level.id);
      if (idx >= 0) {
        allLevels[idx] = gameState.level;
      } else {
        allLevels.push(gameState.level);
      }
    }

    exportLevelPack(allLevels, `puzzle-levels-${Date.now()}`);
    get().showMessage(`✅ 已导出 ${allLevels.length} 个关卡（含当前局面）`, 'success');
  },

  importLevels: async () => {
    return new Promise((resolve) => {
      triggerFileInput('.json', async (file) => {
        try {
          const levels = await importLevelPack(file);
          const { customLevels } = get();
          const newLevels = [...customLevels];
          
          for (const level of levels) {
            level.id = generateId();
            newLevels.push(level);
          }
          
          saveCustomLevels(newLevels);
          set({ customLevels: newLevels });
          resolve({ success: true, message: `✅ 成功导入 ${levels.length} 个关卡` });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : '导入失败';
          resolve({ success: false, message });
        }
      });
    });
  },

  exportCurrentSave: () => {
    const { gameState, actionHistory, historyIndex } = get();
    const saveData: SaveData = {
      id: generateId(),
      name: `save-${Date.now()}`,
      timestamp: Date.now(),
      gameState,
      actionHistory,
      historyIndex,
    };
    exportSaveData(saveData);
    get().showMessage('✅ 存档已导出', 'success');
  },

  getBestMoves: (levelId: string) => {
    return loadBestMoves(levelId);
  },

  showMessage: (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    set({ message, messageType: type });
  },

  restoreFromStorage: () => {
    const saved = loadCurrentState();
    if (saved && saved.gameState && saved.actionHistory) {
      set({
        currentLevel: saved.gameState.level,
        gameState: saved.gameState,
        actionHistory: saved.actionHistory,
        historyIndex: saved.historyIndex,
        customLevels: loadCustomLevels(),
        savedGames: loadSaves(),
        message: '✅ 已恢复上次游戏进度',
        messageType: 'success',
      });
      return true;
    }
    
    set({
      customLevels: loadCustomLevels(),
      savedGames: loadSaves(),
    });
    return false;
  },
}));
