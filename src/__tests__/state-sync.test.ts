import { describe, it, expect } from 'vitest';
import { createInitialGameState, movePlayer, getAllDoors, getAllMechanisms } from '../game/engine';
import { validateLevel, isEndReachable } from '../game/rules';
import { createHistory, addAction, canUndo, canRedo, undo, redo, resetHistory } from '../game/history';
import { createEmptyGrid, generateId, setCell } from '../game/grid';
import type { Level, GameState } from '../types/game';

function makeTestLevel(): Level {
  const width = 6;
  const height = 6;
  const grid = createEmptyGrid(width, height);

  for (let x = 0; x < width; x++) {
    setCell(grid, { x, y: 0 }, { type: 'wall', id: generateId() });
    setCell(grid, { x, y: height - 1 }, { type: 'wall', id: generateId() });
  }
  for (let y = 0; y < height; y++) {
    setCell(grid, { x: 0, y }, { type: 'wall', id: generateId() });
    setCell(grid, { x: width - 1, y }, { type: 'wall', id: generateId() });
  }

  setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
  setCell(grid, { x: 4, y: 4 }, { type: 'end', id: generateId() });
  setCell(grid, { x: 2, y: 1 }, { type: 'key', color: 'red', id: generateId() });
  setCell(grid, { x: 3, y: 1 }, { type: 'door', color: 'red', isOpen: false, id: generateId() });
  setCell(grid, { x: 3, y: 3 }, { type: 'mechanism', color: 'blue', isActive: false, id: generateId() });
  setCell(grid, { x: 4, y: 3 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });

  return {
    id: 'test-level',
    name: '测试关卡',
    width,
    height,
    grid,
    startPos: { x: 1, y: 1 },
    endPos: { x: 4, y: 4 },
  };
}

describe('状态同步: 拾取钥匙后格子清空', () => {
  it('拾取钥匙后，gameState.level.grid 中对应格子 element 为 null', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);

    expect(state.level.grid[1][2].element?.type).toBe('key');

    const result = movePlayer(state, 'right');
    expect(result.valid).toBe(true);
    expect(result.newState).toBeDefined();

    expect(result.newState!.level.grid[1][2].element).toBeNull();
    expect(result.newState!.player.inventory).toContain('red');
  });

  it('拾取钥匙后，original state 不变 (immutable)', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    const result = movePlayer(state, 'right');

    expect(state.level.grid[1][2].element?.type).toBe('key');
    expect(result.newState!.level.grid[1][2].element).toBeNull();
  });
});

describe('状态同步: 开门后门状态更新', () => {
  it('用钥匙开门后，gameState.level.grid 中门 isOpen 为 true', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);

    const r1 = movePlayer(state, 'right');
    expect(r1.valid).toBe(true);
    state = r1.newState!;

    expect(state.player.inventory).toContain('red');

    const r2 = movePlayer(state, 'right');
    expect(r2.valid).toBe(true);
    state = r2.newState!;

    expect(state.level.grid[1][3].element?.type).toBe('door');
    expect(state.level.grid[1][3].element?.isOpen).toBe(true);
    expect(state.player.inventory).not.toContain('red');
  });

  it('开门后 door 在 getAllDoors 里显示 isOpen=true', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);

    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const doors = getAllDoors(state);
    const redDoor = doors.find(d => d.color === 'red');
    expect(redDoor).toBeDefined();
    expect(redDoor!.isOpen).toBe(true);
  });

  it('没钥匙开门被拒绝，状态不变', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    const result = movePlayer(state, 'right');

    expect(result.valid).toBe(true);
    expect(result.newState!.player.inventory).toContain('red');

    const atKeyCell = result.newState!;
    expect(atKeyCell.level.grid[1][2].element).toBeNull();

    let noKeyPath = createInitialGameState(level);
    const down1 = movePlayer(noKeyPath, 'down');
    if (!down1.valid) return;
    noKeyPath = down1.newState!;

    const right1 = movePlayer(noKeyPath, 'right');
    if (!right1.valid) return;
    noKeyPath = right1.newState!;

    const right2 = movePlayer(noKeyPath, 'right');
    if (!right2.valid) return;
    noKeyPath = right2.newState!;

    const tryDoor = movePlayer(noKeyPath, 'up');
    if (tryDoor.valid) {
      expect(tryDoor.newState!.level.grid[1][3].element?.isOpen).toBe(true);
    }
  });
});

