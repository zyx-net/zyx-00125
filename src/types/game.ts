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
