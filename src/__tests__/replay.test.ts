import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  Level,
  GameState,
  Action,
  ReplayRecord,
  ReplayConflictResolution,
  ReplayImportRecord,
} from '../types/game';
import {
  createEmptyGrid,
  generateId,
  setCell,
  cloneGrid,
  cloneGameState,
} from '../game/grid';
import {
  buildReplayRecord,
  checkReplayCompatibility,
  computeLevelDigest,
  extractKeySteps,
  getReplayStateAtStep,
  validateReplayRecord,
  validateReplayPack,
  computeGridHash,
} from '../game/replay';
import { createInitialGameState, movePlayer } from '../game/engine';
import { createHistory, addAction, resetHistory } from '../game/history';
import {
  clearAllStorage,
  saveReplays,
  loadReplays,
  saveReplayImportHistory,
  loadReplayImportHistory,
} from '../utils/storage';
import {
  detectReplayConflicts,
} from '../utils/export';
import { useGameStore } from '../store/useGameStore';

class LocalStorageMock {
  private store: Record<string, string> = {};
  get length(): number {
    return Object.keys(this.store).length;
  }
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? this.store[key]
      : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}
const ls = new LocalStorageMock();
vi.stubGlobal('localStorage', ls);

beforeEach(() => {
  ls.clear();
});
afterEach(() => {
  ls.clear();
});

function makeLevel(opts: Partial<Level> = {}): Level {
  const width = opts.width ?? 6;
  const height = opts.height ?? 5;
  const grid = opts.grid ?? createEmptyGrid(width, height);
  const startPos = opts.startPos ?? { x: 1, y: 1 };
  const endPos = opts.endPos ?? { x: width - 2, y: height - 2 };
  if (!grid[startPos.y][startPos.x].element) {
    setCell(grid, startPos, { type: 'start', id: generateId() });
  }
  if (!grid[endPos.y][endPos.x].element) {
    setCell(grid, endPos, { type: 'end', id: generateId() });
  }
  return {
    id: opts.id ?? 'level-' + generateId(),
    name: opts.name ?? '测试关卡',
    width,
    height,
    grid,
    startPos,
    endPos,
  };
}

function makeAction(
  state: GameState,
  type: Action['type'] = 'move',
  direction?: 'up' | 'down' | 'left' | 'right',
  desc?: string,
): Action {
  return {
    id: 'act-' + generateId(),
    type,
    direction,
    position: { ...state.player.position },
    description: desc ?? (direction ? `向${direction}移动` : '操作'),
    timestamp: Date.now(),
    stateSnapshot: cloneGameState(state),
  };
}

function buildWinReplay(level: Level, extraSteps = 3): ReplayRecord {
  const initial = createInitialGameState(level);
  const history = resetHistory(createHistory(), initial);
  let currentState = cloneGameState(initial);
  let hist = { actions: history.actions, currentIndex: history.currentIndex };

  const moves: Array<'right' | 'down' | 'left' | 'up'> = ['right', 'down', 'right', 'down'];
  for (let i = 0; i < extraSteps; i++) {
    const dir = moves[i % moves.length];
    const r = movePlayer(currentState, dir);
    if (r.valid && r.newState) {
      hist = addAction(
        hist,
        r.actionType ?? 'move',
        r.newState.player.position,
        r.message,
        r.newState,
        dir,
      );
      currentState = cloneGameState(r.newState);
    }
  }

  const actions: Action[] = [
    makeAction(initial, 'move', undefined, '初始状态'),
    ...hist.actions.slice(1),
  ];

  const finalState: GameState = {
    ...currentState,
    isWin: true,
    message: '🎉 通关！',
  };
  actions[actions.length - 1] = {
    ...actions[actions.length - 1],
    stateSnapshot: finalState,
  };

  return buildReplayRecord(
    `通关回放-${level.name}`,
    level,
    initial,
    actions,
    finalState,
  );
}

