export type CellType = 'empty' | 'wall' | 'start' | 'end' | 'key' | 'door' | 'mechanism';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Color = 'red' | 'blue' | 'green' | 'yellow';

export interface Position {
  x: number;
  y: number;
}

export interface GameElement {
  type: CellType;
  color?: Color;
  id?: string;
  isOpen?: boolean;
  isActive?: boolean;
}

export interface Cell {
  x: number;
  y: number;
  element: GameElement | null;
}

export interface Level {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: Cell[][];
  startPos: Position;
  endPos: Position;
}

export interface PlayerState {
  position: Position;
  inventory: Color[];
}

export interface GameState {
  level: Level;
  player: PlayerState;
  turn: number;
  isGameOver: boolean;
  isWin: boolean;
  message: string;
}

export interface Action {
  id: string;
  type: 'move' | 'pickup' | 'openDoor' | 'triggerMechanism';
  direction?: Direction;
  position: Position;
  description: string;
  timestamp: number;
  stateSnapshot: GameState;
}

export interface SaveData {
  id: string;
  name: string;
  timestamp: number;
  gameState: GameState;
  actionHistory: Action[];
  historyIndex: number;
  bestMoves?: number;
}

export type Mode = 'edit' | 'play';

export interface EditorState {
  selectedTool: CellType | 'eraser';
  selectedColor: Color;
  gridWidth: number;
  gridHeight: number;
}

export interface EditorSnapshot {
  level: Level;
  editorState: EditorState;
  timestamp: number;
}

export interface EditorHistoryState {
  snapshots: EditorSnapshot[];
  currentIndex: number;
}

export interface DraftData {
  levelId: string;
  level: Level;
  editorState: EditorState;
  editorHistory: EditorHistoryState;
  savedAt: number;
  updatedAt: number;
}

export type ConflictResolution = 'overwrite' | 'duplicate' | 'cancel';

export interface ImportConflict {
  incomingLevel: Level;
  existingLevel?: Level;
  conflictType: 'id' | 'name' | 'both';
}

export interface ImportFailedItem {
  levelData: unknown;
  levelName: string;
  levelId: string;
  reason: string;
}

export interface ImportPreviewData {
  validLevels: Level[];
  failedItems: ImportFailedItem[];
  conflicts: ImportConflict[];
  fileName: string;
}

export interface ImportResult {
  imported: Level[];
  skipped: Level[];
  overwritten: Level[];
  duplicated: Level[];
}

export type LevelImportOutcome = 'new' | 'overwritten' | 'duplicated' | 'skipped' | 'failed';

export interface ImportLevelDetail {
  levelId: string;
  levelName: string;
  outcome: LevelImportOutcome;
  conflictType?: 'id' | 'name' | 'both';
  existingLevelId?: string;
  existingLevelName?: string;
  newLevelId?: string;
  newLevelName?: string;
  failureReason?: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  fileSize?: number;
  fileHash?: string;
  timestamp: number;
  newCount: number;
  overwrittenCount: number;
  duplicatedCount: number;
  skippedCount: number;
  failedCount: number;
  failureReasons: string[];
  levelDetails: ImportLevelDetail[];
}

export interface KeyStep {
  actionIndex: number;
  description: string;
  type: Action['type'];
}

export interface LevelContentDigest {
  width: number;
  height: number;
  startPos: Position;
  endPos: Position;
  gridHash: string;
}

export interface ReplayRecord {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  steps: number;
  isWin: boolean;
  createdAt: number;
  keySteps: KeyStep[];
  levelDigest: LevelContentDigest;
  actionHistory: Action[];
  finalState?: GameState;
  initialState: GameState;
}

export type ReplayCompatibility = 'compatible' | 'view-only' | 'incompatible';

export interface ReplayCompatibilityInfo {
  status: ReplayCompatibility;
  reason?: string;
  differences?: string[];
}

export type ReplayPlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'cancelled';

export interface ReplayPlaybackState {
  replayId: string | null;
  status: ReplayPlaybackStatus;
  currentStep: number;
  totalSteps: number;
  speed: number;
  prePlaybackSnapshot: {
    gameState: GameState;
    actionHistory: Action[];
    historyIndex: number;
    currentLevel: Level;
  } | null;
}

export type ReplayConflictResolution = 'overwrite' | 'duplicate' | 'skip';

export interface ReplayImportConflict {
  incomingReplay: ReplayRecord;
  existingReplay?: ReplayRecord;
  conflictType: 'id' | 'name' | 'both';
}

export interface ReplayImportFailedItem {
  replayData: unknown;
  replayName: string;
  replayId: string;
  reason: string;
}

export interface ReplayImportPreviewData {
  validReplays: ReplayRecord[];
  failedItems: ReplayImportFailedItem[];
  conflicts: ReplayImportConflict[];
  fileName: string;
}

export interface ReplayImportResult {
  imported: ReplayRecord[];
  skipped: ReplayRecord[];
  overwritten: ReplayRecord[];
  duplicated: ReplayRecord[];
}

export type ReplayImportOutcome = 'new' | 'overwritten' | 'duplicated' | 'skipped' | 'failed';

export interface ReplayImportDetail {
  replayId: string;
  replayName: string;
  outcome: ReplayImportOutcome;
  conflictType?: 'id' | 'name' | 'both';
  existingReplayId?: string;
  existingReplayName?: string;
  newReplayId?: string;
  newReplayName?: string;
  failureReason?: string;
}

export interface ReplayImportRecord {
  id: string;
  fileName: string;
  fileSize?: number;
  fileHash?: string;
  timestamp: number;
  newCount: number;
  overwrittenCount: number;
  duplicatedCount: number;
  skippedCount: number;
  failedCount: number;
  failureReasons: string[];
  replayDetails: ReplayImportDetail[];
}