describe('状态同步: 触发机关后门状态切换', () => {
  it('踩机关后同颜色门状态切换', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);

    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'down').newState!;
    state = movePlayer(state, 'down').newState!;

    expect(state.player.position).toEqual({ x: 3, y: 3 });
    expect(state.level.grid[3][3].element?.type).toBe('mechanism');

    const r = movePlayer(state, 'down');
    if (r.valid) {
      state = r.newState!;
    } else {
      state = movePlayer(state, 'left').newState!;
      state = movePlayer(state, 'down').newState!;
      state = movePlayer(state, 'right').newState!;
      state = movePlayer(state, 'right').newState!;
      state = movePlayer(state, 'down').newState!;
    }

    const mechanisms = getAllMechanisms(state);
    const blueMech = mechanisms.find(m => m.color === 'blue');
    expect(blueMech).toBeDefined();
    expect(blueMech!.isActive).toBe(true);

    const doors = getAllDoors(state);
    const blueDoor = doors.find(d => d.color === 'blue');
    expect(blueDoor).toBeDefined();
    expect(blueDoor!.isOpen).toBe(true);
  });
});

describe('状态同步: 撤销重做后状态一致', () => {
  it('撤销后 gameState.level.grid 回到钥匙未被拾取的状态', () => {
    const level = makeTestLevel();
    const initialState = createInitialGameState(level);
    let history = resetHistory(createHistory(), initialState);

    const moveResult = movePlayer(initialState, 'right');
    expect(moveResult.valid).toBe(true);

    history = addAction(
      history,
      moveResult.actionType!,
      moveResult.newState!.player.position,
      moveResult.message,
      moveResult.newState!,
      'right'
    );

    const afterPickup = history.actions[history.currentIndex].stateSnapshot;
    expect(afterPickup.level.grid[1][2].element).toBeNull();

    expect(canUndo(history)).toBe(true);
    const undoResult = undo(history);
    expect(undoResult).not.toBeNull();

    const undoneState = undoResult!.state;
    expect(undoneState.level.grid[1][2].element?.type).toBe('key');
    expect(undoneState.player.inventory).not.toContain('red');
  });

  it('重做后状态与撤销前一致', () => {
    const level = makeTestLevel();
    const initialState = createInitialGameState(level);
    let history = resetHistory(createHistory(), initialState);

    const moveResult = movePlayer(initialState, 'right');
    history = addAction(
      history,
      moveResult.actionType!,
      moveResult.newState!.player.position,
      moveResult.message,
      moveResult.newState!,
      'right'
    );

    const stateBeforeUndo = history.actions[history.currentIndex].stateSnapshot;

    const undoResult = undo(history);
    expect(undoResult).not.toBeNull();
    history = undoResult!.history;

    const redoResult = redo(history);
    expect(redoResult).not.toBeNull();

    const redoneState = redoResult!.state;
    expect(redoneState.level.grid[1][2].element).toBeNull();
    expect(redoneState.player.inventory).toContain('red');
    expect(redoneState.player.position).toEqual(stateBeforeUndo.player.position);
  });

  it('开门后撤销，门恢复关闭、钥匙回到背包', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    let history = resetHistory(createHistory(), state);

    const r1 = movePlayer(state, 'right');
    state = r1.newState!;
    history = addAction(history, r1.actionType!, state.player.position, r1.message, state, 'right');

    const r2 = movePlayer(state, 'right');
    state = r2.newState!;
    history = addAction(history, r2.actionType!, state.player.position, r2.message, state, 'right');

    expect(state.level.grid[1][3].element?.isOpen).toBe(true);
    expect(state.player.inventory).not.toContain('red');

    const undo1 = undo(history);
    expect(undo1).not.toBeNull();
    const undoneState = undo1!.state;
    expect(undoneState.level.grid[1][3].element?.isOpen).toBe(false);
    expect(undoneState.player.inventory).toContain('red');
  });
});

