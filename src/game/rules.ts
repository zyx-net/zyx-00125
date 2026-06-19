import type { Position, Color, Level, GameState } from '../types/game';
import { isInBounds, getCell, isDoorOpen, toggleDoorsByColor, cloneGrid } from './grid';

export interface MoveResult {
  valid: boolean;
  message: string;
  newState?: GameState;
  actionType?: 'move' | 'pickup' | 'openDoor' | 'triggerMechanism';
}

export function getNewPosition(pos: Position, direction: string): Position {
  const deltas: Record<string, Position> = {
    up: { x: pos.x, y: pos.y - 1 },
    down: { x: pos.x, y: pos.y + 1 },
    left: { x: pos.x - 1, y: pos.y },
    right: { x: pos.x + 1, y: pos.y },
  };
  return deltas[direction] || pos;
}

export function checkMove(
  currentState: GameState,
  direction: string
): MoveResult {
  const { level, player } = currentState;
  const newPos = getNewPosition(player.position, direction);

  if (!isInBounds(newPos, level.width, level.height)) {
    return { valid: false, message: '❌ 移动失败：超出边界' };
  }

  const targetCell = getCell(level.grid, newPos);
  if (!targetCell) {
    return { valid: false, message: '❌ 移动失败：无效位置' };
  }

  const element = targetCell.element;

  if (element?.type === 'wall') {
    return { valid: false, message: '❌ 移动失败：前方是墙壁' };
  }

  if (element?.type === 'door' && !isDoorOpen(level.grid, newPos)) {
    const doorColor = element.color;
    const hasKey = player.inventory.includes(doorColor!);
    if (!hasKey) {
      return { valid: false, message: `❌ 移动失败：需要${getColorName(doorColor!)}钥匙` };
    }

    const newGrid = cloneGrid(level.grid);
    const newInventory = player.inventory.filter((c, i) => {
      if (c === doorColor) {
        const firstIndex = player.inventory.indexOf(doorColor!);
        return i !== firstIndex;
      }
      return true;
    });

    const doorCell = getCell(newGrid, newPos)!;
    if (doorCell.element) {
      doorCell.element.isOpen = true;
    }

    const newState: GameState = {
      ...currentState,
      level: {
        ...level,
        grid: newGrid,
      },
      player: {
        ...player,
        position: newPos,
        inventory: newInventory,
      },
      turn: currentState.turn + 1,
      message: `✅ 使用${getColorName(doorColor!)}钥匙打开了门`,
    };

    return {
      valid: true,
      message: `✅ 使用${getColorName(doorColor!)}钥匙打开了门`,
      newState,
      actionType: 'openDoor',
    };
  }

  const newGrid = cloneGrid(level.grid);
  const newInventory = [...player.inventory];
  let actionType: 'move' | 'pickup' | 'triggerMechanism' = 'move';
  let message = `✅ 向${getDirectionName(direction)}移动`;

  if (element?.type === 'key') {
    const keyColor = element.color!;
    newInventory.push(keyColor);
    const keyCell = getCell(newGrid, newPos)!;
    keyCell.element = null;
    actionType = 'pickup';
    message = `✅ 拾取了${getColorName(keyColor)}钥匙`;
  }

  if (element?.type === 'mechanism') {
    const mechColor = element.color!;
    toggleDoorsByColor(newGrid, mechColor);
    const mechCell = getCell(newGrid, newPos)!;
    if (mechCell.element) {
      mechCell.element.isActive = !mechCell.element.isActive;
    }
    actionType = 'triggerMechanism';
    message = `✅ 触发了${getColorName(mechColor)}机关`;
  }

  let isWin = false;
  let isGameOver = false;
  if (element?.type === 'end') {
    isWin = true;
    isGameOver = true;
    message = '🎉 恭喜通关！';
  }

  const newState: GameState = {
    ...currentState,
    level: {
      ...level,
      grid: newGrid,
    },
    player: {
      ...player,
      position: newPos,
      inventory: newInventory,
    },
    turn: currentState.turn + 1,
    isWin,
    isGameOver,
    message,
  };

  return { valid: true, message, newState, actionType };
}