describe('回放核心：数据结构与构建', () => {
  it('buildReplayRecord 应正确生成包含关卡摘要、关键步骤、步数、通关状态的完整记录', () => {
    const lv = makeLevel({ id: 'lv-build', name: '构建测试关' });
    const replay = buildWinReplay(lv);

    expect(replay.id).toBeTruthy();
    expect(replay.name).toContain('通关回放');
    expect(replay.levelId).toBe('lv-build');
    expect(replay.levelName).toBe('构建测试关');
    expect(replay.isWin).toBe(true);
    expect(typeof replay.steps).toBe('number');
    expect(replay.steps).toBeGreaterThan(0);
    expect(replay.createdAt).toBeGreaterThan(0);
    expect(replay.keySteps).toBeInstanceOf(Array);
    expect(replay.levelDigest.width).toBe(lv.width);
    expect(replay.levelDigest.height).toBe(lv.height);
    expect(replay.levelDigest.gridHash).toBe(computeGridHash(lv.grid));
    expect(replay.levelDigest.startPos).toEqual(lv.startPos);
    expect(replay.levelDigest.endPos).toEqual(lv.endPos);
    expect(replay.initialState).toBeTruthy();
    expect(replay.finalState).toBeTruthy();
    expect(replay.finalState?.isWin).toBe(true);
    expect(replay.actionHistory.length).toBeGreaterThan(1);
  });

  it('extractKeySteps 仅抽取非 move 动作；若无则回退到最后一步', () => {
    const lv = makeLevel();
    const initial = createInitialGameState(lv);
    const movesOnly: Action[] = [
      makeAction(initial, 'move', 'right', '右移'),
      makeAction(initial, 'move', 'down', '下移'),
      makeAction(initial, 'move', 'left', '左移'),
    ];
    expect(extractKeySteps(movesOnly)).toHaveLength(1);
    expect(extractKeySteps(movesOnly)[0].actionIndex).toBe(2);

    const withPickup: Action[] = [
      makeAction(initial, 'move', 'right', '右移'),
      makeAction(initial, 'pickup', undefined, '拾取钥匙'),
      makeAction(initial, 'move', 'down', '下移'),
      makeAction(initial, 'openDoor', undefined, '开门'),
    ];
    const ks = extractKeySteps(withPickup);
    expect(ks).toHaveLength(2);
    expect(ks.map(k => k.type)).toEqual(['pickup', 'openDoor']);
  });

  it('computeLevelDigest 对相同关卡内容应产生相同摘要', () => {
    const lv1 = makeLevel({ id: 'a', name: '关卡A' });
    const lv2 = makeLevel({ id: 'b', name: '关卡B', grid: cloneGrid(lv1.grid) });
    lv2.startPos = { ...lv1.startPos };
    lv2.endPos = { ...lv1.endPos };
    lv2.width = lv1.width;
    lv2.height = lv1.height;
    expect(computeLevelDigest(lv1)).toEqual(computeLevelDigest(lv2));
  });
});

describe('回放兼容性检查', () => {
  it('完全一致的关卡返回 compatible 状态', () => {
    const lv = makeLevel({ id: 'compat-1' });
    const replay = buildWinReplay(lv);
    const compat = checkReplayCompatibility(replay, lv);
    expect(compat.status).toBe('compatible');
    expect(compat.reason).toBeUndefined();
  });

  it('关卡 ID 不匹配返回 incompatible', () => {
    const lv = makeLevel({ id: 'orig-id' });
    const replay = buildWinReplay(lv);
    const lv2 = makeLevel({ id: 'diff-id' });
    const compat = checkReplayCompatibility(replay, lv2);
    expect(compat.status).toBe('incompatible');
    expect(compat.reason).toContain('ID');
  });

  it('关卡内容变化（墙壁新增）返回 view-only 并列出差异', () => {
    const lv = makeLevel({ id: 'edited-level' });
    const replay = buildWinReplay(lv);
    const edited = { ...lv, grid: cloneGrid(lv.grid) };
    setCell(edited.grid, { x: 2, y: 2 }, { type: 'wall', id: generateId() });
    const compat = checkReplayCompatibility(replay, edited);
    expect(compat.status).toBe('view-only');
    expect(compat.reason).toContain('编辑');
    expect(compat.differences?.length).toBeGreaterThan(0);
    expect(compat.differences?.some(d => d.includes('网格'))).toBe(true);
  });

  it('尺寸变化返回 view-only', () => {
    const lv = makeLevel({ id: 'resize-1', width: 6, height: 5 });
    const replay = buildWinReplay(lv);
    const resized: Level = { ...makeLevel({ id: 'resize-1', width: 8, height: 7 }), id: 'resize-1' };
    const compat = checkReplayCompatibility(replay, resized);
    expect(compat.status).toBe('view-only');
    expect(compat.differences?.some(d => d.includes('尺寸'))).toBe(true);
  });

  it('起点/终点变化返回 view-only', () => {
    const lv = makeLevel({ id: 'sp-ep' });
    const replay = buildWinReplay(lv);
    const moved = { ...lv, startPos: { x: 0, y: 0 } };
    expect(checkReplayCompatibility(replay, moved).status).toBe('view-only');

    const moved2 = { ...lv, endPos: { x: 1, y: 1 } };
    expect(checkReplayCompatibility(replay, moved2).status).toBe('view-only');
  });
});

