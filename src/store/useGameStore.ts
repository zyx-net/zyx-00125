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
  EditorHistoryState,
  ImportConflict,
  ConflictResolution,
  ImportResult,
  EditorSnapshot,
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
import {
  createEditorHistory,
  addEditorSnapshot,
  canEditorUndo,
  canEditorRedo,
  editorUndo,
  editorRedo,
} from '../game/editor-history';
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
  saveDraft,
  loadDraft,
  deleteDraft,
  loadLastEditingLevelId,
  saveLastEditingLevelId,
  clearLastEditingLevelId,
  getDraftUpdatedAt,
  hasDraft,
  loadAllDrafts,
  isLevelDirty,
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

  editorHistory: EditorHistoryState;
  hasUnsavedDraft: boolean;
  draftUpdatedAt: number | null;
  pendingConflicts: ImportConflict[];
  pendingAllImportedLevels: Level[];
  isDraftRestored: boolean;
  allDraftIds: string[];

  setMode: (mode: Mode) => void;
  setEditorTool: (tool: CellType | 'eraser') => void;
  setEditorColor: (color: Color) => void;
  setGridSize: (width: number, height: number) => void;
  handleCellClick: (x: number, y: number) => void;
  loadLevel: (level: Level, forceDiscardDraft?: boolean) => void;
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
  importLevels: () => Promise<{ success: boolean; message: string; conflicts?: ImportConflict[] }>;
  resolveImportConflicts: (
    resolutions: Map<string, ConflictResolution>
  ) => ImportResult;
  cancelPendingConflicts: () => void;
  exportCurrentSave: () => void;
  getBestMoves: (levelId: string) => number | null;
  showMessage: (message: string, type?: 'success' | 'error' | 'info') => void;
  restoreFromStorage: () => { restoredGame: boolean; restoredDraft: boolean; restoredDraftLevelId?: string };
  discardCurrentDraft: () => void;
  restoreCurrentDraft: () => boolean;
  refreshDraftStatus: () => void;
}

let autoSaveDraftTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY = 400;

function scheduleAutoDraftSave(
  levelId: string,
  level: Level,
  editorState: EditorState,
  editorHistory: EditorHistoryState
) {
  if (autoSaveDraftTimer) clearTimeout(autoSaveDraftTimer);
  autoSaveDraftTimer = setTimeout(() => {
    saveDraft(levelId, level, editorState, editorHistory);
  }, AUTO_SAVE_DELAY);
}

function computeDirtyFlag(level: Level): boolean {
  const draft = loadDraft(level.id);
  if (!draft) return false;
  return JSON.stringify(draft.level.grid) !== JSON.stringify(level.grid)
    || draft.level.name !== level.name
    || draft.level.width !== level.width
    || draft.level.height !== level.height
    || JSON.stringify(draft.level.startPos) !== JSON.stringify(level.startPos)
    || JSON.stringify(draft.level.endPos) !== JSON.stringify(level.endPos);
}

function detectConflicts(incoming: Level[], existing: Level[]): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  for (const level of incoming) {
    const byId = existing.find(l => l.id === level.id);
    const byName = existing.find(l => l.name === level.name);
    if (byId && byName && byId.id === byName.id) {
      conflicts.push({ incomingLevel: level, existingLevel: byId, conflictType: 'both' });
    } else if (byId) {
      conflicts.push({ incomingLevel: level, existingLevel: byId, conflictType: 'id' });
    } else if (byName) {
      conflicts.push({ incomingLevel: level, existingLevel: byName, conflictType: 'name' });
    }
  }
  return conflicts;
}