export function getDirectionName(direction: string): string {
  const names: Record<string, string> = {
    up: '上',
    down: '下',
    left: '左',
    right: '右',
  };
  return names[direction] || direction;
}

export function getColorName(color: Color): string {
  const names: Record<Color, string> = {
    red: '红色',
    blue: '蓝色',
    green: '绿色',
    yellow: '黄色',
  };
  return names[color];
}

export function validateLevel(level: unknown): { valid: boolean; message: string } {
  if (!level || typeof level !== 'object') {
    return { valid: false, message: '❌ 关卡数据格式错误' };
  }

  const lvl = level as Record<string, unknown>;
  if (!lvl.grid || !Array.isArray(lvl.grid)) {
    return { valid: false, message: '❌ 缺少 grid 字段或格式错误' };
  }
  if (!lvl.startPos || typeof lvl.startPos !== 'object') {
    return { valid: false, message: '❌ 缺少起点位置' };
  }
  if (!lvl.endPos || typeof lvl.endPos !== 'object') {
    return { valid: false, message: '❌ 缺少终点位置' };
  }
  if (typeof lvl.width !== 'number' || typeof lvl.height !== 'number') {
    return { valid: false, message: '❌ 缺少 width 或 height 字段' };
  }

  const startCells = [];
  const endCells = [];

  for (const row of lvl.grid as unknown[][]) {
    for (const cell of row as unknown[]) {
      const c = cell as { element?: { type?: string } };
      if (c.element?.type === 'start') startCells.push(cell);
      if (c.element?.type === 'end') endCells.push(cell);
    }
  }

  if (startCells.length === 0) {
    return { valid: false, message: '❌ 关卡缺少起点' };
  }
  if (startCells.length > 1) {
    return { valid: false, message: '❌ 关卡有多个起点，只能有一个' };
  }
  if (endCells.length === 0) {
    return { valid: false, message: '❌ 关卡缺少终点' };
  }
  if (endCells.length > 1) {
    return { valid: false, message: '❌ 关卡有多个终点，只能有一个' };
  }

  if (!isEndReachable(lvl as unknown as Level)) {
    return { valid: false, message: '❌ 终点不可达，请调整关卡设计' };
  }

  return { valid: true, message: '✅ 关卡验证通过' };
}

export function isEndReachable(level: Level): boolean {
  const { grid, startPos, endPos, width, height } = level;
  const visited = new Set<string>();
  const queue: Position[] = [startPos];

  const hasKey = new Map<string, Set<Color>>();
  const initialKeys = new Set<Color>();
  hasKey.set(`${startPos.x},${startPos.y}`, initialKeys);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;

    if (current.x === endPos.x && current.y === endPos.y) {
      return true;
    }

    if (visited.has(key)) continue;
    visited.add(key);

    const currentKeys = hasKey.get(key) || new Set<Color>();
    const cell = getCell(grid, current);
    if (cell?.element?.type === 'key') {
      currentKeys.add(cell.element.color!);
    }

    const directions = ['up', 'down', 'left', 'right'];
    for (const dir of directions) {
      const next = getNewPosition(current, dir);
      if (!isInBounds(next, width, height)) continue;

      const nextCell = getCell(grid, next);
      if (!nextCell) continue;

      const nextElement = nextCell.element;
      if (nextElement?.type === 'wall') continue;

      if (nextElement?.type === 'door' && !nextElement.isOpen) {
        if (!currentKeys.has(nextElement.color!)) continue;
      }

      const nextKey = `${next.x},${next.y}`;
      const nextKeys = new Set(currentKeys);
      if (nextElement?.type === 'key') {
        nextKeys.add(nextElement.color!);
      }
      hasKey.set(nextKey, nextKeys);

      if (!visited.has(nextKey)) {
        queue.push(next);
      }
    }
  }

  return false;
}