describe('回放步骤状态获取', () => {
  it('getReplayStateAtStep 返回对应索引的深拷贝 GameState', () => {
    const lv = makeLevel({ id: 'step-test' });
    const replay = buildWinReplay(lv, 5);
    const s0 = getReplayStateAtStep(replay, 0);
    expect(s0).not.toBeNull();
    expect(s0?.turn).toBe(0);

    const lastIdx = replay.actionHistory.length - 1;
    const sLast = getReplayStateAtStep(replay, lastIdx);
    expect(sLast?.isWin).toBe(true);

    expect(getReplayStateAtStep(replay, -1)).toBeNull();
    expect(getReplayStateAtStep(replay, replay.actionHistory.length)).toBeNull();

    const stateFromRecord = replay.actionHistory[0].stateSnapshot;
    const fetched = getReplayStateAtStep(replay, 0);
    expect(fetched).not.toBe(stateFromRecord);
    fetched!.player.position.x = 999;
    expect(stateFromRecord.player.position.x).not.toBe(999);
  });
});

describe('回放记录持久化（跨重启恢复）', () => {
  it('saveReplays → loadReplays 往返数据不丢失', () => {
    const lv = makeLevel({ id: 'persist-1' });
    const r1 = buildWinReplay(lv);
    const r2 = buildWinReplay(makeLevel({ id: 'persist-2' }));
    saveReplays([r1, r2]);

    const loaded = loadReplays();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(r1.id);
    expect(loaded[0].name).toBe(r1.name);
    expect(loaded[0].actionHistory.length).toBe(r1.actionHistory.length);
    expect(loaded[1].id).toBe(r2.id);

    const importRec: ReplayImportRecord = {
      id: 'rec-1',
      fileName: 'pack.json',
      fileSize: 1024,
      timestamp: Date.now(),
      newCount: 2,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      replayDetails: [],
    };
    saveReplayImportHistory([importRec]);
    const historyLoaded = loadReplayImportHistory();
    expect(historyLoaded).toHaveLength(1);
    expect(historyLoaded[0].fileName).toBe('pack.json');
  });

  it('clearAllStorage 清空所有回放相关数据', () => {
    saveReplays([buildWinReplay(makeLevel())]);
    saveReplayImportHistory([{
      id: 'x', fileName: 'f.json', timestamp: Date.now(),
      newCount: 0, overwrittenCount: 0, duplicatedCount: 0,
      skippedCount: 0, failedCount: 0, failureReasons: [], replayDetails: [],
    }]);
    expect(loadReplays().length).toBeGreaterThan(0);
    clearAllStorage();
    expect(loadReplays()).toEqual([]);
    expect(loadReplayImportHistory()).toEqual([]);
  });
});

