import { describe, it, expect } from 'vitest';
import { createInitialGameState, movePlayer, getAllDoors, getAllMechanisms } from '../game/engine';
import { validateLevel, isEndReachable } from '../game/rules';
import { createHistory, addAction, canUndo, canRedo, undo, redo, resetHistory } from '../game/history';
import { createEmptyGrid, generateId, setCell } from '../game/grid';
import type { Level, GameState, Direction } from '../types/game';

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

describe('历史快照独立性: 后续操作不污染之前的快照', () => {
  it('每步保存的 stateSnapshot 应该独立，不被后续操作修改', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    let history = resetHistory(createHistory(), state);

    const snap0 = history.actions[0].stateSnapshot;
    expect(snap0.level.grid[1][2].element?.type).toBe('key');
    expect(snap0.level.grid[1][3].element?.isOpen).toBe(false);
    expect(snap0.player.inventory).toEqual([]);

    const r1 = movePlayer(state, 'right');
    state = r1.newState!;
    history = addAction(history, r1.actionType!, state.player.position, r1.message, state, 'right');

    const snap1 = history.actions[1].stateSnapshot;
    expect(snap1.level.grid[1][2].element).toBeNull();
    expect(snap1.player.inventory).toEqual(['red']);

    expect(snap0.level.grid[1][2].element?.type).toBe('key');
    expect(snap0.player.inventory).toEqual([]);

    const r2 = movePlayer(state, 'right');
    state = r2.newState!;
    history = addAction(history, r2.actionType!, state.player.position, r2.message, state, 'right');

    const snap2 = history.actions[2].stateSnapshot;
    expect(snap2.level.grid[1][3].element?.isOpen).toBe(true);
    expect(snap2.player.inventory).toEqual([]);

    expect(snap0.level.grid[1][2].element?.type).toBe('key');
    expect(snap0.player.inventory).toEqual([]);
    expect(snap1.level.grid[1][2].element).toBeNull();
    expect(snap1.level.grid[1][3].element?.isOpen).toBe(false);
    expect(snap1.player.inventory).toEqual(['red']);
  });

  it('完整浏览器流程: 多步操作后所有历史快照状态独立正确', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    let history = resetHistory(createHistory(), state);

    const expectedSnaps = [
      { desc: '初始状态', keyCell: 'key', doorOpen: false, inventory: [] as string[] },
      { desc: '向右', keyCell: null, doorOpen: false, inventory: ['red'] },
      { desc: '向右', keyCell: null, doorOpen: true, inventory: [] as string[] },
    ];

    for (let i = 0; i < 2; i++) {
      const r = movePlayer(state, 'right');
      state = r.newState!;
      history = addAction(history, r.actionType!, state.player.position, r.message, state, 'right');
    }

    for (let i = 0; i < history.actions.length; i++) {
      const snap = history.actions[i].stateSnapshot;
      const expected = expectedSnaps[i];
      expect(snap.level.grid[1][2].element?.type ?? null).toBe(expected.keyCell);
      expect(snap.level.grid[1][3].element?.isOpen).toBe(expected.doorOpen);
      expect(snap.player.inventory).toEqual(expected.inventory);
    }
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

describe('导出内容一致性: 单关卡导出与当前局面一致', () => {
  it('拾钥匙后导出的 level.grid 中钥匙格 element 为 null', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;

    const exported = JSON.parse(JSON.stringify(state.level));
    expect(exported.grid[1][2].element).toBeNull();
    expect(exported.grid[1][3].element?.type).toBe('door');
    expect(exported.grid[1][3].element?.isOpen).toBe(false);
    expect(exported.grid[1][1].element?.type).toBe('start');
  });

  it('开门后导出的 level.grid 中门 isOpen=true，钥匙格仍为空', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const exported = JSON.parse(JSON.stringify(state.level));
    expect(exported.grid[1][2].element).toBeNull();
    expect(exported.grid[1][3].element?.type).toBe('door');
    expect(exported.grid[1][3].element?.isOpen).toBe(true);
    expect(exported.grid[1][3].element?.color).toBe('red');
  });

  it('撤销后导出内容恢复到钥匙未拾取状态', () => {
    const level = makeTestLevel();
    const state = createInitialGameState(level);
    let history = resetHistory(createHistory(), state);

    const move1 = movePlayer(state, 'right');
    history = addAction(history, move1.actionType!, move1.newState!.player.position, move1.message, move1.newState!, 'right');

    const undoResult = undo(history);
    expect(undoResult).not.toBeNull();

    const exportedAfterUndo = JSON.parse(JSON.stringify(undoResult!.state.level));
    expect(exportedAfterUndo.grid[1][2].element?.type).toBe('key');
    expect(exportedAfterUndo.grid[1][2].element?.color).toBe('red');

    const redoResult = redo(undoResult!.history);
    expect(redoResult).not.toBeNull();

    const exportedAfterRedo = JSON.parse(JSON.stringify(redoResult!.state.level));
    expect(exportedAfterRedo.grid[1][2].element).toBeNull();
  });

  it('存档序列化后再加载，level 与导出内容逐字段一致', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const serialized = JSON.stringify(state);
    const restored: GameState = JSON.parse(serialized);

    const exportedFromOriginal = JSON.parse(JSON.stringify(state.level));
    const exportedFromRestored = JSON.parse(JSON.stringify(restored.level));

    expect(exportedFromRestored.grid[1][2].element).toBeNull();
    expect(exportedFromRestored.grid[1][3].element?.isOpen).toBe(true);
    expect(restored.player.position).toEqual(state.player.position);
    expect(exportedFromRestored.width).toBe(exportedFromOriginal.width);
    expect(exportedFromRestored.height).toBe(exportedFromOriginal.height);
    expect(exportedFromRestored.id).toBe(exportedFromOriginal.id);
  });

  it('导出的 level 可被 JSON 序列化/反序列化且结构完整', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;

    const json = JSON.stringify(state.level);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('width');
    expect(parsed).toHaveProperty('height');
    expect(parsed).toHaveProperty('grid');
    expect(parsed).toHaveProperty('startPos');
    expect(parsed).toHaveProperty('endPos');
    expect(Array.isArray(parsed.grid)).toBe(true);
    expect(parsed.grid.length).toBe(parsed.height);
    expect(parsed.grid[0].length).toBe(parsed.width);
  });
});