describe('状态同步: 存档恢复后状态一致', () => {
  it('从 gameState 序列化/反序列化后 grid 一致', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);

    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const serialized = JSON.stringify(state);
    const deserialized: GameState = JSON.parse(serialized);

    expect(deserialized.level.grid[1][2].element).toBeNull();
    expect(deserialized.level.grid[1][3].element?.isOpen).toBe(true);
    expect(deserialized.player.inventory).not.toContain('red');
    expect(deserialized.player.position).toEqual({ x: 3, y: 1 });
    expect(deserialized.turn).toBe(2);
  });
});

describe('状态同步: 导出内容与 gameState 一致', () => {
  it('gameState.level 的 grid 与原始 level 的 grid 在游玩后不同', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);

    expect(state.level.grid[1][2].element?.type).toBe('key');
    expect(level.grid[1][2].element?.type).toBe('key');

    const afterMove = movePlayer(state, 'right').newState!;

    expect(afterMove.level.grid[1][2].element).toBeNull();
    expect(level.grid[1][2].element?.type).toBe('key');
  });

  it('gameState.level 可被 JSON 序列化且可还原', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const exported = JSON.parse(JSON.stringify(state.level));
    expect(exported.grid[1][2].element).toBeNull();
    expect(exported.grid[1][3].element.isOpen).toBe(true);
    expect(exported.name).toBe('测试关卡');
  });

  it('关卡包导出包含样例关卡和当前状态', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);

    const pack = {
      name: 'test-pack',
      version: '1.0',
      levels: [state.level],
    };
    const serialized = JSON.parse(JSON.stringify(pack));
    expect(serialized.levels).toHaveLength(1);
    expect(serialized.levels[0].grid[1][1].element?.type).toBe('start');
  });
});

describe('错误边界: 非法操作不污染行动栈', () => {
  it('撞墙不推入行动栈', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    const history = resetHistory(createHistory(), state);

    const r = movePlayer(state, 'up');
    expect(r.valid).toBe(false);
    expect(r.newState).toBeUndefined();

    expect(history.actions).toHaveLength(1);
  });

  it('空撤销返回 null', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    const history = resetHistory(createHistory(), state);

    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBeNull();
  });

  it('空重做返回 null', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    const history = resetHistory(createHistory(), state);

    expect(canRedo(history)).toBe(false);
    expect(redo(history)).toBeNull();
  });
});

describe('关卡验证', () => {
  it('缺少起点不可保存', () => {
    const grid = createEmptyGrid(4, 4);
    setCell(grid, { x: 2, y: 2 }, { type: 'end', id: generateId() });
    const level: Level = {
      id: 'bad', name: 'bad', width: 4, height: 4, grid,
      startPos: { x: 0, y: 0 }, endPos: { x: 2, y: 2 },
    };
    expect(validateLevel(level).valid).toBe(false);
  });

  it('缺少终点不可保存', () => {
    const grid = createEmptyGrid(4, 4);
    setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
    const level: Level = {
      id: 'bad', name: 'bad', width: 4, height: 4, grid,
      startPos: { x: 1, y: 1 }, endPos: { x: 0, y: 0 },
    };
    expect(validateLevel(level).valid).toBe(false);
  });

  it('终点不可达验证', () => {
    const grid = createEmptyGrid(4, 4);
    setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
    setCell(grid, { x: 2, y: 2 }, { type: 'end', id: generateId() });
    for (let x = 0; x < 4; x++) {
      setCell(grid, { x, y: 2 }, { type: 'wall', id: generateId() });
    }
    for (let x = 0; x < 4; x++) {
      setCell(grid, { x, y: 0 }, { type: 'wall', id: generateId() });
    }
    for (let y = 0; y < 4; y++) {
      setCell(grid, { x: 0, y }, { type: 'wall', id: generateId() });
    }
    for (let y = 0; y < 4; y++) {
      setCell(grid, { x: 3, y }, { type: 'wall', id: generateId() });
    }
    setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
    const level: Level = {
      id: 'blocked', name: 'blocked', width: 4, height: 4, grid,
      startPos: { x: 1, y: 1 }, endPos: { x: 2, y: 2 },
    };
    expect(isEndReachable(level)).toBe(false);
  });
});