export const useGameStore = create<GameStore>((set, get) => {
  const initialLevel = sampleLevels[0];
  const initialEditorState: EditorState = {
    selectedTool: 'wall',
    selectedColor: 'red',
    gridWidth: initialLevel.width,
    gridHeight: initialLevel.height,
  };
  const initialEditorHistory = createEditorHistory(initialLevel, initialEditorState);

  return {
    mode: 'play',
    editorState: initialEditorState,
    currentLevel: initialLevel,
    gameState: createInitialGameState(initialLevel),
    actionHistory: [],
    historyIndex: -1,
    customLevels: [],
    savedGames: [],
    message: '🎮 游戏开始！使用方向键或按钮移动',
    messageType: 'info',

    editorHistory: initialEditorHistory,
    hasUnsavedDraft: false,
    draftUpdatedAt: null,
    pendingConflicts: [],
    pendingAllImportedLevels: [],
    isDraftRestored: false,
    allDraftIds: [],

    setMode: (mode: Mode) => {
      const prev = get().mode;
      set({ mode });
      if (mode === 'edit') {
        const { currentLevel, editorState } = get();
        saveLastEditingLevelId(currentLevel.id);

        const draft = loadDraft(currentLevel.id);

        if (draft) {
          const formalVersion =
            get().customLevels.find(l => l.id === currentLevel.id) ||
            sampleLevels.find(l => l.id === currentLevel.id) ||
            currentLevel;
          const draftDiffersFromFormal =
            JSON.stringify(draft.level.grid) !== JSON.stringify(formalVersion.grid)
            || draft.level.name !== formalVersion.name
            || draft.level.width !== formalVersion.width
            || draft.level.height !== formalVersion.height
            || JSON.stringify(draft.level.startPos) !== JSON.stringify(formalVersion.startPos)
            || JSON.stringify(draft.level.endPos) !== JSON.stringify(formalVersion.endPos);

          const draftMatchesCurrentStore =
            JSON.stringify(draft.level.grid) === JSON.stringify(currentLevel.grid)
            && draft.level.startPos.x === currentLevel.startPos.x
            && draft.level.startPos.y === currentLevel.startPos.y
            && draft.level.endPos.x === currentLevel.endPos.x
            && draft.level.endPos.y === currentLevel.endPos.y;

          if (draftDiffersFromFormal) {
            set({
              currentLevel: draft.level,
              editorState: draft.editorState,
              editorHistory: draft.editorHistory,
              hasUnsavedDraft: true,
              draftUpdatedAt: draft.updatedAt,
              isDraftRestored: !draftMatchesCurrentStore,
            });
          } else {
            const newEditorHistory = createEditorHistory(currentLevel, {
              ...editorState,
              gridWidth: currentLevel.width,
              gridHeight: currentLevel.height,
            });
            set({
              editorState: {
                ...editorState,
                gridWidth: currentLevel.width,
                gridHeight: currentLevel.height,
              },
              editorHistory: newEditorHistory,
              hasUnsavedDraft: false,
              draftUpdatedAt: null,
              isDraftRestored: false,
            });
          }
        } else {
          const newEditorHistory = createEditorHistory(currentLevel, {
            ...editorState,
            gridWidth: currentLevel.width,
            gridHeight: currentLevel.height,
          });
          set({
            editorState: {
              ...editorState,
              gridWidth: currentLevel.width,
              gridHeight: currentLevel.height,
            },
            editorHistory: newEditorHistory,
            hasUnsavedDraft: false,
            draftUpdatedAt: null,
            isDraftRestored: false,
          });
        }
      } else if (prev === 'edit') {
        if (autoSaveDraftTimer) {
          clearTimeout(autoSaveDraftTimer);
          autoSaveDraftTimer = null;
          const { currentLevel, editorState, editorHistory } = get();
          saveDraft(currentLevel.id, currentLevel, editorState, editorHistory);
        }
      }
    },

    setEditorTool: (tool: CellType | 'eraser') => {
      set({ editorState: { ...get().editorState, selectedTool: tool } });
    },

    setEditorColor: (color: Color) => {
      set({ editorState: { ...get().editorState, selectedColor: color } });
    },

    setGridSize: (width: number, height: number) => {
      const newLevel = createEmptyLevel(width, height);
      const currentId = get().currentLevel.id || generateId();
      const levelToUse: Level = { ...newLevel, id: currentId, name: get().currentLevel.name };
      const newEditorState = { ...get().editorState, gridWidth: width, gridHeight: height };
      const newHistory = addEditorSnapshot(get().editorHistory, levelToUse, newEditorState);
      saveLastEditingLevelId(currentId);
      scheduleAutoDraftSave(currentId, levelToUse, newEditorState, newHistory);
      set({
        currentLevel: levelToUse,
        editorState: newEditorState,
        editorHistory: newHistory,
        hasUnsavedDraft: true,
        draftUpdatedAt: Date.now(),
        isDraftRestored: false,
      });
    },

    handleCellClick: (x: number, y: number) => {
      const { mode, editorState, currentLevel, editorHistory } = get();
      if (mode !== 'edit') return;

      const newGrid = cloneGrid(currentLevel.grid);
      const { selectedTool, selectedColor } = editorState;

      let newStartPos = { ...currentLevel.startPos };
      let newEndPos = { ...currentLevel.endPos };
      let levelChanged = true;

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
      } else {
        levelChanged = false;
      }

      if (!levelChanged) return;

      const newLevel: Level = {
        ...currentLevel,
        grid: newGrid,
        startPos: newStartPos,
        endPos: newEndPos,
      };
      const newEditorHistory = addEditorSnapshot(editorHistory, newLevel, editorState);
      saveLastEditingLevelId(currentLevel.id);
      scheduleAutoDraftSave(currentLevel.id, newLevel, editorState, newEditorHistory);
      set({
        currentLevel: newLevel,
        editorHistory: newEditorHistory,
        hasUnsavedDraft: true,
        draftUpdatedAt: Date.now(),
        isDraftRestored: false,
      });
    },

    loadLevel: (level: Level, forceDiscardDraft: boolean = false) => {
      const initialState = createInitialGameState(level);
      const history = resetHistory(createHistory(), initialState);
      const existingDraft = !forceDiscardDraft ? loadDraft(level.id) : null;
      const editorStateNow = get().editorState;
      const newEditorState: EditorState = {
        ...editorStateNow,
        gridWidth: level.width,
        gridHeight: level.height,
      };

      let levelToLoad: Level = level;
      let editorHist = createEditorHistory(level, newEditorState);
      let isRestored = false;

      if (existingDraft) {
        const ds = existingDraft.level;
        const dirty = JSON.stringify(ds.grid) !== JSON.stringify(level.grid)
          || ds.name !== level.name
          || ds.width !== level.width
          || ds.height !== level.height
          || JSON.stringify(ds.startPos) !== JSON.stringify(level.startPos)
          || JSON.stringify(ds.endPos) !== JSON.stringify(level.endPos);
        if (dirty) {
          levelToLoad = ds;
          const restoredState = createInitialGameState(ds);
          const restoredHistory = resetHistory(createHistory(), restoredState);
          editorHist = existingDraft.editorHistory.snapshots.length > 0
            ? existingDraft.editorHistory
            : createEditorHistory(ds, existingDraft.editorState);
          Object.assign(newEditorState, existingDraft.editorState);
          isRestored = true;
          saveLastEditingLevelId(ds.id);
          set({
            currentLevel: ds,
            gameState: restoredState,
            actionHistory: restoredHistory.actions,
            historyIndex: restoredHistory.currentIndex,
            editorHistory: editorHist,
            editorState: newEditorState,
            message: `📝 已从草稿恢复：${ds.name || '未命名关卡'}（上次编辑 ${new Date(existingDraft.updatedAt).toLocaleString()}）`,
            messageType: 'info',
          });
          return;
        }
      }

      saveLastEditingLevelId(level.id);
      set({
        currentLevel: levelToLoad,
        gameState: initialState,
        actionHistory: history.actions,
        historyIndex: history.currentIndex,
        editorHistory: editorHist,
        editorState: newEditorState,
        message: initialState.message,
        messageType: 'info',
        hasUnsavedDraft: isRestored || computeDirtyFlag(levelToLoad),
        draftUpdatedAt: getDraftUpdatedAt(levelToLoad.id),
        isDraftRestored: isRestored,
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
      const { mode, editorHistory, actionHistory, historyIndex } = get();

      if (mode === 'edit') {
        if (!canEditorUndo(editorHistory)) {
          get().showMessage('❌ 无法撤销：已是最早编辑状态', 'error');
          return;
        }
        const snap = editorUndo(editorHistory);
        if (!snap) return;
        const levelId = get().currentLevel.id;
        const newEditorHistory: EditorHistoryState = {
          ...editorHistory,
          currentIndex: editorHistory.currentIndex - 1,
        };
        scheduleAutoDraftSave(levelId, snap.level, snap.editorState, newEditorHistory);
        set({
          currentLevel: snap.level,
          editorState: snap.editorState,
          editorHistory: newEditorHistory,
          hasUnsavedDraft: true,
          draftUpdatedAt: Date.now(),
          isDraftRestored: false,
          message: '↩️ 已撤销上一步编辑',
          messageType: 'info',
        });
        return;
      }

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
      const { mode, editorHistory, actionHistory, historyIndex } = get();

      if (mode === 'edit') {
        if (!canEditorRedo(editorHistory)) {
          get().showMessage('❌ 无法重做：已是最新编辑状态', 'error');
          return;
        }
        const snap = editorRedo(editorHistory);
        if (!snap) return;
        const levelId = get().currentLevel.id;
        const newEditorHistory: EditorHistoryState = {
          ...editorHistory,
          currentIndex: editorHistory.currentIndex + 1,
        };
        scheduleAutoDraftSave(levelId, snap.level, snap.editorState, newEditorHistory);
        set({
          currentLevel: snap.level,
          editorState: snap.editorState,
          editorHistory: newEditorHistory,
          hasUnsavedDraft: true,
          draftUpdatedAt: Date.now(),
          isDraftRestored: false,
          message: '↪️ 已重做编辑',
          messageType: 'info',
        });
        return;
      }

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
      const { currentLevel, customLevels, editorState } = get();
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
      deleteDraft(levelToSave.id);
      if (autoSaveDraftTimer) {
        clearTimeout(autoSaveDraftTimer);
        autoSaveDraftTimer = null;
      }
      const newEditorState: EditorState = {
        ...editorState,
        gridWidth: levelToSave.width,
        gridHeight: levelToSave.height,
      };
      set({
        customLevels: newLevels,
        currentLevel: levelToSave,
        editorState: newEditorState,
        editorHistory: createEditorHistory(levelToSave, newEditorState),
        hasUnsavedDraft: false,
        draftUpdatedAt: null,
        isDraftRestored: false,
        allDraftIds: get().allDraftIds.filter(id => id !== levelToSave.id),
      });
      return { success: true, message: `✅ 关卡 "${name}" 保存成功（草稿已清除）` };
    },

    deleteCustomLevel: (id: string) => {
      const { customLevels } = get();
      const newLevels = customLevels.filter(l => l.id !== id);
      saveCustomLevels(newLevels);
      deleteDraft(id);
      set({
        customLevels: newLevels,
        allDraftIds: get().allDraftIds.filter(did => did !== id),
      });
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
            const conflicts = detectConflicts(levels, customLevels);
            if (conflicts.length > 0) {
              set({ pendingConflicts: conflicts, pendingAllImportedLevels: levels });
              resolve({
                success: true,
                message: `⚠️ 检测到 ${conflicts.length} 个冲突，请选择处理方式`,
                conflicts,
              });
            } else {
              const newLevels = [...customLevels, ...levels.map(l => ({ ...l, id: l.id || generateId() }))];
              saveCustomLevels(newLevels);
              set({ customLevels: newLevels });
              resolve({ success: true, message: `✅ 成功导入 ${levels.length} 个关卡` });
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '导入失败';
            resolve({ success: false, message });
          }
        });
      });
    },

    resolveImportConflicts: (resolutions: Map<string, ConflictResolution>): ImportResult => {
      const { pendingAllImportedLevels, pendingConflicts, customLevels } = get();
      const conflictMap = new Map(pendingConflicts.map(c => [c.incomingLevel.id, c]));
      let allCustom = [...customLevels];
      const result: ImportResult = {
        imported: [],
        skipped: [],
        overwritten: [],
        duplicated: [],
      };

      for (const incomingLevel of pendingAllImportedLevels) {
        const conflict = conflictMap.get(incomingLevel.id);
        if (!conflict) {
          const newLevel = { ...incomingLevel, id: incomingLevel.id || generateId() };
          allCustom.push(newLevel);
          result.imported.push(newLevel);
          continue;
        }
        const { existingLevel } = conflict;
        const resolution = resolutions.get(incomingLevel.id);
        if (resolution === 'overwrite' && existingLevel) {
          const idx = allCustom.findIndex(l => l.id === existingLevel.id);
          if (idx >= 0) {
            allCustom[idx] = { ...incomingLevel, id: existingLevel.id };
            result.overwritten.push(allCustom[idx]);
            result.imported.push(allCustom[idx]);
          } else {
            allCustom.push(incomingLevel);
            result.imported.push(incomingLevel);
          }
          deleteDraft(existingLevel.id);
        } else if (resolution === 'duplicate') {
          const newId = generateId();
          let baseName = incomingLevel.name || '未命名关卡';
          const existingNames = new Set(allCustom.map(l => l.name));
          let candidate = `${baseName} (副本)`;
          let counter = 2;
          while (existingNames.has(candidate)) {
            candidate = `${baseName} (副本${counter})`;
            counter++;
          }
          const dup: Level = { ...incomingLevel, id: newId, name: candidate };
          allCustom.push(dup);
          result.duplicated.push(dup);
          result.imported.push(dup);
        } else {
          result.skipped.push(incomingLevel);
        }
      }

      saveCustomLevels(allCustom);
      const allDraftIds = get().allDraftIds.filter(id => allCustom.some(l => l.id === id) || hasDraft(id));
      set({
        customLevels: allCustom,
        pendingConflicts: [],
        pendingAllImportedLevels: [],
        allDraftIds,
      });
      return result;
    },

    cancelPendingConflicts: () => {
      set({ pendingConflicts: [], pendingAllImportedLevels: [] });
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
      const loadedCustomLevels = loadCustomLevels();
      const drafts = loadAllDrafts();
      const allDraftIds = drafts.map(d => d.levelId);
      let restoredGame = false;
      let restoredDraft = false;
      let restoredDraftLevelId: string | undefined = undefined;

      if (saved && saved.gameState && saved.actionHistory) {
        set({
          currentLevel: saved.gameState.level,
          gameState: saved.gameState,
          actionHistory: saved.actionHistory,
          historyIndex: saved.historyIndex,
          customLevels: loadedCustomLevels,
          savedGames: loadSaves(),
          message: '✅ 已恢复上次游戏进度',
          messageType: 'success',
          allDraftIds,
        });
        restoredGame = true;
      } else {
        set({
          customLevels: loadedCustomLevels,
          savedGames: loadSaves(),
          allDraftIds,
        });
      }

      const lastId = loadLastEditingLevelId();
      if (lastId) {
        const draft = loadDraft(lastId);
        if (draft) {
          const existingInCustom = loadedCustomLevels.find(l => l.id === lastId);
          const baseLevel: Level = existingInCustom || sampleLevels.find(l => l.id === lastId) || draft.level;
          const ds = draft.level;
          const dirty = JSON.stringify(ds.grid) !== JSON.stringify(baseLevel.grid)
            || ds.name !== baseLevel.name
            || ds.width !== baseLevel.width
            || ds.height !== baseLevel.height
            || JSON.stringify(ds.startPos) !== JSON.stringify(baseLevel.startPos)
            || JSON.stringify(ds.endPos) !== JSON.stringify(baseLevel.endPos);
          if (dirty) {
            const newEditorHistory = draft.editorHistory.snapshots.length > 0
              ? draft.editorHistory
              : createEditorHistory(ds, draft.editorState);
            const restoredState = createInitialGameState(ds);
            const playHistory = resetHistory(createHistory(), restoredState);
            set({
              mode: 'edit',
              currentLevel: ds,
              editorState: draft.editorState,
              editorHistory: newEditorHistory,
              gameState: restoredState,
              actionHistory: playHistory.actions,
              historyIndex: playHistory.currentIndex,
              hasUnsavedDraft: true,
              draftUpdatedAt: draft.updatedAt,
              isDraftRestored: true,
              message: `📝 恢复上次编辑草稿：${ds.name || '未命名关卡'}（${new Date(draft.updatedAt).toLocaleString()}）`,
              messageType: 'info',
            });
            restoredDraft = true;
            restoredDraftLevelId = lastId;
          }
        }
      }

      return { restoredGame, restoredDraft, restoredDraftLevelId };
    },

    discardCurrentDraft: () => {
      const id = get().currentLevel.id;
      deleteDraft(id);
      const inCustom = get().customLevels.find(l => l.id === id);
      const fallback = inCustom || sampleLevels[0];
      const restoredState = createInitialGameState(fallback);
      const playHistory = resetHistory(createHistory(), restoredState);
      const newEditorState = { ...get().editorState, gridWidth: fallback.width, gridHeight: fallback.height };
      set({
        currentLevel: fallback,
        gameState: restoredState,
        actionHistory: playHistory.actions,
        historyIndex: playHistory.currentIndex,
        editorHistory: createEditorHistory(fallback, newEditorState),
        editorState: newEditorState,
        hasUnsavedDraft: false,
        draftUpdatedAt: null,
        isDraftRestored: false,
        allDraftIds: get().allDraftIds.filter(did => did !== id),
        message: '🗑️ 已放弃当前草稿',
        messageType: 'info',
      });
      if (get().mode === 'edit') saveLastEditingLevelId(fallback.id);
    },

    restoreCurrentDraft: (): boolean => {
      const id = get().currentLevel.id;
      const draft = loadDraft(id);
      if (!draft) return false;
      const restoredState = createInitialGameState(draft.level);
      const playHistory = resetHistory(createHistory(), restoredState);
      set({
        currentLevel: draft.level,
        gameState: restoredState,
        actionHistory: playHistory.actions,
        historyIndex: playHistory.currentIndex,
        editorHistory: draft.editorHistory.snapshots.length > 0
          ? draft.editorHistory
          : createEditorHistory(draft.level, draft.editorState),
        editorState: draft.editorState,
        hasUnsavedDraft: true,
        draftUpdatedAt: draft.updatedAt,
        isDraftRestored: true,
        message: `📝 已恢复草稿：${draft.level.name || '未命名关卡'}`,
        messageType: 'info',
      });
      saveLastEditingLevelId(draft.levelId);
      return true;
    },

    refreshDraftStatus: () => {
      const id = get().currentLevel.id;
      set({
        hasUnsavedDraft: computeDirtyFlag(get().currentLevel),
        draftUpdatedAt: getDraftUpdatedAt(id),
        allDraftIds: loadAllDrafts().map(d => d.levelId),
      });
    },
  };
});
