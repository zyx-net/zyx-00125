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
  ImportRecord,
  ImportLevelDetail,
  LevelImportOutcome,
  ImportFailedItem,
  ReplayRecord,
  ReplayPlaybackState,
  ReplayCompatibilityInfo,
  ReplayImportConflict,
  ReplayConflictResolution,
  ReplayImportResult,
  ReplayImportFailedItem,
  ReplayImportRecord,
  ReplayImportDetail,
  ReplayImportOutcome,
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
  saveImportHistory,
  loadImportHistory,
  saveReplays,
  loadReplays,
  saveReplayImportHistory,
  loadReplayImportHistory,
} from '../utils/storage';
import {
  exportLevel,
  exportLevelPack,
  exportSaveData,
  importLevelPack,
  triggerFileInput,
  exportImportRecordAsJson,
  type ImportPackResult,
  exportReplay,
  exportReplayPack,
  importReplayPack,
  detectReplayConflicts,
  exportReplayImportRecordAsJson,
  type ImportReplayPackResult,
} from '../utils/export';
import {
  buildReplayRecord,
  canSaveReplay,
  checkReplayCompatibility,
  getReplayStateAtStep,
  sanitizeReplays,
  cloneGameState as replayCloneGameState,
} from '../game/replay';

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
  pendingFailedItems: ImportFailedItem[];
  pendingImportFileName: string;
  isDraftRestored: boolean;
  allDraftIds: string[];
  importHistory: ImportRecord[];
  lastImportResult: ImportRecord | null;

  replays: ReplayRecord[];
  playbackState: ReplayPlaybackState;
  currentReplayCompatibility: ReplayCompatibilityInfo | null;
  pendingReplayConflicts: ReplayImportConflict[];
  pendingAllImportedReplays: ReplayRecord[];
  pendingReplayFailedItems: ReplayImportFailedItem[];
  pendingReplayImportFileName: string;
  replayImportHistory: ReplayImportRecord[];
  lastReplayImportResult: ReplayImportRecord | null;
  replayFilter: string | null;

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
  importLevels: () => Promise<{ success: boolean; message: string; conflicts?: ImportConflict[]; failedCount?: number }>;
  resolveImportConflicts: (
    resolutions: Map<string, ConflictResolution>
  ) => ImportResult;
  cancelPendingConflicts: () => void;
  addImportRecord: (record: ImportRecord) => void;
  clearImportHistory: () => void;
  exportCurrentSave: () => void;
  reExportImportResult: (recordId: string) => boolean;
  getBestMoves: (levelId: string) => number | null;
  showMessage: (message: string, type?: 'success' | 'error' | 'info') => void;
  restoreFromStorage: () => { restoredGame: boolean; restoredDraft: boolean; restoredDraftLevelId?: string };
  discardCurrentDraft: () => void;
  restoreCurrentDraft: () => boolean;
  refreshDraftStatus: () => void;

  saveReplay: (name: string) => { success: boolean; message: string; replay?: ReplayRecord };
  deleteReplay: (id: string) => void;
  checkReplayCompatibility: (replayId: string) => ReplayCompatibilityInfo;
  startReplayPlayback: (replayId: string) => { success: boolean; message: string };
  stepReplayForward: () => void;
  stepReplayBackward: () => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  setReplaySpeed: (speed: number) => void;
  jumpToReplayStep: (step: number) => void;
  cancelReplayPlayback: () => void;
  finishReplayPlayback: () => void;
  applyReplayToLevel: (replayId: string) => { success: boolean; message: string };
  exportReplay: (replayId: string) => void;
  exportAllReplays: () => void;
  setReplayFilter: (levelId: string | null) => void;
  importReplays: () => Promise<{ success: boolean; message: string; conflicts?: ReplayImportConflict[]; failedCount?: number }>;
  resolveReplayImportConflicts: (
    resolutions: Map<string, ReplayConflictResolution>
  ) => ReplayImportResult;
  cancelPendingReplayConflicts: () => void;
  clearReplayImportHistory: () => void;
  reExportReplayImportResult: (recordId: string) => boolean;
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
    pendingFailedItems: [],
    pendingImportFileName: '',
    isDraftRestored: false,
    allDraftIds: [],
    importHistory: loadImportHistory(),
    lastImportResult: null,

    replays: sanitizeReplays(loadReplays()),
    playbackState: {
      replayId: null,
      status: 'idle',
      currentStep: 0,
      totalSteps: 0,
      speed: 1,
      prePlaybackSnapshot: null,
    },
    currentReplayCompatibility: null,
    pendingReplayConflicts: [],
    pendingAllImportedReplays: [],
    pendingReplayFailedItems: [],
    pendingReplayImportFileName: '',
    replayImportHistory: loadReplayImportHistory(),
    lastReplayImportResult: null,
    replayFilter: null,

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
      const { gameState, actionHistory, historyIndex, playbackState } = get();
      if (playbackState.status !== 'idle') {
        get().showMessage('⚠️ 回放进行中，请先取消回放再操作', 'error');
        return;
      }
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
      const { mode, editorHistory, actionHistory, historyIndex, playbackState } = get();
      if (playbackState.status !== 'idle') {
        get().showMessage('⚠️ 回放进行中，请先取消回放再操作', 'error');
        return;
      }

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
      const { mode, editorHistory, actionHistory, historyIndex, playbackState } = get();
      if (playbackState.status !== 'idle') {
        get().showMessage('⚠️ 回放进行中，请先取消回放再操作', 'error');
        return;
      }

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
      const { currentLevel, playbackState } = get();
      if (playbackState.status !== 'idle') {
        get().showMessage('⚠️ 回放进行中，请先取消回放再操作', 'error');
        return;
      }
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
      const { gameState, actionHistory, historyIndex, savedGames, playbackState } = get();
      if (playbackState.status !== 'idle') {
        get().showMessage('⚠️ 回放进行中，请先取消回放再保存', 'error');
        return;
      }
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
            let fileHash = '';
            try {
              const buf = await file.arrayBuffer();
              const hashBuf = await crypto.subtle.digest('SHA-256', buf);
              fileHash = Array.from(new Uint8Array(hashBuf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } catch {
              fileHash = `${file.name}-${file.size}-${file.lastModified}`;
            }

            const recentDuplicate = get().importHistory.find(
              r => r.fileHash && r.fileHash === fileHash && (Date.now() - r.timestamp) < 24 * 60 * 60 * 1000
            );
            if (recentDuplicate) {
              const goAhead = window.confirm(
                `⚠️ 检测到 24 小时内已导入过同名同内容文件：\n` +
                `"${file.name}" (${new Date(recentDuplicate.timestamp).toLocaleString()})\n\n` +
                `上次结果：新增 ${recentDuplicate.newCount} / 覆盖 ${recentDuplicate.overwrittenCount} / ` +
                `副本 ${recentDuplicate.duplicatedCount} / 跳过 ${recentDuplicate.skippedCount}` +
                (recentDuplicate.failedCount > 0 ? ` / 失败 ${recentDuplicate.failedCount}` : '') +
                `\n\n是否仍然继续导入？`
              );
              if (!goAhead) {
                resolve({ success: false, message: '已取消重复导入' });
                return;
              }
            }

            const packResult: ImportPackResult = await importLevelPack(file);
            const { validLevels, failedItems } = packResult;
            const { customLevels } = get();

            if (validLevels.length === 0 && failedItems.length === 0) {
              throw new Error('关卡包中没有有效的关卡');
            }

            const conflicts = detectConflicts(validLevels, customLevels);
            const failedDetails: ImportLevelDetail[] = failedItems.map(item => ({
              levelId: item.levelId,
              levelName: item.levelName,
              outcome: 'failed' as LevelImportOutcome,
              failureReason: item.reason,
            }));

            if (validLevels.length === 0 && failedItems.length > 0) {
              const record: ImportRecord = {
                id: generateId(),
                fileName: file.name,
                fileSize: file.size,
                fileHash,
                timestamp: Date.now(),
                newCount: 0,
                overwrittenCount: 0,
                duplicatedCount: 0,
                skippedCount: 0,
                failedCount: failedItems.length,
                failureReasons: failedItems.map(f => f.reason),
                levelDetails: failedDetails,
              };
              const history = [record, ...get().importHistory].slice(0, 50);
              saveImportHistory(history);
              set({ importHistory: history, lastImportResult: record });
              resolve({
                success: false,
                message: `⚠️ 关卡包中 ${failedItems.length} 个关卡全部验证失败`,
                failedCount: failedItems.length,
              });
              return;
            }

            set({
              pendingConflicts: conflicts,
              pendingAllImportedLevels: validLevels,
              pendingFailedItems: failedItems,
              pendingImportFileName: file.name,
            });

            (get() as any)._pendingFileMeta = {
              fileSize: file.size,
              fileHash,
              failedDetails,
            };

            const total = validLevels.length + failedItems.length;
            let message = `📋 即将导入 ${validLevels.length} 个关卡`;
            if (failedItems.length > 0) {
              message += `，${failedItems.length} 个验证失败`;
            }
            if (conflicts.length > 0) {
              message += `，检测到 ${conflicts.length} 个冲突`;
            }
            message += '，请确认';

            resolve({
              success: true,
              message,
              conflicts,
              failedCount: failedItems.length,
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '导入失败';
            let fileHash = '';
            try {
              fileHash = `${file.name}-${file.size}-${file.lastModified}`;
            } catch {
              // ignore
            }
            const record: ImportRecord = {
              id: generateId(),
              fileName: file.name,
              fileSize: file.size,
              fileHash,
              timestamp: Date.now(),
              newCount: 0,
              overwrittenCount: 0,
              duplicatedCount: 0,
              skippedCount: 0,
              failedCount: 1,
              failureReasons: [message],
              levelDetails: [
                {
                  levelId: '__file__',
                  levelName: file.name,
                  outcome: 'failed' as LevelImportOutcome,
                  failureReason: message,
                },
              ],
            };
            const history = [record, ...get().importHistory].slice(0, 50);
            saveImportHistory(history);
            set({ importHistory: history, lastImportResult: record });
            resolve({ success: false, message });
          }
        });
      });
    },

    resolveImportConflicts: (resolutions: Map<string, ConflictResolution>): ImportResult => {
      const {
        pendingAllImportedLevels,
        pendingConflicts,
        customLevels,
        pendingImportFileName,
        pendingFailedItems,
      } = get();
      const conflictMap = new Map(pendingConflicts.map(c => [c.incomingLevel.id, c]));
      let allCustom = [...customLevels];
      const result: ImportResult = {
        imported: [],
        skipped: [],
        overwritten: [],
        duplicated: [],
      };
      const levelDetails: ImportLevelDetail[] = [];

      for (const incomingLevel of pendingAllImportedLevels) {
        const conflict = conflictMap.get(incomingLevel.id);
        if (!conflict) {
          const newLevel = { ...incomingLevel, id: incomingLevel.id || generateId() };
          allCustom.push(newLevel);
          result.imported.push(newLevel);
          levelDetails.push({
            levelId: newLevel.id,
            levelName: newLevel.name || '未命名关卡',
            outcome: 'new',
            newLevelId: newLevel.id,
            newLevelName: newLevel.name || '未命名关卡',
          });
          continue;
        }
        const { existingLevel, conflictType } = conflict;
        const resolution = resolutions.get(incomingLevel.id);
        if (resolution === 'overwrite' && existingLevel) {
          const idx = allCustom.findIndex(l => l.id === existingLevel.id);
          if (idx >= 0) {
            allCustom[idx] = { ...incomingLevel, id: existingLevel.id };
            result.overwritten.push(allCustom[idx]);
            result.imported.push(allCustom[idx]);
            levelDetails.push({
              levelId: incomingLevel.id,
              levelName: incomingLevel.name || '未命名关卡',
              outcome: 'overwritten',
              conflictType,
              existingLevelId: existingLevel.id,
              existingLevelName: existingLevel.name || '未命名关卡',
              newLevelId: existingLevel.id,
              newLevelName: allCustom[idx].name || '未命名关卡',
            });
          } else {
            allCustom.push(incomingLevel);
            result.imported.push(incomingLevel);
            levelDetails.push({
              levelId: incomingLevel.id,
              levelName: incomingLevel.name || '未命名关卡',
              outcome: 'overwritten',
              conflictType,
              existingLevelId: existingLevel.id,
              existingLevelName: existingLevel.name || '未命名关卡',
              newLevelId: incomingLevel.id,
              newLevelName: incomingLevel.name || '未命名关卡',
            });
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
          levelDetails.push({
            levelId: incomingLevel.id,
            levelName: incomingLevel.name || '未命名关卡',
            outcome: 'duplicated',
            conflictType,
            existingLevelId: existingLevel?.id,
            existingLevelName: existingLevel?.name || '未命名关卡',
            newLevelId: newId,
            newLevelName: candidate,
          });
        } else {
          result.skipped.push(incomingLevel);
          levelDetails.push({
            levelId: incomingLevel.id,
            levelName: incomingLevel.name || '未命名关卡',
            outcome: 'skipped',
            conflictType,
            existingLevelId: existingLevel?.id,
            existingLevelName: existingLevel?.name || '未命名关卡',
          });
        }
      }

      for (const failed of pendingFailedItems) {
        levelDetails.push({
          levelId: failed.levelId,
          levelName: failed.levelName,
          outcome: 'failed',
          failureReason: failed.reason,
        });
      }

      saveCustomLevels(allCustom);
      const allDraftIds = get().allDraftIds.filter(id => allCustom.some(l => l.id === id) || hasDraft(id));

      const newCount = result.imported.length - result.overwritten.length - result.duplicated.length;
      const pendingMeta = (get() as any)._pendingFileMeta || {};
      const failureReasons = pendingFailedItems.map(f => f.reason);
      const record: ImportRecord = {
        id: generateId(),
        fileName: pendingImportFileName,
        fileSize: pendingMeta.fileSize,
        fileHash: pendingMeta.fileHash,
        timestamp: Date.now(),
        newCount: Math.max(0, newCount),
        overwrittenCount: result.overwritten.length,
        duplicatedCount: result.duplicated.length,
        skippedCount: result.skipped.length,
        failedCount: pendingFailedItems.length,
        failureReasons,
        levelDetails,
      };
      const history = [record, ...get().importHistory].slice(0, 50);
      saveImportHistory(history);

      (get() as any)._pendingFileMeta = null;

      set({
        customLevels: allCustom,
        pendingConflicts: [],
        pendingAllImportedLevels: [],
        pendingFailedItems: [],
        pendingImportFileName: '',
        allDraftIds,
        importHistory: history,
        lastImportResult: record,
      });
      return result;
    },

    cancelPendingConflicts: () => {
      (get() as any)._pendingFileMeta = null;
      set({
        pendingConflicts: [],
        pendingAllImportedLevels: [],
        pendingFailedItems: [],
        pendingImportFileName: '',
      });
    },

    addImportRecord: (record: ImportRecord) => {
      const normalizedRecord: ImportRecord = {
        levelDetails: [],
        ...record,
      };
      const history = [normalizedRecord, ...get().importHistory].slice(0, 50);
      saveImportHistory(history);
      set({ importHistory: history });
    },

    clearImportHistory: () => {
      saveImportHistory([]);
      set({ importHistory: [], lastImportResult: null });
    },

    reExportImportResult: (recordId: string): boolean => {
      const record = get().importHistory.find(r => r.id === recordId);
      if (!record) {
        get().showMessage('❌ 未找到该导入记录', 'error');
        return false;
      }

      const levelIds = new Set<string>();
      for (const detail of record.levelDetails) {
        if (detail.outcome === 'new' && detail.newLevelId) {
          levelIds.add(detail.newLevelId);
        } else if (detail.outcome === 'overwritten' && detail.newLevelId) {
          levelIds.add(detail.newLevelId);
        } else if (detail.outcome === 'duplicated' && detail.newLevelId) {
          levelIds.add(detail.newLevelId);
        }
      }

      const { customLevels } = get();
      const allLevels = [...sampleLevels, ...customLevels];
      const levelsToExport: Level[] = [];
      for (const id of levelIds) {
        const level = allLevels.find(l => l.id === id);
        if (level) {
          levelsToExport.push(level);
        }
      }

      if (levelsToExport.length === 0) {
        get().showMessage('⚠️ 没有可导出的关卡', 'error');
        return false;
      }

      exportImportRecordAsJson(record, levelsToExport);
      get().showMessage(`✅ 已导出 ${levelsToExport.length} 个关卡的导入结果`, 'success');
      return true;
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

    saveReplay: (name: string) => {
      const { gameState, actionHistory, historyIndex, mode, currentLevel, replays } = get();
      const check = canSaveReplay(gameState, actionHistory, mode);
      if (!check.allowed) {
        return { success: false, message: `❌ ${check.reason!}` };
      }
      if (!name.trim()) {
        return { success: false, message: '❌ 请输入回放名称' };
      }
      const history = { actions: actionHistory, currentIndex: historyIndex };
      const initialState = getReplayStateAtStep(
        { actionHistory } as unknown as ReplayRecord,
        0
      ) || gameState;
      const finalState = actionHistory[historyIndex]?.stateSnapshot || gameState;
      const newReplay = buildReplayRecord(
        name.trim(),
        currentLevel,
        initialState,
        actionHistory,
        finalState
      );
      const newReplays = [...replays, newReplay];
      saveReplays(newReplays);
      set({ replays: newReplays });
      return {
        success: true,
        message: `✅ 回放 "${name}" 保存成功（${newReplay.steps} 步）`,
        replay: newReplay,
      };
    },

    deleteReplay: (id: string) => {
      const { replays, playbackState } = get();
      if (playbackState.replayId === id && playbackState.status !== 'idle') {
        get().cancelReplayPlayback();
      }
      const newReplays = replays.filter(r => r.id !== id);
      saveReplays(newReplays);
      set({ replays: newReplays });
      get().showMessage('✅ 回放已删除', 'success');
    },

    checkReplayCompatibility: (replayId: string) => {
      const { replays, currentLevel } = get();
      const replay = replays.find(r => r.id === replayId);
      if (!replay) {
        return { status: 'incompatible' as const, reason: '回放记录不存在' };
      }
      const compat = checkReplayCompatibility(replay, currentLevel);
      set({ currentReplayCompatibility: compat });
      return compat;
    },

    startReplayPlayback: (replayId: string) => {
      const { replays, currentLevel, gameState, actionHistory, historyIndex } = get();
      const replay = replays.find(r => r.id === replayId);
      if (!replay) {
        return { success: false, message: '❌ 回放记录不存在' };
      }
      const compat = checkReplayCompatibility(replay, currentLevel);
      if (compat.status === 'incompatible') {
        return {
          success: false,
          message: `❌ 回放与当前关卡不兼容：${compat.reason}`,
        };
      }
      const snapshot = {
        gameState: replayCloneGameState(gameState),
        actionHistory: actionHistory.map(a => ({
          ...a,
          stateSnapshot: replayCloneGameState(a.stateSnapshot),
        })),
        historyIndex,
        currentLevel: {
          ...currentLevel,
          grid: cloneGrid(currentLevel.grid),
          startPos: { ...currentLevel.startPos },
          endPos: { ...currentLevel.endPos },
        },
      };
      const firstState = getReplayStateAtStep(replay, 0);
      if (!firstState) {
        return { success: false, message: '❌ 回放数据损坏' };
      }
      set({
        playbackState: {
          replayId,
          status: 'paused',
          currentStep: 0,
          totalSteps: replay.actionHistory.length - 1,
          speed: 1,
          prePlaybackSnapshot: snapshot,
        },
        currentReplayCompatibility: compat,
        gameState: firstState,
        actionHistory: replay.actionHistory.slice(0, 1),
        historyIndex: 0,
        currentLevel: firstState.level,
      });
      return {
        success: true,
        message: compat.status === 'view-only'
          ? `⚠️ 关卡已被编辑，此回放仅可查看步骤（${compat.reason}）`
          : `▶️ 回放已就绪：${replay.name}（${replay.steps} 步）`,
      };
    },

    stepReplayForward: () => {
      const { playbackState, replays } = get();
      if (!playbackState.replayId || playbackState.status === 'idle') return;
      const replay = replays.find(r => r.id === playbackState.replayId);
      if (!replay) return;
      const nextStep = playbackState.currentStep + 1;
      if (nextStep >= replay.actionHistory.length) {
        get().finishReplayPlayback();
        return;
      }
      const nextState = getReplayStateAtStep(replay, nextStep);
      if (!nextState) return;
      const newStatus = nextStep >= replay.actionHistory.length - 1 ? 'finished' : playbackState.status;
      set({
        playbackState: { ...playbackState, currentStep: nextStep, status: newStatus },
        gameState: nextState,
        actionHistory: replay.actionHistory.slice(0, nextStep + 1),
        historyIndex: nextStep,
        currentLevel: nextState.level,
      });
    },

    stepReplayBackward: () => {
      const { playbackState, replays } = get();
      if (!playbackState.replayId || playbackState.status === 'idle') return;
      const replay = replays.find(r => r.id === playbackState.replayId);
      if (!replay) return;
      const prevStep = Math.max(0, playbackState.currentStep - 1);
      const prevState = getReplayStateAtStep(replay, prevStep);
      if (!prevState) return;
      set({
        playbackState: { ...playbackState, currentStep: prevStep, status: 'paused' },
        gameState: prevState,
        actionHistory: replay.actionHistory.slice(0, prevStep + 1),
        historyIndex: prevStep,
        currentLevel: prevState.level,
      });
    },

    pauseReplay: () => {
      const { playbackState } = get();
      if (playbackState.status === 'playing') {
        set({ playbackState: { ...playbackState, status: 'paused' } });
      }
    },

    resumeReplay: () => {
      const { playbackState, replays } = get();
      if (!playbackState.replayId) return;
      const replay = replays.find(r => r.id === playbackState.replayId);
      if (!replay) return;
      if (playbackState.currentStep >= replay.actionHistory.length - 1) return;
      set({ playbackState: { ...playbackState, status: 'playing' } });
    },

    setReplaySpeed: (speed: number) => {
      const { playbackState } = get();
      set({ playbackState: { ...playbackState, speed: Math.max(0.25, Math.min(4, speed)) } });
    },

    jumpToReplayStep: (step: number) => {
      const { playbackState, replays } = get();
      if (!playbackState.replayId || playbackState.status === 'idle') return;
      const replay = replays.find(r => r.id === playbackState.replayId);
      if (!replay) return;
      const clampedStep = Math.max(0, Math.min(replay.actionHistory.length - 1, step));
      const targetState = getReplayStateAtStep(replay, clampedStep);
      if (!targetState) return;
      const finished = clampedStep >= replay.actionHistory.length - 1;
      set({
        playbackState: {
          ...playbackState,
          currentStep: clampedStep,
          status: finished ? 'finished' : playbackState.status,
        },
        gameState: targetState,
        actionHistory: replay.actionHistory.slice(0, clampedStep + 1),
        historyIndex: clampedStep,
        currentLevel: targetState.level,
      });
    },

    cancelReplayPlayback: () => {
      const { playbackState } = get();
      if (!playbackState.prePlaybackSnapshot) {
        set({
          playbackState: {
            replayId: null,
            status: 'idle',
            currentStep: 0,
            totalSteps: 0,
            speed: 1,
            prePlaybackSnapshot: null,
          },
          currentReplayCompatibility: null,
        });
        return;
      }
      const snap = playbackState.prePlaybackSnapshot;
      set({
        gameState: snap.gameState,
        actionHistory: snap.actionHistory,
        historyIndex: snap.historyIndex,
        currentLevel: snap.currentLevel,
        playbackState: {
          replayId: null,
          status: 'idle',
          currentStep: 0,
          totalSteps: 0,
          speed: 1,
          prePlaybackSnapshot: null,
        },
        currentReplayCompatibility: null,
      });
      saveCurrentState(snap.gameState, snap.actionHistory, snap.historyIndex);
      get().showMessage('↩️ 回放已取消，状态已回滚', 'info');
    },

    finishReplayPlayback: () => {
      const { playbackState } = get();
      set({ playbackState: { ...playbackState, status: 'finished' } });
      get().showMessage('🎉 回放播放完成', 'success');
    },

    applyReplayToLevel: (replayId: string) => {
      const { replays, currentLevel } = get();
      const replay = replays.find(r => r.id === replayId);
      if (!replay) {
        return { success: false, message: '❌ 回放记录不存在' };
      }
      const compat = checkReplayCompatibility(replay, currentLevel);
      if (compat.status !== 'compatible') {
        return {
          success: false,
          message: compat.status === 'view-only'
            ? `⚠️ 关卡已被编辑，无法安全套用（${compat.reason}）。可使用"播放查看"`
            : `❌ 回放与当前关卡不兼容：${compat.reason}`,
        };
      }
      const finalIdx = replay.actionHistory.length - 1;
      const finalState = getReplayStateAtStep(replay, finalIdx);
      if (!finalState) {
        return { success: false, message: '❌ 回放数据损坏' };
      }
      set({
        gameState: finalState,
        actionHistory: replay.actionHistory.map(a => ({
          ...a,
          stateSnapshot: replayCloneGameState(a.stateSnapshot),
        })),
        historyIndex: finalIdx,
        currentLevel: finalState.level,
      });
      saveCurrentState(finalState, replay.actionHistory, finalIdx);
      const winMsg = finalState.isWin ? '，关卡已通关！' : '';
      return {
        success: true,
        message: `✅ 已套用回放：${replay.name}（${replay.steps} 步${winMsg}）`,
      };
    },

    exportReplay: (replayId: string) => {
      const replay = get().replays.find(r => r.id === replayId);
      if (!replay) {
        get().showMessage('❌ 回放记录不存在', 'error');
        return;
      }
      exportReplay(replay);
      get().showMessage(`✅ 回放 "${replay.name}" 已导出`, 'success');
    },

    exportAllReplays: () => {
      const { replays } = get();
      if (replays.length === 0) {
        get().showMessage('⚠️ 没有可导出的回放记录', 'error');
        return;
      }
      exportReplayPack(replays, `replay-pack-${Date.now()}`);
      get().showMessage(`✅ 已导出 ${replays.length} 条回放记录`, 'success');
    },

    setReplayFilter: (levelId: string | null) => {
      set({ replayFilter: levelId });
    },

    importReplays: async () => {
      return new Promise((resolve) => {
        triggerFileInput('.json', async (file) => {
          try {
            let fileHash = '';
            try {
              const buf = await file.arrayBuffer();
              const hashBuf = await crypto.subtle.digest('SHA-256', buf);
              fileHash = Array.from(new Uint8Array(hashBuf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } catch {
              fileHash = `${file.name}-${file.size}-${file.lastModified}`;
            }

            const recentDuplicate = get().replayImportHistory.find(
              r => r.fileHash && r.fileHash === fileHash && (Date.now() - r.timestamp) < 24 * 60 * 60 * 1000
            );
            if (recentDuplicate) {
              const goAhead = window.confirm(
                `⚠️ 检测到 24 小时内已导入过同名同内容回放文件：\n` +
                `"${file.name}" (${new Date(recentDuplicate.timestamp).toLocaleString()})\n\n` +
                `上次结果：新增 ${recentDuplicate.newCount} / 覆盖 ${recentDuplicate.overwrittenCount} / ` +
                `副本 ${recentDuplicate.duplicatedCount} / 跳过 ${recentDuplicate.skippedCount}` +
                (recentDuplicate.failedCount > 0 ? ` / 失败 ${recentDuplicate.failedCount}` : '') +
                `\n\n是否仍然继续导入？`
              );
              if (!goAhead) {
                resolve({ success: false, message: '已取消重复导入' });
                return;
              }
            }

            const packResult: ImportReplayPackResult = await importReplayPack(file);
            const { validReplays, failedItems } = packResult;
            const { replays: existingReplays } = get();

            if (validReplays.length === 0 && failedItems.length === 0) {
              throw new Error('回放包中没有有效的回放记录');
            }

            const conflicts = detectReplayConflicts(validReplays, existingReplays);
            const failedDetails: ReplayImportDetail[] = failedItems.map(item => ({
              replayId: item.replayId,
              replayName: item.replayName,
              outcome: 'failed' as ReplayImportOutcome,
              failureReason: item.reason,
            }));

            if (validReplays.length === 0 && failedItems.length > 0) {
              const record: ReplayImportRecord = {
                id: generateId(),
                fileName: file.name,
                fileSize: file.size,
                fileHash,
                timestamp: Date.now(),
                newCount: 0,
                overwrittenCount: 0,
                duplicatedCount: 0,
                skippedCount: 0,
                failedCount: failedItems.length,
                failureReasons: failedItems.map(f => f.reason),
                replayDetails: failedDetails,
              };
              const history = [record, ...get().replayImportHistory].slice(0, 50);
              saveReplayImportHistory(history);
              set({ replayImportHistory: history, lastReplayImportResult: record });
              resolve({
                success: false,
                message: `⚠️ 回放包中 ${failedItems.length} 条回放全部验证失败`,
                failedCount: failedItems.length,
              });
              return;
            }

            set({
              pendingReplayConflicts: conflicts,
              pendingAllImportedReplays: validReplays,
              pendingReplayFailedItems: failedItems,
              pendingReplayImportFileName: file.name,
            });

            (get() as any)._pendingReplayFileMeta = {
              fileSize: file.size,
              fileHash,
              failedDetails,
            };

            const total = validReplays.length + failedItems.length;
            let message = `📋 即将导入 ${validReplays.length} 条回放`;
            if (failedItems.length > 0) {
              message += `，${failedItems.length} 条验证失败`;
            }
            if (conflicts.length > 0) {
              message += `，检测到 ${conflicts.length} 个冲突`;
            }
            message += '，请确认';

            resolve({
              success: true,
              message,
              conflicts,
              failedCount: failedItems.length,
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '导入失败';
            let fileHash = '';
            try {
              fileHash = `${file.name}-${file.size}-${file.lastModified}`;
            } catch {
              // ignore
            }
            const record: ReplayImportRecord = {
              id: generateId(),
              fileName: file.name,
              fileSize: file.size,
              fileHash,
              timestamp: Date.now(),
              newCount: 0,
              overwrittenCount: 0,
              duplicatedCount: 0,
              skippedCount: 0,
              failedCount: 1,
              failureReasons: [message],
              replayDetails: [
                {
                  replayId: '__file__',
                  replayName: file.name,
                  outcome: 'failed' as ReplayImportOutcome,
                  failureReason: message,
                },
              ],
            };
            const history = [record, ...get().replayImportHistory].slice(0, 50);
            saveReplayImportHistory(history);
            set({ replayImportHistory: history, lastReplayImportResult: record });
            resolve({ success: false, message });
          }
        });
      });
    },

    resolveReplayImportConflicts: (resolutions: Map<string, ReplayConflictResolution>): ReplayImportResult => {
      const {
        pendingAllImportedReplays,
        pendingReplayConflicts,
        replays,
        pendingReplayImportFileName,
        pendingReplayFailedItems,
      } = get();
      const conflictMap = new Map(pendingReplayConflicts.map(c => [c.incomingReplay.id, c]));
      let allReplays = [...replays];
      const result: ReplayImportResult = {
        imported: [],
        skipped: [],
        overwritten: [],
        duplicated: [],
      };
      const replayDetails: ReplayImportDetail[] = [];

      for (const incomingReplay of pendingAllImportedReplays) {
        const conflict = conflictMap.get(incomingReplay.id);
        if (!conflict) {
          const newReplay = { ...incomingReplay, id: incomingReplay.id || generateId() };
          allReplays.push(newReplay);
          result.imported.push(newReplay);
          replayDetails.push({
            replayId: newReplay.id,
            replayName: newReplay.name || '未命名回放',
            outcome: 'new',
            newReplayId: newReplay.id,
            newReplayName: newReplay.name || '未命名回放',
          });
          continue;
        }
        const { existingReplay, conflictType } = conflict;
        const resolution = resolutions.get(incomingReplay.id);
        if (resolution === 'overwrite' && existingReplay) {
          const idx = allReplays.findIndex(r => r.id === existingReplay.id);
          if (idx >= 0) {
            allReplays[idx] = { ...incomingReplay, id: existingReplay.id };
            result.overwritten.push(allReplays[idx]);
            result.imported.push(allReplays[idx]);
            replayDetails.push({
              replayId: incomingReplay.id,
              replayName: incomingReplay.name || '未命名回放',
              outcome: 'overwritten',
              conflictType,
              existingReplayId: existingReplay.id,
              existingReplayName: existingReplay.name || '未命名回放',
              newReplayId: existingReplay.id,
              newReplayName: allReplays[idx].name || '未命名回放',
            });
          } else {
            allReplays.push(incomingReplay);
            result.imported.push(incomingReplay);
            replayDetails.push({
              replayId: incomingReplay.id,
              replayName: incomingReplay.name || '未命名回放',
              outcome: 'overwritten',
              conflictType,
              existingReplayId: existingReplay.id,
              existingReplayName: existingReplay.name || '未命名回放',
              newReplayId: incomingReplay.id,
              newReplayName: incomingReplay.name || '未命名回放',
            });
          }
        } else if (resolution === 'duplicate') {
          const newId = generateId();
          let baseName = incomingReplay.name || '未命名回放';
          const existingNames = new Set(allReplays.map(r => r.name));
          let candidate = `${baseName} (副本)`;
          let counter = 2;
          while (existingNames.has(candidate)) {
            candidate = `${baseName} (副本${counter})`;
            counter++;
          }
          const dup: ReplayRecord = { ...incomingReplay, id: newId, name: candidate };
          allReplays.push(dup);
          result.duplicated.push(dup);
          result.imported.push(dup);
          replayDetails.push({
            replayId: incomingReplay.id,
            replayName: incomingReplay.name || '未命名回放',
            outcome: 'duplicated',
            conflictType,
            existingReplayId: existingReplay?.id,
            existingReplayName: existingReplay?.name || '未命名回放',
            newReplayId: newId,
            newReplayName: candidate,
          });
        } else {
          result.skipped.push(incomingReplay);
          replayDetails.push({
            replayId: incomingReplay.id,
            replayName: incomingReplay.name || '未命名回放',
            outcome: 'skipped',
            conflictType,
            existingReplayId: existingReplay?.id,
            existingReplayName: existingReplay?.name || '未命名回放',
          });
        }
      }

      for (const failed of pendingReplayFailedItems) {
        replayDetails.push({
          replayId: failed.replayId,
          replayName: failed.replayName,
          outcome: 'failed',
          failureReason: failed.reason,
        });
      }

      saveReplays(allReplays);
      const newCount = result.imported.length - result.overwritten.length - result.duplicated.length;
      const pendingMeta = (get() as any)._pendingReplayFileMeta || {};
      const failureReasons = pendingReplayFailedItems.map(f => f.reason);
      const record: ReplayImportRecord = {
        id: generateId(),
        fileName: pendingReplayImportFileName,
        fileSize: pendingMeta.fileSize,
        fileHash: pendingMeta.fileHash,
        timestamp: Date.now(),
        newCount: Math.max(0, newCount),
        overwrittenCount: result.overwritten.length,
        duplicatedCount: result.duplicated.length,
        skippedCount: result.skipped.length,
        failedCount: pendingReplayFailedItems.length,
        failureReasons,
        replayDetails,
      };
      const history = [record, ...get().replayImportHistory].slice(0, 50);
      saveReplayImportHistory(history);

      (get() as any)._pendingReplayFileMeta = null;

      set({
        replays: allReplays,
        pendingReplayConflicts: [],
        pendingAllImportedReplays: [],
        pendingReplayFailedItems: [],
        pendingReplayImportFileName: '',
        replayImportHistory: history,
        lastReplayImportResult: record,
      });
      return result;
    },

    cancelPendingReplayConflicts: () => {
      (get() as any)._pendingReplayFileMeta = null;
      set({
        pendingReplayConflicts: [],
        pendingAllImportedReplays: [],
        pendingReplayFailedItems: [],
        pendingReplayImportFileName: '',
      });
    },

    clearReplayImportHistory: () => {
      saveReplayImportHistory([]);
      set({ replayImportHistory: [], lastReplayImportResult: null });
    },

    reExportReplayImportResult: (recordId: string): boolean => {
      const record = get().replayImportHistory.find(r => r.id === recordId);
      if (!record) {
        get().showMessage('❌ 未找到该回放导入记录', 'error');
        return false;
      }
      const replayIds = new Set<string>();
      for (const detail of record.replayDetails) {
        if (detail.outcome === 'new' && detail.newReplayId) {
          replayIds.add(detail.newReplayId);
        } else if (detail.outcome === 'overwritten' && detail.newReplayId) {
          replayIds.add(detail.newReplayId);
        } else if (detail.outcome === 'duplicated' && detail.newReplayId) {
          replayIds.add(detail.newReplayId);
        }
      }
      const { replays } = get();
      const replaysToExport: ReplayRecord[] = [];
      for (const id of replayIds) {
        const replay = replays.find(r => r.id === id);
        if (replay) replaysToExport.push(replay);
      }
      if (replaysToExport.length === 0) {
        get().showMessage('⚠️ 没有可导出的回放记录', 'error');
        return false;
      }
      exportReplayImportRecordAsJson(record, replaysToExport);
      get().showMessage(`✅ 已导出 ${replaysToExport.length} 条回放的导入结果`, 'success');
      return true;
    },
  };
});