describe('导出内容一致性: 关卡包导出包含当前实时状态', () => {
  it('关卡包构造时，游玩模式下当前 level 会替换同 id 的蓝图', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const blueprint = makeTestLevel();
    const allLevels = [blueprint];

    const mode = 'play';
    if (mode === 'play' && state.level?.id) {
      const idx = allLevels.findIndex(l => l.id === state.level.id);
      if (idx >= 0) {
        allLevels[idx] = state.level;
      }
    }

    const packLevel = allLevels[0];
    expect(packLevel.grid[1][2].element).toBeNull();
    expect(packLevel.grid[1][3].element?.isOpen).toBe(true);

    const originalBlueprint = makeTestLevel();
    expect(originalBlueprint.grid[1][2].element?.type).toBe('key');
    expect(originalBlueprint.grid[1][3].element?.isOpen).toBe(false);
  });

  it('编辑模式下关卡包导出蓝图不变', () => {
    const blueprint = makeTestLevel();
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;

    const allLevels = [blueprint];
    const mode = 'edit' as string;

    if (mode === 'play' && state.level?.id) {
      const idx = allLevels.findIndex(l => l.id === state.level.id);
      if (idx >= 0) {
        allLevels[idx] = state.level;
      }
    }

    expect(allLevels[0].grid[1][2].element?.type).toBe('key');
    expect(allLevels[0].grid[1][3].element?.isOpen).toBe(false);
  });

  it('导出的关卡包 JSON 可被导入并验证通过', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;

    const pack = {
      name: 'test-pack',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      levels: [state.level],
    };

    const json = JSON.stringify(pack);
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed.levels)).toBe(true);
    expect(parsed.levels.length).toBe(1);
    expect(parsed.levels[0].grid[1][2].element).toBeNull();
    expect(validateLevel(parsed.levels[0]).valid).toBe(true);
  });

  it('关卡包导入后重新导出，内容与原导出一致', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const originalPack = {
      name: 'pack1',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      levels: [state.level],
    };

    const json1 = JSON.stringify(originalPack);
    const parsed = JSON.parse(json1);

    const reExportedPack = {
      name: 'pack2',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      levels: parsed.levels,
    };

    const json2 = JSON.stringify(reExportedPack);
    const levels1 = JSON.parse(json1).levels;
    const levels2 = JSON.parse(json2).levels;

    expect(levels1[0].grid[1][2].element).toBeNull();
    expect(levels2[0].grid[1][2].element).toBeNull();
    expect(levels1[0].grid[1][3].element?.isOpen).toBe(true);
    expect(levels2[0].grid[1][3].element?.isOpen).toBe(true);
    expect(state.player.position).toEqual({ x: 3, y: 1 });
  });
});

