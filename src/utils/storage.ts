import type { Level, SaveData, GameState, Action, DraftData, EditorState, EditorHistoryState, ImportRecord } from '../types/game';

const STORAGE_KEYS = {
  LEVELS: 'puzzle_levels',
  SAVES: 'puzzle_saves',
  BEST_MOVES: 'puzzle_best_moves',
  CURRENT_STATE: 'puzzle_current_state',
  DRAFT_PREFIX: 'puzzle_draft_',
  DRAFT_INDEX: 'puzzle_draft_index',
  LAST_EDITING_LEVEL: 'puzzle_last_editing_level',
  IMPORT_HISTORY: 'puzzle_import_history',
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
  const draftKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_KEYS.DRAFT_PREFIX)) {
      draftKeys.push(k);
    }
  }
  draftKeys.forEach(k => localStorage.removeItem(k));
}

function draftKey(levelId: string): string {
  return `${STORAGE_KEYS.DRAFT_PREFIX}${levelId}`;
}

export function saveDraft(
  levelId: string,
  level: Level,
  editorState: EditorState,
  editorHistory: EditorHistoryState
): DraftData {
  const now = Date.now();
  const existing = loadDraft(levelId);
  const draft: DraftData = {
    levelId,
    level,
    editorState,
    editorHistory,
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
  };
  saveToStorage(draftKey(levelId), draft);
  const index = loadDraftIndex();
  if (!index.includes(levelId)) {
    index.push(levelId);
    saveToStorage(STORAGE_KEYS.DRAFT_INDEX, index);
  }
  return draft;
}

export function loadDraft(levelId: string): DraftData | null {
  return loadFromStorage<DraftData | null>(draftKey(levelId), null);
}

export function deleteDraft(levelId: string): void {
  localStorage.removeItem(draftKey(levelId));
  const index = loadDraftIndex().filter(id => id !== levelId);
  saveToStorage(STORAGE_KEYS.DRAFT_INDEX, index);
}

export function loadDraftIndex(): string[] {
  return loadFromStorage<string[]>(STORAGE_KEYS.DRAFT_INDEX, []);
}

export function loadAllDrafts(): DraftData[] {
  const index = loadDraftIndex();
  const drafts: DraftData[] = [];
  for (const id of index) {
    const draft = loadDraft(id);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export function hasDraft(levelId: string): boolean {
  return loadDraft(levelId) !== null;
}

export function isLevelDirty(levelId: string, currentLevel: Level): boolean {
  const draft = loadDraft(levelId);
  if (!draft) return false;
  return JSON.stringify(draft.level.grid) !== JSON.stringify(currentLevel.grid)
    || JSON.stringify(draft.level.startPos) !== JSON.stringify(currentLevel.startPos)
    || JSON.stringify(draft.level.endPos) !== JSON.stringify(currentLevel.endPos)
    || draft.level.name !== currentLevel.name
    || draft.level.width !== currentLevel.width
    || draft.level.height !== currentLevel.height;
}

export function saveLastEditingLevelId(levelId: string): void {
  saveToStorage(STORAGE_KEYS.LAST_EDITING_LEVEL, levelId);
}

export function loadLastEditingLevelId(): string | null {
  return loadFromStorage<string | null>(STORAGE_KEYS.LAST_EDITING_LEVEL, null);
}

export function clearLastEditingLevelId(): void {
  localStorage.removeItem(STORAGE_KEYS.LAST_EDITING_LEVEL);
}

export function getDraftUpdatedAt(levelId: string): number | null {
  const draft = loadDraft(levelId);
  return draft?.updatedAt ?? null;
}

export function saveImportHistory(records: ImportRecord[]): void {
  saveToStorage(STORAGE_KEYS.IMPORT_HISTORY, records);
}

export function loadImportHistory(): ImportRecord[] {
  return loadFromStorage<ImportRecord[]>(STORAGE_KEYS.IMPORT_HISTORY, []);
}