describe('回放记录验证（导入校验）', () => {
  it('validateReplayRecord 正确识别合法/非法记录', () => {
    const good = buildWinReplay(makeLevel());
    expect(validateReplayRecord(good).valid).toBe(true);

    const bad1 = { ...good, id: undefined } as unknown;
    expect(validateReplayRecord(bad1).valid).toBe(false);
    expect(validateReplayRecord(bad1).reason).toContain('id');

    const bad2 = { ...good, name: 123 } as unknown;
    expect(validateReplayRecord(bad2).valid).toBe(false);

    const bad3 = { ...good, actionHistory: [] };
    expect(validateReplayRecord(bad3).valid).toBe(false);
    expect(validateReplayRecord(bad3).reason).toContain('actionHistory');

    const bad4 = { ...good, levelDigest: null };
    expect(validateReplayRecord(bad4 as unknown).valid).toBe(false);
  });

  it('validateReplayPack 支持单条、数组、带 replays 字段三种格式', () => {
    const replay = buildWinReplay(makeLevel({ id: 'p1' }));
    const r1 = validateReplayPack(replay);
    expect(r1.replays).toHaveLength(1);

    const r2 = validateReplayPack([replay, { foo: 1 }]);
    expect(r2.replays).toHaveLength(1);
    expect(r2.failedItems).toHaveLength(1);

    const r3 = validateReplayPack({ replays: [replay] });
    expect(r3.replays).toHaveLength(1);

    const empty = validateReplayPack({ replays: [] });
    expect(empty.replays).toHaveLength(0);
    expect(empty.failedItems).toHaveLength(0);
  });

  it('坏 JSON 文件（非对象）返回失败项，不抛出异常', () => {
    const r = validateReplayPack('hello');
    expect(r.replays).toHaveLength(0);
    expect(r.failedItems.length).toBeGreaterThan(0);

    const r2 = validateReplayPack(null);
    expect(r2.failedItems.length).toBeGreaterThan(0);
  });
});

describe('回放冲突检测', () => {
  it('detectReplayConflicts 正确识别 ID 冲突、名称冲突、两者冲突', () => {
    const existing: ReplayRecord[] = [
      buildWinReplay(makeLevel({ id: 'l-1' })),
    ];
    existing[0].id = 'replay-id-A';
    existing[0].name = '我的回放';

    const byBoth = { ...buildWinReplay(makeLevel({ id: 'l-1' })) };
    byBoth.id = 'replay-id-A';
    byBoth.name = '我的回放';

    const byIdOnly = { ...buildWinReplay(makeLevel({ id: 'l-1' })) };
    byIdOnly.id = 'replay-id-A';
    byIdOnly.name = '别的名字';

    const byNameOnly = { ...buildWinReplay(makeLevel({ id: 'l-1' })) };
    byNameOnly.id = 'different-id';
    byNameOnly.name = '我的回放';

    const noConflict = { ...buildWinReplay(makeLevel({ id: 'l-1' })) };
    noConflict.id = 'fresh-id';
    noConflict.name = '全新回放';

    const incoming = [byBoth, byIdOnly, byNameOnly, noConflict];
    const conflicts = detectReplayConflicts(incoming, existing);

    expect(conflicts).toHaveLength(3);
    const both = conflicts.find(c => c.incomingReplay.id === 'replay-id-A' && c.incomingReplay.name === '我的回放');
    expect(both?.conflictType).toBe('both');
    const idOnly = conflicts.find(c => c.incomingReplay.id === 'replay-id-A' && c.incomingReplay.name === '别的名字');
    expect(idOnly?.conflictType).toBe('id');
    const nameOnly = conflicts.find(c => c.incomingReplay.id === 'different-id');
    expect(nameOnly?.conflictType).toBe('name');
  });
});

describe('回放导出再导入闭环', () => {
  it('导出 replay-pack 格式 → validateReplayPack → 导入结果一致', () => {
    const lv = makeLevel({ id: 'roundtrip' });
    const replay = buildWinReplay(lv);
    const pack = {
      exportType: 'replay-pack' as const,
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      name: 'test-pack',
      replays: [replay],
    };
    const verified = validateReplayPack(pack);
    expect(verified.replays).toHaveLength(1);
    expect(verified.failedItems).toHaveLength(0);
    expect(verified.replays[0].id).toBe(replay.id);
    expect(verified.replays[0].actionHistory.length).toBe(replay.actionHistory.length);
  });

  it('导入时 levelId 被校验：记录含 levelDigest 可用于事后核对', () => {
    const replay = buildWinReplay(makeLevel({ id: 'level-check' }));
    expect(replay.levelDigest).toBeTruthy();
    expect(typeof replay.levelDigest.gridHash).toBe('string');
    expect(replay.levelDigest.gridHash.length).toBeGreaterThan(0);
  });
});

