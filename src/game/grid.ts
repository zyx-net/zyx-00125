import type { Cell, Position, Level, GameElement, Color } from '../types/game';

export function createEmptyGrid(width: number, height: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, element: null });
    }
    grid.push(row);
  }
  return grid;
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map(row => row.map(cell => ({
    ...cell,
    element: cell.element ? { ...cell.element } : null
  })));
}

export function isInBounds(pos: Position, width: number, height: number): boolean {
  return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

export function getCell(grid: Cell[][], pos: Position): Cell | null {
  if (!grid[pos.y] || !grid[pos.y][pos.x]) return null;
  return grid[pos.y][pos.x];
}

export function setCell(grid: Cell[][], pos: Position, element: GameElement | null): void {
  if (grid[pos.y] && grid[pos.y][pos.x]) {
    grid[pos.y][pos.x].element = element;
  }
}

export function findCellsByType(grid: Cell[][], type: string): Cell[] {
  const cells: Cell[] = [];
  for (const row of grid) {
    for (const cell of row) {
      if (cell.element?.type === type) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function createLevel(
  name: string,
  width: number,
  height: number,
  grid: Cell[][],
  startPos: Position,
  endPos: Position
): Level {
  return {
    id: generateId(),
    name,
    width,
    height,
    grid: cloneGrid(grid),
    startPos,
    endPos
  };
}

export function toggleDoorsByColor(grid: Cell[][], color: Color): void {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.element?.type === 'door' && cell.element.color === color) {
        cell.element.isOpen = !cell.element.isOpen;
      }
    }
  }
}

export function isDoorOpen(grid: Cell[][], pos: Position): boolean {
  const cell = getCell(grid, pos);
  if (!cell?.element || cell.element.type !== 'door') return false;
  return cell.element.isOpen ?? false;
}
