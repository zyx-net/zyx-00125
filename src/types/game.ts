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

export interface ImportResult {
  imported: Level[];
  skipped: Level[];
  overwritten: Level[];
  duplicated: Level[];
}

export interface ImportRecord {
  id: string;
  fileName: string;
  timestamp: number;
  newCount: number;
  overwrittenCount: number;
  duplicatedCount: number;
  skippedCount: number;
  failedCount: number;
  failureReasons: string[];
}