describe('Store：回放保存、播放、取消回滚、套用、导入冲突解决', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('saveReplay 保存后 replays 数组、localStorage 均新增一条', () => {
    const s = useGameStore.getState();
    expect(s.replays).toHaveLength(0);
    const lv = makeLevel({ id: 'str-lv' });
    useGameStore.setState({ currentLevel: lv });
    const initial = createInitialGameState(lv);
    const actions: Action[] = [
      makeAction(initial, 'move', 'right', '初始'),
      makeAction({ ...initial, turn: 1 }, 'move', 'down', '第2步'),
    ];
    actions[1].stateSnapshot.isWin = true;
    useGameStore.setState({
      gameState: initial,
      actionHistory: actions,
      historyIndex: 1,
      mode: 'play',
    });

    const result = s.saveReplay('我的第一个回放');
    expect(result.success).toBe(true);
    expect(result.replay).toBeTruthy();
    expect(result.message).toContain('成功');
    expect(useGameStore.getState().replays).toHaveLength(1);
    const stored = loadReplays();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('我的第一个回放');
  });

  it('saveReplay 在编辑模式 / 行动不足时拒绝保存', () => {
    const s = useGameStore.getState();
    const lv = makeLevel();
    useGameStore.setState({ mode: 'edit', currentLevel: lv });
    expect(s.saveReplay('编辑模式').success).toBe(false);

    useGameStore.setState({
      mode: 'play',
      currentLevel: lv,
      actionHistory: [],
      historyIndex: -1,
    });
    expect(s.saveReplay('步骤太少').success).toBe(false);
  });

  it('startReplayPlayback 播放前生成快照 prePlaybackSnapshot；cancelReplayPlayback 回滚完全一致', () => {
    const lv = makeLevel({ id: 'cancel-test' });
    const replay = buildWinReplay(lv);
    saveReplays([replay]);
    const s0 = useGameStore.getInitialState();
    const baseState = cloneGameState(s0.gameState);
    baseState.turn = 42;
    baseState.player.inventory = ['red', 'blue'];
    useGameStore.setState({
      replays: [replay],
      currentLevel: lv,
      gameState: baseState,
      actionHistory: [makeAction(baseState)],
      historyIndex: 0,
    });

    const before = {
      gs: cloneGameState(useGameStore.getState().gameState),
      ah: useGameStore.getState().actionHistory.map(a => a.id),
      hi: useGameStore.getState().historyIndex,
      cl: useGameStore.getState().currentLevel.id,
    };

    const startRes = useGameStore.getState().startReplayPlayback(replay.id);
    expect(startRes.success).toBe(true);
    const ps = useGameStore.getState().playbackState;
    expect(ps.status).toBe('paused');
    expect(ps.replayId).toBe(replay.id);
    expect(ps.prePlaybackSnapshot).not.toBeNull();
    expect(useGameStore.getState().gameState.turn).not.toBe(42);

    useGameStore.getState().stepReplayForward();
    useGameStore.getState().stepReplayForward();
    expect(useGameStore.getState().playbackState.currentStep).toBe(2);

    useGameStore.getState().cancelReplayPlayback();
    const after = useGameStore.getState();
    expect(after.playbackState.status).toBe('idle');
    expect(after.playbackState.replayId).toBeNull();
    expect(after.gameState.turn).toBe(before.gs.turn);
    expect(after.gameState.player.inventory).toEqual(['red', 'blue']);
    expect(after.actionHistory.map(a => a.id)).toEqual(before.ah);
    expect(after.historyIndex).toBe(before.hi);
    expect(after.currentLevel.id).toBe(before.cl);
  });

  it('applyReplayToLevel 兼容情况下覆盖 gameState/actionHistory，view-only 情况下不套用', () => {
    const lv = makeLevel({ id: 'apply-test' });
    const replay = buildWinReplay(lv);
    saveReplays([replay]);
    useGameStore.setState({ replays: [replay], currentLevel: lv });
    const res = useGameStore.getState().applyReplayToLevel(replay.id);
    expect(res.success).toBe(true);
    expect(useGameStore.getState().gameState.isWin).toBe(true);

    const edited = { ...lv, grid: cloneGrid(lv.grid) };
    setCell(edited.grid, { x: 0, y: 0 }, { type: 'wall', id: generateId() });
    useGameStore.setState({ currentLevel: edited });
    const res2 = useGameStore.getState().applyReplayToLevel(replay.id);
    expect(res2.success).toBe(false);
    expect(res2.message).toContain('编辑');
  });

  it('回放进行中 move / undo / redo / resetLevel / saveGame 被拦截', () => {
    const lv = makeLevel({ id: 'isolate' });
    const replay = buildWinReplay(lv);
    saveReplays([replay]);
    useGameStore.setState({
      replays: [replay],
      currentLevel: lv,
      mode: 'play',
      gameState: createInitialGameState(lv),
      actionHistory: [],
      historyIndex: -1,
    });
    useGameStore.getState().startReplayPlayback(replay.id);
    expect(useGameStore.getState().playbackState.status).toBe('paused');

    useGameStore.getState().move('right');
    expect(useGameStore.getState().messageType).toBe('error');
    expect(useGameStore.getState().message).toContain('回放进行中');

    useGameStore.getState().undo();
    expect(useGameStore.getState().message).toContain('回放进行中');

    useGameStore.getState().redo();
    expect(useGameStore.getState().message).toContain('回放进行中');

    useGameStore.getState().resetLevel();
    expect(useGameStore.getState().message).toContain('回放进行中');

    useGameStore.getState().saveGame('试保存');
    expect(useGameStore.getState().message).toContain('回放进行中');
    expect(useGameStore.getState().savedGames).toHaveLength(0);

    expect(useGameStore.getState().playbackState.status).not.toBe('idle');
  });

  it('回放播放控件：step forward/backward/jump/pause/resume/finish 正确更新进度', () => {
    const lv = makeLevel({ id: 'controls' });
    const replay = buildWinReplay(lv, 5);
    saveReplays([replay]);
    useGameStore.setState({ replays: [replay], currentLevel: lv });
    useGameStore.getState().startReplayPlayback(replay.id);

    useGameStore.getState().resumeReplay();
    expect(useGameStore.getState().playbackState.status).toBe('playing');

    useGameStore.getState().pauseReplay();
    expect(useGameStore.getState().playbackState.status).toBe('paused');

    useGameStore.getState().stepReplayForward();
    useGameStore.getState().stepReplayForward();
    expect(useGameStore.getState().playbackState.currentStep).toBe(2);

    useGameStore.getState().stepReplayBackward();
    expect(useGameStore.getState().playbackState.currentStep).toBe(1);

    useGameStore.getState().jumpToReplayStep(4);
    expect(useGameStore.getState().playbackState.currentStep).toBe(4);

    useGameStore.getState().setReplaySpeed(2.5);
    expect(useGameStore.getState().playbackState.speed).toBe(2.5);
    useGameStore.getState().setReplaySpeed(10);
    expect(useGameStore.getState().playbackState.speed).toBe(4);
    useGameStore.getState().setReplaySpeed(0.1);
    expect(useGameStore.getState().playbackState.speed).toBe(0.25);
  });

  it('回放过滤器：setReplayFilter 只影响列表筛选，不改变底层数据', () => {
    const lvA = makeLevel({ id: 'lv-a' });
    const lvB = makeLevel({ id: 'lv-b' });
    const rA = buildWinReplay(lvA);
    const rB = buildWinReplay(lvB);
    saveReplays([rA, rB]);
    useGameStore.setState({ replays: [rA, rB] });
    useGameStore.getState().setReplayFilter('lv-a');
    expect(useGameStore.getState().replayFilter).toBe('lv-a');
    expect(useGameStore.getState().replays).toHaveLength(2);
    useGameStore.getState().setReplayFilter(null);
    expect(useGameStore.getState().replayFilter).toBeNull();
  });

  it('回放删除：删除正在播放的回放会先取消播放', () => {
    const lv = makeLevel({ id: 'del-lv' });
    const replay = buildWinReplay(lv);
    saveReplays([replay]);
    useGameStore.setState({ replays: [replay], currentLevel: lv });
    useGameStore.getState().startReplayPlayback(replay.id);
    expect(useGameStore.getState().playbackState.replayId).toBe(replay.id);
    useGameStore.getState().deleteReplay(replay.id);
    expect(useGameStore.getState().replays).toHaveLength(0);
    expect(useGameStore.getState().playbackState.replayId).toBeNull();
    expect(loadReplays()).toHaveLength(0);
  });

  it('resolveReplayImportConflicts 四种 outcome（new/overwrite/duplicate/skip/failed）正确写入历史与存储', () => {
    const lv = makeLevel({ id: 'conflict-lv' });
    const existing = buildWinReplay(lv);
    existing.id = 'replay-A';
    existing.name = '既存回放';
    saveReplays([existing]);

    const newReplay = buildWinReplay(makeLevel({ id: 'new-lv' }));
    newReplay.id = 'fresh-X';
    newReplay.name = '全新回放';

    const byBoth = buildWinReplay(lv);
    byBoth.id = 'replay-A';
    byBoth.name = '既存回放';
    const incomingLevel = lv;
    void incomingLevel;

    const byId = buildWinReplay(makeLevel({ id: 'id-only' }));
    byId.id = 'replay-X';
    byId.name = '名字不同';
    const existingSameId = buildWinReplay(makeLevel({ id: 'dummy' }));
    existingSameId.id = 'replay-X';
    existingSameId.name = '原来的名字';
    saveReplays([existing, existingSameId]);

    const failed = {
      replayData: { bad: 'yes' },
      replayName: '坏回放',
      replayId: 'fail-1',
      reason: '缺少 actionHistory',
    };

    useGameStore.setState({
      replays: [existing, existingSameId],
      pendingAllImportedReplays: [newReplay, byBoth, byId],
      pendingReplayConflicts: [
        { incomingReplay: byBoth, existingReplay: existing, conflictType: 'both' },
        { incomingReplay: byId, existingReplay: existingSameId, conflictType: 'id' },
      ],
      pendingReplayFailedItems: [failed],
      pendingReplayImportFileName: 'mixed-replays.json',
    });
    (useGameStore.getState() as any)._pendingReplayFileMeta = {
      fileSize: 999,
      fileHash: 'abc123',
      failedDetails: [],
    };

    const resolutions = new Map<string, ReplayConflictResolution>();
    resolutions.set('replay-A', 'overwrite');
    resolutions.set('replay-X', 'duplicate');
    const result = useGameStore.getState().resolveReplayImportConflicts(resolutions);

    expect(result.imported).toHaveLength(3);
    expect(result.overwritten).toHaveLength(1);
    expect(result.duplicated).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const all = useGameStore.getState().replays;
    expect(all.some(r => r.name === '全新回放')).toBe(true);
    expect(all.some(r => r.id === 'replay-A' && r.name === '既存回放')).toBe(true);
    const dup = all.find(r =>
      r.id !== 'replay-A' &&
      r.id !== 'replay-X' &&
      r.id !== 'fresh-X' &&
      r.name.includes('副本'),
    );
    expect(dup).toBeTruthy();
    expect(dup!.name).toContain('副本');
    expect(dup!.name).toContain('名字不同');

    const hist = loadReplayImportHistory();
    expect(hist).toHaveLength(1);
    const rec = hist[0];
    expect(rec.fileName).toBe('mixed-replays.json');
    expect(rec.fileSize).toBe(999);
    expect(rec.fileHash).toBe('abc123');
    expect(rec.newCount).toBe(1);
    expect(rec.overwrittenCount).toBe(1);
    expect(rec.duplicatedCount).toBe(1);
    expect(rec.failedCount).toBe(1);
    expect(rec.replayDetails.length).toBe(4);
    const outcomes = new Set(rec.replayDetails.map(d => d.outcome));
    expect(outcomes).toContain('new');
    expect(outcomes).toContain('overwritten');
    expect(outcomes).toContain('duplicated');
    expect(outcomes).toContain('failed');
  });

  it('cancelPendingReplayConflicts 清空 pending 状态，不修改已存在 replays', () => {
    const existing = buildWinReplay(makeLevel({ id: 'lv' }));
    saveReplays([existing]);
    useGameStore.setState({
      replays: [existing],
      pendingAllImportedReplays: [buildWinReplay(makeLevel({ id: 'other' }))],
      pendingReplayConflicts: [],
      pendingReplayFailedItems: [],
      pendingReplayImportFileName: 'canceltest.json',
    });
    (useGameStore.getState() as any)._pendingReplayFileMeta = { fileSize: 1 };
    useGameStore.getState().cancelPendingReplayConflicts();
    expect(useGameStore.getState().pendingAllImportedReplays).toEqual([]);
    expect(useGameStore.getState().pendingReplayImportFileName).toBe('');
    expect((useGameStore.getState() as any)._pendingReplayFileMeta).toBeNull();
    expect(useGameStore.getState().replays).toHaveLength(1);
  });
});