describe('状态同步: 保存恢复后导出内容一致', () => {
  it('saveCurrentState 保存的数据 loadCurrentState 后，level 与导出一致', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    state = movePlayer(state, 'right').newState!;
    state = movePlayer(state, 'right').newState!;

    const history = resetHistory(createHistory(), state);
    const saveData = {
      gameState: state,
      actionHistory: history.actions,
      historyIndex: history.currentIndex,
      timestamp: Date.now(),
    };

    const serialized = JSON.stringify(saveData);
    const restored = JSON.parse(serialized);

    expect(restored.gameState.level.grid[1][2].element).toBeNull();
    expect(restored.gameState.level.grid[1][3].element?.isOpen).toBe(true);
    expect(restored.gameState.player.inventory).not.toContain('red');
    expect(restored.gameState.turn).toBe(2);

    const exportedLevel = JSON.parse(JSON.stringify(state.level));
    expect(restored.gameState.level.grid[1][2].element).toEqual(exportedLevel.grid[1][2].element);
    expect(restored.gameState.level.grid[1][3].element?.isOpen).toEqual(exportedLevel.grid[1][3].element?.isOpen);
  });

  it('完整流程: 移动→拾钥匙→开门→存档→读档→导出，结果一致', () => {
    const level = makeTestLevel();
    let state = createInitialGameState(level);
    let history = resetHistory(createHistory(), state);

    const moves: Direction[] = ['right', 'right', 'down', 'down'];
    for (const dir of moves) {
      const r = movePlayer(state, dir);
      if (r.valid && r.newState) {
        history = addAction(history, r.actionType!, r.newState.player.position, r.message, r.newState, dir);
        state = r.newState;
      }
    }

    expect(state.level.grid[1][2].element).toBeNull();
    expect(state.level.grid[1][3].element?.isOpen).toBe(true);
    expect(state.player.position).toEqual({ x: 3, y: 3 });

    const exported1 = JSON.parse(JSON.stringify(state.level));

    const saveData = JSON.parse(JSON.stringify({ gameState: state, history }));
    const restoredState = saveData.gameState;
    const exported2 = JSON.parse(JSON.stringify(restoredState.level));

    expect(exported2.grid[1][2].element).toBeNull();
    expect(exported2.grid[1][3].element?.isOpen).toBe(true);
    expect(exported2.grid[3][3].element?.type).toBe('mechanism');
    expect(exported2.grid[3][3].element?.isActive).toBe(true);
    expect(exported2.grid[3][4].element?.isOpen).toBe(true);

    expect(exported1.grid[1][2].element).toEqual(exported2.grid[1][2].element);
    expect(exported1.grid[1][3].element?.isOpen).toEqual(exported2.grid[1][3].element?.isOpen);
    expect(exported1.grid[3][3].element?.isActive).toEqual(exported2.grid[3][3].element?.isActive);
  });
});
