import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Level, ConflictResolution, ImportRecord } from '../types/game';
import type { ImportPackResult } from '../utils/export';
import { createEmptyGrid, generateId, setCell, cloneGrid } from '../game/grid';
import {
  createEditorHistory,
  addEditorSnapshot,
  canEditorUndo,
  canEditorRedo,
  editorUndo,
  editorRedo,
} from '../game/editor-history';
import {
  saveDraft,
  loadDraft,
  deleteDraft,
  loadAllDrafts,
  hasDraft,
  clearAllStorage,
  saveImportHistory,
  loadImportHistory,
  saveCustomLevels,
  loadCustomLevels,
} from '../utils/storage';
import { validateLevel } from '../game/rules';
import { useGameStore } from '../store/useGameStore';
import { importLevelPack } from '../utils/export';

class LocalStorageMock {
  private store: Record<string, string> = {};
  get length(): number {
    return Object.keys(this.store).length;
  }
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
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

class MockFileReader {
  result: string | null = null;
  onload: ((e: { target: { result: string | null } }) => void) | null = null;
  onerror: (() => void) | null = null;
  readAsText(_file: File): void {
    setTimeout(() => {
      if (this.onload) {
        this.result = 'mock-content';
        this.onload({ target: { result: this.result } });
      }
    }, 0);
  }
}
vi.stubGlobal('FileReader', MockFileReader);

beforeEach(() => {
  ls.clear();
});
afterEach(() => {
  ls.clear();
});

function makeLevel(opts: Partial<Level> = {}): Level {
  const width = opts.width ?? 8;
  const height = opts.height ?? 6;
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
    id: opts.id ?? 'test-level-' + generateId(),
    name: opts.name ?? '测试关卡',
    width,
    height,
    grid,
    startPos,
    endPos,
  };
}

function makePack(levels: Level[]) {
  return {
    name: 'test-pack',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    levels,
  };
}

function parsePackContent(json: string): Level[] {
  const pack = JSON.parse(json);
  if (pack.levels && Array.isArray(pack.levels)) {
    const validLevels: Level[] = [];
    for (const level of pack.levels) {
      try {
        const validation = validateLevel(level);
        if (validation.valid) {
          validLevels.push(level);
        }
      } catch {
        continue;
      }
    }
    if (validLevels.length > 0) return validLevels;
    throw new Error('关卡包中没有有效的关卡');
  }
  try {
    const validation = validateLevel(pack);
    if (validation.valid) return [pack];
    throw new Error(validation.message);
  } catch (e) {
    if (e instanceof Error && e.message.includes('关卡')) throw e;
    throw new Error('文件格式错误或解析失败');
  }
}

describe('导出后再导入验证', () => {
  it('导出关卡包 → JSON 解析导入，内容与原导出逐字段一致', () => {
    const lv1 = makeLevel({ id: 'exp-1', name: '导出测试1' });
    const lv2 = makeLevel({ id: 'exp-2', name: '导出测试2' });
    setCell(lv1.grid, { x: 3, y: 2 }, { type: 'key', color: 'red', id: generateId() });
    setCell(lv2.grid, { x: 4, y: 3 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });

    const pack = makePack([lv1, lv2]);
    const json = JSON.stringify(pack);

    const imported = parsePackContent(json);
    expect(imported.length).toBe(2);
    expect(imported[0].id).toBe('exp-1');
    expect(imported[0].name).toBe('导出测试1');
    expect(imported[0].grid[2][3].element?.type).toBe('key');
    expect(imported[0].grid[2][3].element?.color).toBe('red');
    expect(imported[1].id).toBe('exp-2');
    expect(imported[1].grid[3][4].element?.type).toBe('door');
    expect(imported[1].grid[3][4].element?.color).toBe('blue');
  });

  it('导出关卡包 → 重新导入到空库，customLevels 数量一致', () => {
    useGameStore.setState({
      customLevels: [],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });

    const lv1 = makeLevel({ id: 'fresh-1', name: '全新1' });
    const lv2 = makeLevel({ id: 'fresh-2', name: '全新2' });

    useGameStore.setState({
      pendingConflicts: [],
      pendingAllImportedLevels: [lv1, lv2],
      pendingImportFileName: 'fresh-pack.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(2);
    expect(result.skipped.length).toBe(0);
    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);
    expect(custom.find(l => l.id === 'fresh-1')).toBeTruthy();
    expect(custom.find(l => l.id === 'fresh-2')).toBeTruthy();
  });
});

describe('覆盖"新增+冲突"混合包', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [
        makeLevel({ id: 'exist-a', name: '已有A' }),
      ],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });
  });

  it('1 个冲突选覆盖 + 1 个新增，最终数量不重复', () => {
    const conflictLv = makeLevel({ id: 'exist-a', name: '已有A(改)' });
    setCell(conflictLv.grid, { x: 5, y: 4 }, { type: 'wall', id: generateId() });
    const newLv = makeLevel({ id: 'brand-new', name: '全新关卡' });
    setCell(newLv.grid, { x: 2, y: 3 }, { type: 'key', color: 'green', id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
      pendingImportFileName: 'mixed-pack.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'overwrite');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(2);
    expect(result.overwritten.length).toBe(1);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);
    const overwritten = custom.find(l => l.id === 'exist-a')!;
    expect(overwritten.name).toBe('已有A(改)');
    expect(overwritten.grid[4][5].element?.type).toBe('wall');

    const added = custom.find(l => l.id === 'brand-new')!;
    expect(added.grid[3][2].element?.type).toBe('key');
    expect(added.grid[3][2].element?.color).toBe('green');

    const idCounts = new Map<string, number>();
    for (const l of custom) {
      idCounts.set(l.id, (idCounts.get(l.id) || 0) + 1);
    }
    for (const [, count] of idCounts) {
      expect(count).toBe(1);
    }
  });

  it('冲突选另存副本 + 新增，列表无重复 ID', () => {
    const conflictLv = makeLevel({ id: 'exist-a', name: '已有A' });
    const newLv = makeLevel({ id: 'new-b', name: '全新B' });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
      pendingImportFileName: 'dup-pack.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'duplicate');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);
    expect(result.imported.length).toBe(2);
    expect(result.duplicated.length).toBe(1);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(3);
    const ids = custom.map(l => l.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('取消导入', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [makeLevel({ id: 'pre-exist', name: '已存在' })],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });
  });

  it('cancelPendingConflicts 后，原数据一丝不改，pending 全部清空', () => {
    const origSnapshot = JSON.stringify(useGameStore.getState().customLevels);
    const conflictLv = makeLevel({ id: 'pre-exist', name: '已存在' });
    const newLv = makeLevel({ id: 'should-not-import', name: '不应导入' });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'pre-exist', name: '已存在' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
      pendingImportFileName: 'cancel-test.json',
    });

    useGameStore.getState().cancelPendingConflicts();

    expect(useGameStore.getState().pendingConflicts.length).toBe(0);
    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);
    expect(useGameStore.getState().pendingImportFileName).toBe('');

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(1);
    expect(JSON.stringify(custom)).toBe(origSnapshot);
  });

  it('全部冲突选 cancel → 结果仅跳过，customLevels 不变', () => {
    const origSnapshot = JSON.stringify(useGameStore.getState().customLevels);
    const conflictLv = makeLevel({ id: 'pre-exist', name: '已存在' });
    const newLv = makeLevel({ id: 'will-be-added', name: '会被加' });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'pre-exist', name: '已存在' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
      pendingImportFileName: 'skip-test.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('pre-exist', 'cancel');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);
    expect(result.skipped.length).toBe(1);
    expect(result.imported.length).toBe(1);
    expect(result.imported[0].id).toBe('will-be-added');

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);
    const orig = JSON.parse(origSnapshot);
    expect(custom.find(l => l.id === 'pre-exist')!.name).toBe(orig[0].name);
  });
});

describe('格式错误文件', () => {
  it('非 JSON 内容 → JSON.parse 抛出语法错误', () => {
    expect(() => JSON.parse('this is not json at all')).toThrow(SyntaxError);
  });

  it('JSON 但不是关卡包也不是关卡 → parsePackContent 抛出格式错误', () => {
    expect(() => parsePackContent(JSON.stringify({ foo: 'bar' }))).toThrow();
  });

  it('关卡包中全部关卡无效 → parsePackContent 抛出无有效关卡', () => {
    const badLevel = { id: 'bad', name: '坏关卡' };
    const pack = makePack([badLevel as any]);
    expect(() => parsePackContent(JSON.stringify(pack))).toThrow('关卡包中没有有效的关卡');
  });

  it('关卡包中部分关卡无效，只返回有效关卡', () => {
    const validLevel = makeLevel({ id: 'valid-1', name: '有效关卡' });
    const badLevel = { id: 'bad', name: '坏关卡' };
    const pack = makePack([badLevel as any, validLevel]);

    const result = parsePackContent(JSON.stringify(pack));
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('valid-1');
  });

  it('importLevelPack 函数对非 JSON 内容会抛出文件格式错误', async () => {
    const mockReader = {
      result: null as string | null,
      onload: null as ((e: { target: { result: string | null } }) => void) | null,
      onerror: null as (() => void) | null,
      readAsText: function(this: any, _file: File) {
        this.result = 'not json';
        if (this.onload) this.onload({ target: { result: this.result } });
      },
    };
    vi.stubGlobal('FileReader', function() { return mockReader; });

    const file = new File(['bad'], 'bad.json', { type: 'application/json' });
    await expect(importLevelPack(file)).rejects.toThrow('文件格式错误或解析失败');

    vi.stubGlobal('FileReader', MockFileReader);
  });
});

describe('覆盖后列表数量不重复', () => {
  it('同一关卡包导入两次都选覆盖，customLevels 数量不变', () => {
    const existing = makeLevel({ id: 'dup-test', name: '原始' });
    useGameStore.setState({
      customLevels: [existing],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });

    const imported = makeLevel({ id: 'dup-test', name: '第一次覆盖' });
    setCell(imported.grid, { x: 3, y: 3 }, { type: 'wall', id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: imported, existingLevel: existing, conflictType: 'both' },
      ],
      pendingAllImportedLevels: [imported],
      pendingImportFileName: 'first.json',
    });

    const res1 = new Map<string, ConflictResolution>();
    res1.set('dup-test', 'overwrite');
    useGameStore.getState().resolveImportConflicts(res1);

    const afterFirst = useGameStore.getState().customLevels;
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0].name).toBe('第一次覆盖');

    const imported2 = makeLevel({ id: 'dup-test', name: '第二次覆盖' });
    setCell(imported2.grid, { x: 4, y: 4 }, { type: 'key', color: 'yellow', id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: imported2, existingLevel: afterFirst[0], conflictType: 'both' },
      ],
      pendingAllImportedLevels: [imported2],
      pendingImportFileName: 'second.json',
    });

    const res2 = new Map<string, ConflictResolution>();
    res2.set('dup-test', 'overwrite');
    useGameStore.getState().resolveImportConflicts(res2);

    const afterSecond = useGameStore.getState().customLevels;
    expect(afterSecond.length).toBe(1);
    expect(afterSecond[0].name).toBe('第二次覆盖');
    expect(afterSecond[0].grid[4][4].element?.type).toBe('key');
    expect(afterSecond[0].grid[4][4].element?.color).toBe('yellow');
  });
});

describe('导入记录持久化', () => {
  it('saveImportHistory → loadImportHistory，刷新后记录仍在（含 levelDetails）', () => {
    const records: ImportRecord[] = [
      {
        id: 'rec-1',
        fileName: 'pack-a.json',
        fileSize: 1024,
        fileHash: 'abcdef123456',
        timestamp: Date.now() - 1000,
        newCount: 3,
        overwrittenCount: 1,
        duplicatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failureReasons: [],
        levelDetails: [
          { levelId: 'a', levelName: '新增A', outcome: 'new', newLevelId: 'a', newLevelName: '新增A' },
          { levelId: 'b', levelName: '新增B', outcome: 'new', newLevelId: 'b', newLevelName: '新增B' },
          { levelId: 'c', levelName: '新增C', outcome: 'new', newLevelId: 'c', newLevelName: '新增C' },
          { levelId: 'd', levelName: '覆盖D', outcome: 'overwritten', conflictType: 'both', existingLevelId: 'd', existingLevelName: '旧D', newLevelId: 'd', newLevelName: '覆盖D' },
        ],
      },
      {
        id: 'rec-2',
        fileName: 'bad.json',
        fileSize: 12,
        fileHash: 'badhash',
        timestamp: Date.now(),
        newCount: 0,
        overwrittenCount: 0,
        duplicatedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        failureReasons: ['文件格式错误或解析失败'],
        levelDetails: [
          { levelId: '__file__', levelName: 'bad.json', outcome: 'failed', failureReason: '文件格式错误或解析失败' },
        ],
      },
    ];

    saveImportHistory(records);
    const loaded = loadImportHistory();
    expect(loaded.length).toBe(2);
    expect(loaded[0].fileName).toBe('pack-a.json');
    expect(loaded[0].newCount).toBe(3);
    expect(loaded[0].fileSize).toBe(1024);
    expect(loaded[0].fileHash).toBe('abcdef123456');
    expect(loaded[0].levelDetails.length).toBe(4);
    expect(loaded[0].levelDetails[0].outcome).toBe('new');
    expect(loaded[0].levelDetails[3].outcome).toBe('overwritten');
    expect(loaded[0].levelDetails[3].conflictType).toBe('both');
    expect(loaded[1].fileName).toBe('bad.json');
    expect(loaded[1].failedCount).toBe(1);
    expect(loaded[1].failureReasons[0]).toBe('文件格式错误或解析失败');
    expect(loaded[1].levelDetails[0].failureReason).toBe('文件格式错误或解析失败');

    ls.clear();
    ls.setItem('puzzle_import_history', JSON.stringify(loaded));
    const reloaded = loadImportHistory();
    expect(reloaded.length).toBe(2);
    expect(reloaded[0].fileName).toBe('pack-a.json');
    expect(reloaded[0].levelDetails.length).toBe(4);
  });

  it('importHistory 不影响 customLevels 数据', () => {
    const levels = [makeLevel({ id: 'keep-1', name: '保留' })];
    saveCustomLevels(levels);
    saveImportHistory([
      {
        id: 'rec-x',
        fileName: 'test.json',
        timestamp: Date.now(),
        newCount: 0,
        overwrittenCount: 0,
        duplicatedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        failureReasons: ['测试'],
        levelDetails: [],
      },
    ]);

    const loadedLevels = loadCustomLevels();
    expect(loadedLevels.length).toBe(1);
    expect(loadedLevels[0].id).toBe('keep-1');
  });

  it('resolveImportConflicts 自动写入 importHistory，包含完整 levelDetails', () => {
    useGameStore.setState({
      customLevels: [],
      pendingConflicts: [],
      pendingAllImportedLevels: [makeLevel({ id: 'hist-1', name: '历史测试' })],
      pendingImportFileName: 'history-pack.json',
      importHistory: [],
      allDraftIds: [],
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 2048, fileHash: 'testhash123' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const history = useGameStore.getState().importHistory;
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('history-pack.json');
    expect(history[0].fileSize).toBe(2048);
    expect(history[0].fileHash).toBe('testhash123');
    expect(history[0].newCount).toBe(1);
    expect(history[0].overwrittenCount).toBe(0);
    expect(history[0].duplicatedCount).toBe(0);
    expect(history[0].skippedCount).toBe(0);
    expect(history[0].failedCount).toBe(0);
    expect(history[0].failureReasons.length).toBe(0);
    expect(history[0].levelDetails.length).toBe(1);
    expect(history[0].levelDetails[0].outcome).toBe('new');
    expect(history[0].levelDetails[0].levelName).toBe('历史测试');
  });

  it('addImportRecord 追加记录并持久化（自动补 levelDetails）', () => {
    useGameStore.setState({ importHistory: [], allDraftIds: [] });

    useGameStore.getState().addImportRecord({
      id: 'manual-1',
      fileName: 'manual.json',
      timestamp: Date.now(),
      newCount: 2,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      levelDetails: [],
    });

    expect(useGameStore.getState().importHistory.length).toBe(1);
    const fromStorage = loadImportHistory();
    expect(fromStorage.length).toBe(1);
    expect(fromStorage[0].fileName).toBe('manual.json');
    expect(Array.isArray(fromStorage[0].levelDetails)).toBe(true);
  });

  it('clearImportHistory 清空所有记录', () => {
    useGameStore.setState({ importHistory: [], allDraftIds: [] });

    useGameStore.getState().addImportRecord({
      id: 'to-clear',
      fileName: 'clear.json',
      timestamp: Date.now(),
      newCount: 1,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      levelDetails: [],
    });

    expect(useGameStore.getState().importHistory.length).toBe(1);
    useGameStore.getState().clearImportHistory();
    expect(useGameStore.getState().importHistory.length).toBe(0);
    expect(loadImportHistory().length).toBe(0);
  });
});

describe('详细导入记录（levelDetails）', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [
        makeLevel({ id: 'exist-a', name: '已有A' }),
        makeLevel({ id: 'exist-b', name: '已有B' }),
      ],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });
  });

  it('混合包场景：新增+覆盖+另存副本+跳过 → 4 种 outcome 各一条明细', () => {
    const newLv = makeLevel({ id: 'brand-new', name: '全新关卡' });
    const overLv = makeLevel({ id: 'exist-a', name: '覆盖A' });
    const dupLv = makeLevel({ id: 'exist-b', name: '副本B原' });
    const skipLv = makeLevel({ id: 'skip-c', name: '已有B' });

    useGameStore.setState({
      customLevels: [
        makeLevel({ id: 'exist-a', name: '已有A' }),
        makeLevel({ id: 'exist-b', name: '已有B原' }),
      ],
      pendingConflicts: [
        { incomingLevel: overLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'both' },
        { incomingLevel: dupLv, existingLevel: makeLevel({ id: 'exist-b', name: '已有B原' }), conflictType: 'id' },
        { incomingLevel: skipLv, existingLevel: makeLevel({ id: 'exist-b', name: '已有B原' }), conflictType: 'name' },
      ],
      pendingAllImportedLevels: [newLv, overLv, dupLv, skipLv],
      pendingImportFileName: 'mixed-4ways.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 4096, fileHash: 'mixedhash4' };

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'overwrite');
    resolutions.set('exist-b', 'duplicate');
    resolutions.set('skip-c', 'cancel');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(3);
    expect(result.overwritten.length).toBe(1);
    expect(result.duplicated.length).toBe(1);
    expect(result.skipped.length).toBe(1);

    const details = useGameStore.getState().importHistory[0].levelDetails;
    expect(details.length).toBe(4);

    const outcomes = new Set(details.map(d => d.outcome));
    expect(outcomes.has('new')).toBe(true);
    expect(outcomes.has('overwritten')).toBe(true);
    expect(outcomes.has('duplicated')).toBe(true);
    expect(outcomes.has('skipped')).toBe(true);

    const skipDetail = details.find(d => d.outcome === 'skipped')!;
    expect(skipDetail.conflictType).toBe('name');
    expect(skipDetail.existingLevelName).toBe('已有B原');

    const dupDetail = details.find(d => d.outcome === 'duplicated')!;
    expect(dupDetail.conflictType).toBe('id');
    expect(dupDetail.newLevelName).toContain('副本');
    expect(dupDetail.newLevelId).not.toBe('exist-b');
  });

  it('三种 outcome 明细：新增、覆盖、另存副本，字段齐全', () => {
    const newLv = makeLevel({ id: 'brand-new', name: '全新关卡' });
    const overLv = makeLevel({ id: 'exist-a', name: '覆盖A' });
    const dupLv = makeLevel({ id: 'exist-b', name: '副本B' });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: overLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'id' },
        { incomingLevel: dupLv, existingLevel: makeLevel({ id: 'exist-b', name: '已有B' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [newLv, overLv, dupLv],
      pendingImportFileName: 'details-test.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'overwrite');
    resolutions.set('exist-b', 'duplicate');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(3);
    expect(result.overwritten.length).toBe(1);
    expect(result.duplicated.length).toBe(1);

    const history = useGameStore.getState().importHistory;
    expect(history.length).toBe(1);
    const details = history[0].levelDetails;
    expect(details.length).toBe(3);

    const newDetail = details.find(d => d.outcome === 'new')!;
    expect(newDetail).toBeTruthy();
    expect(newDetail.levelName).toBe('全新关卡');
    expect(newDetail.newLevelId).toBe('brand-new');

    const overDetail = details.find(d => d.outcome === 'overwritten')!;
    expect(overDetail).toBeTruthy();
    expect(overDetail.existingLevelId).toBe('exist-a');
    expect(overDetail.existingLevelName).toBe('已有A');
    expect(overDetail.conflictType).toBe('id');
    expect(overDetail.newLevelName).toBe('覆盖A');

    const dupDetail = details.find(d => d.outcome === 'duplicated')!;
    expect(dupDetail).toBeTruthy();
    expect(dupDetail.conflictType).toBe('both');
    expect(dupDetail.newLevelName).toContain('副本');
    expect(dupDetail.newLevelId).not.toBe('exist-b');
  });

  it('跳过的冲突：outcome=skipped，记录冲突类型和原有关卡信息', () => {
    const skipLv = makeLevel({ id: 'exist-a', name: '跳过A' });
    const newLv = makeLevel({ id: 'new-x', name: '新增X' });

    useGameStore.setState({
      customLevels: [makeLevel({ id: 'exist-a', name: '已有A' })],
      pendingConflicts: [
        { incomingLevel: skipLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'name' },
      ],
      pendingAllImportedLevels: [newLv, skipLv],
      pendingImportFileName: 'skip-test.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'cancel');

    useGameStore.getState().resolveImportConflicts(resolutions);

    const details = useGameStore.getState().importHistory[0].levelDetails;
    expect(details.length).toBe(2);

    const skipped = details.find(d => d.outcome === 'skipped')!;
    expect(skipped).toBeTruthy();
    expect(skipped.conflictType).toBe('name');
    expect(skipped.existingLevelName).toBe('已有A');

    const added = details.find(d => d.outcome === 'new')!;
    expect(added).toBeTruthy();
  });

  it('文件级失败记录：outcome=failed 带 failureReason', () => {
    const badRecord: ImportRecord = {
      id: 'fail-1',
      fileName: 'broken.json',
      fileSize: 42,
      fileHash: 'brokenhash',
      timestamp: Date.now(),
      newCount: 0,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      failureReasons: ['文件格式错误或解析失败'],
      levelDetails: [
        { levelId: '__file__', levelName: 'broken.json', outcome: 'failed', failureReason: '文件格式错误或解析失败' },
      ],
    };
    saveImportHistory([badRecord]);

    const loaded = loadImportHistory();
    expect(loaded.length).toBe(1);
    expect(loaded[0].failedCount).toBe(1);
    expect(loaded[0].levelDetails.length).toBe(1);
    expect(loaded[0].levelDetails[0].outcome).toBe('failed');
    expect(loaded[0].levelDetails[0].failureReason).toBe('文件格式错误或解析失败');
  });
});

describe('cancelPendingConflicts 清理完整性', () => {
  it('取消导入：pending 全部清空且 _pendingFileMeta 被清理', () => {
    useGameStore.setState({
      customLevels: [makeLevel({ id: 'pre', name: '预存' })],
      pendingConflicts: [{ incomingLevel: makeLevel({ id: 'pre' }), existingLevel: makeLevel({ id: 'pre' }), conflictType: 'both' }],
      pendingAllImportedLevels: [makeLevel({ id: 'pre' })],
      pendingImportFileName: 'cancel.json',
      importHistory: [],
      allDraftIds: [],
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 999, fileHash: 'cancelling' };

    useGameStore.getState().cancelPendingConflicts();

    expect(useGameStore.getState().pendingConflicts.length).toBe(0);
    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);
    expect(useGameStore.getState().pendingImportFileName).toBe('');
    expect((useGameStore.getState() as any)._pendingFileMeta).toBeNull();
    expect(useGameStore.getState().customLevels.length).toBe(1);
  });
});

describe('已有功能不受影响: 保存、撤销/重做、关卡游玩', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });
  });

  it('导入后保存关卡，草稿被清除，customLevels 正确', () => {
    const lv = makeLevel({ id: 'save-after-import', name: '导入后保存' });
    useGameStore.setState({
      currentLevel: lv,
      customLevels: [],
      editorState: { selectedTool: 'wall', selectedColor: 'red', gridWidth: lv.width, gridHeight: lv.height },
      editorHistory: createEditorHistory(lv, { selectedTool: 'wall', selectedColor: 'red', gridWidth: lv.width, gridHeight: lv.height }),
    });

    saveDraft(lv.id, lv, { selectedTool: 'wall', selectedColor: 'red', gridWidth: lv.width, gridHeight: lv.height }, createEditorHistory(lv, { selectedTool: 'wall', selectedColor: 'red', gridWidth: lv.width, gridHeight: lv.height }));
    expect(hasDraft(lv.id)).toBe(true);

    const result = useGameStore.getState().saveLevel('导入后保存');
    expect(result.success).toBe(true);
    expect(hasDraft(lv.id)).toBe(false);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(1);
    expect(custom[0].id).toBe('save-after-import');
  });

  it('编辑器撤销/重做在导入后仍然正常工作', () => {
    const base = makeLevel({ id: 'undo-after-import', name: '撤销测试' });
    const es = { selectedTool: 'wall' as const, selectedColor: 'red' as const, gridWidth: base.width, gridHeight: base.height };
    let eh = createEditorHistory(base, es);

    const g1 = cloneGrid(base.grid);
    setCell(g1, { x: 3, y: 3 }, { type: 'wall', id: generateId() });
    const lv1: Level = { ...base, grid: g1 };
    eh = addEditorSnapshot(eh, lv1, es);

    const g2 = cloneGrid(g1);
    setCell(g2, { x: 4, y: 3 }, { type: 'key', color: 'blue', id: generateId() });
    const lv2: Level = { ...base, grid: g2 };
    eh = addEditorSnapshot(eh, lv2, es);

    expect(canEditorUndo(eh)).toBe(true);

    const undoSnap = editorUndo(eh);
    expect(undoSnap).not.toBeNull();
    expect(undoSnap!.level.grid[3][4].element).toBeNull();
    expect(undoSnap!.level.grid[3][3].element?.type).toBe('wall');

    const eh2 = { ...eh, currentIndex: eh.currentIndex - 1 };
    const redoSnap = editorRedo(eh2);
    expect(redoSnap).not.toBeNull();
    expect(redoSnap!.level.grid[3][4].element?.type).toBe('key');
  });

  it('导入操作不影响关卡游玩验证', () => {
    const lv = makeLevel({ id: 'play-test', name: '游玩测试' });
    setCell(lv.grid, { x: 2, y: 1 }, { type: 'key', color: 'red', id: generateId() });
    setCell(lv.grid, { x: 3, y: 1 }, { type: 'door', color: 'red', isOpen: false, id: generateId() });

    expect(validateLevel(lv).valid).toBe(true);

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: [lv],
      pendingImportFileName: 'play-pack.json',
      pendingConflicts: [],
      allDraftIds: [],
    });

    const resolutions = new Map<string, ConflictResolution>();
    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(1);
    const imported = result.imported[0];
    expect(validateLevel(imported).valid).toBe(true);
    expect(imported.grid[1][2].element?.type).toBe('key');
    expect(imported.grid[1][3].element?.type).toBe('door');
  });

  it('导入记录不污染关卡数据存储', () => {
    const levels = [makeLevel({ id: 'clean-1', name: '干净关卡' })];
    saveCustomLevels(levels);

    useGameStore.getState().addImportRecord({
      id: 'pollute-test',
      fileName: 'pollute.json',
      timestamp: Date.now(),
      newCount: 5,
      overwrittenCount: 2,
      duplicatedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      levelDetails: [],
    });

    const reloaded = loadCustomLevels();
    expect(reloaded.length).toBe(1);
    expect(reloaded[0].id).toBe('clean-1');
    expect(reloaded[0].name).toBe('干净关卡');
  });
});

describe('新功能: 失败项预览与导入结果导出', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingFailedItems: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
      lastImportResult: null,
    });
  });

  it('importLevelPack 返回 ImportPackResult，包含 validLevels 和 failedItems', () => {
    const validLv = makeLevel({ id: 'valid-1', name: '有效关卡' });
    const invalidLv = { id: 'invalid-1', name: '无效关卡' };
    const pack = makePack([validLv, invalidLv as any]);
    const jsonStr = JSON.stringify(pack);

    const parsed = JSON.parse(jsonStr);
    expect(parsed.levels.length).toBe(2);

    const result: ImportPackResult = { validLevels: [], failedItems: [] };
    for (let i = 0; i < parsed.levels.length; i++) {
      const level = parsed.levels[i];
      const validation = validateLevel(level);
      if (validation.valid) {
        result.validLevels.push(level);
      } else {
        result.failedItems.push({
          levelData: level,
          levelName: level?.name || `关卡 ${i + 1}`,
          levelId: level?.id || `failed-${generateId()}`,
          reason: validation.message || '关卡验证失败',
        });
      }
    }

    expect(result.validLevels.length).toBe(1);
    expect(result.validLevels[0].id).toBe('valid-1');
    expect(result.failedItems.length).toBe(1);
    expect(result.failedItems[0].levelId).toBe('invalid-1');
    expect(result.failedItems[0].levelName).toBe('无效关卡');
    expect(result.failedItems[0].reason).toContain('缺少');
  });

  it('混合包（2有效+1失败）导入：预览显示失败项，确认后失败项记入历史', () => {
    const lv1 = makeLevel({ id: 'ok-1', name: '有效1' });
    const lv2 = makeLevel({ id: 'ok-2', name: '有效2' });
    const failedItem = {
      levelData: { id: 'bad', name: '坏关卡' },
      levelName: '坏关卡',
      levelId: 'bad',
      reason: '缺少必要字段',
    };

    useGameStore.setState({
      pendingAllImportedLevels: [lv1, lv2],
      pendingFailedItems: [failedItem],
      pendingImportFileName: 'mixed-valid-fail.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(2);
    expect(useGameStore.getState().pendingFailedItems.length).toBe(0);

    const history = useGameStore.getState().importHistory;
    expect(history.length).toBe(1);
    expect(history[0].failedCount).toBe(1);
    expect(history[0].failureReasons[0]).toBe('缺少必要字段');
    expect(history[0].levelDetails.length).toBe(3);

    const failedDetail = history[0].levelDetails.find(d => d.outcome === 'failed');
    expect(failedDetail).toBeTruthy();
    expect(failedDetail!.levelName).toBe('坏关卡');
    expect(failedDetail!.failureReason).toBe('缺少必要字段');
  });

  it('全部失败的关卡包：不进入预览，直接记入历史', () => {
    const failedDetails = [
      { levelId: 'bad-1', levelName: '坏1', outcome: 'failed' as const, failureReason: '缺少起点' },
      { levelId: 'bad-2', levelName: '坏2', outcome: 'failed' as const, failureReason: '缺少终点' },
    ];

    useGameStore.setState({
      pendingAllImportedLevels: [],
      pendingFailedItems: [],
    });

    const record: ImportRecord = {
      id: 'all-fail-1',
      fileName: 'all-bad.json',
      fileSize: 512,
      fileHash: 'badhash123',
      timestamp: Date.now(),
      newCount: 0,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 2,
      failureReasons: ['缺少起点', '缺少终点'],
      levelDetails: failedDetails,
    };

    useGameStore.getState().addImportRecord(record);

    const history = useGameStore.getState().importHistory;
    expect(history.length).toBe(1);
    expect(history[0].failedCount).toBe(2);
    expect(history[0].levelDetails.length).toBe(2);
    expect(history[0].levelDetails[0].outcome).toBe('failed');
    expect(history[0].levelDetails[1].failureReason).toBe('缺少终点');
  });

  it('resolveImportConflicts 正确合并 failedItems 到 levelDetails', () => {
    const newLv = makeLevel({ id: 'new-1', name: '新关卡' });
    const conflictLv = makeLevel({ id: 'exist-1', name: '已有' });
    const failedItems = [
      { levelData: {}, levelName: '坏关卡', levelId: 'bad-1', reason: '格式错误' },
    ];

    useGameStore.setState({
      customLevels: [makeLevel({ id: 'exist-1', name: '已有' })],
      pendingAllImportedLevels: [newLv, conflictLv],
      pendingFailedItems: failedItems,
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-1', name: '已有' }), conflictType: 'both' },
      ],
      pendingImportFileName: 'mixed-all.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 1024, fileHash: 'mixhash' };

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-1', 'overwrite');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(2);
    expect(result.overwritten.length).toBe(1);

    const history = useGameStore.getState().importHistory[0];
    expect(history.levelDetails.length).toBe(3);
    expect(history.failedCount).toBe(1);
    expect(history.newCount).toBe(1);
    expect(history.overwrittenCount).toBe(1);

    const outcomes = new Set(history.levelDetails.map(d => d.outcome));
    expect(outcomes.has('new')).toBe(true);
    expect(outcomes.has('overwritten')).toBe(true);
    expect(outcomes.has('failed')).toBe(true);
  });

  it('cancelPendingConflicts 清理 pendingFailedItems', () => {
    useGameStore.setState({
      pendingAllImportedLevels: [makeLevel({ id: 'temp' })],
      pendingFailedItems: [{ levelData: {}, levelName: '坏', levelId: 'bad', reason: '错' }],
      pendingConflicts: [],
      pendingImportFileName: 'cancel-me.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 123 };

    useGameStore.getState().cancelPendingConflicts();

    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);
    expect(useGameStore.getState().pendingFailedItems.length).toBe(0);
    expect(useGameStore.getState().pendingImportFileName).toBe('');
    expect((useGameStore.getState() as any)._pendingFileMeta).toBeNull();
  });

  it('reExportImportResult 能找到并导出导入的关卡', () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockCreateElement = vi.fn(() => ({
      href: '',
      download: '',
      click: mockClick,
    }));
    const mockCreateObjectURL = vi.fn(() => 'blob:test-url');
    const mockRevokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: mockCreateElement,
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const lv1 = makeLevel({ id: 'reexp-1', name: '重导出1' });
    const lv2 = makeLevel({ id: 'reexp-2', name: '重导出2' });
    setCell(lv1.grid, { x: 2, y: 2 }, { type: 'wall', id: generateId() });
    setCell(lv2.grid, { x: 3, y: 3 }, { type: 'key', color: 'red', id: generateId() });

    useGameStore.setState({
      customLevels: [lv1, lv2],
      importHistory: [],
    });

    useGameStore.setState({
      pendingAllImportedLevels: [lv1, lv2],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'reexport-test.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 2048, fileHash: 'reexp123' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const recordId = useGameStore.getState().importHistory[0].id;
    const result = useGameStore.getState().reExportImportResult(recordId);
    expect(result).toBe(true);
    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockAppendChild).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemoveChild).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();

    vi.stubGlobal('document', undefined as any);
    vi.stubGlobal('URL', undefined as any);
  });

  it('reExportImportResult 对不存在的记录返回 false', () => {
    const result = useGameStore.getState().reExportImportResult('non-existent-id');
    expect(result).toBe(false);
  });

  it('导出→再导入→再导出 完整链路验证', () => {
    const originalLv = makeLevel({ id: 'roundtrip-1', name: '往返测试' });
    setCell(originalLv.grid, { x: 4, y: 2 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });
    setCell(originalLv.grid, { x: 3, y: 2 }, { type: 'key', color: 'blue', id: generateId() });

    const pack = makePack([originalLv]);
    const exportedJson = JSON.stringify(pack);

    const parsed = parsePackContent(exportedJson);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('roundtrip-1');
    expect(parsed[0].grid[2][3].element?.type).toBe('key');
    expect(parsed[0].grid[2][4].element?.type).toBe('door');

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: parsed,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'roundtrip.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: exportedJson.length, fileHash: 'roundtrip' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const imported = useGameStore.getState().customLevels[0];
    expect(imported.id).toBe('roundtrip-1');
    expect(imported.grid[2][3].element?.type).toBe('key');
    expect(imported.grid[2][4].element?.type).toBe('door');

    const repack = makePack([imported]);
    const reExportedJson = JSON.stringify(repack);
    const reparsed = parsePackContent(reExportedJson);
    expect(reparsed[0].grid[2][3].element?.type).toBe('key');
    expect(reparsed[0].grid[2][4].element?.type).toBe('door');
  });

  it('导入记录包含来源文件信息（文件名、大小、哈希）', () => {
    const lv = makeLevel({ id: 'meta-1', name: '元数据测试' });

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: [lv],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'meta-test.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = {
      fileSize: 4096,
      fileHash: 'abcdef1234567890',
    };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const record = useGameStore.getState().importHistory[0];
    expect(record.fileName).toBe('meta-test.json');
    expect(record.fileSize).toBe(4096);
    expect(record.fileHash).toBe('abcdef1234567890');
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('lastImportResult 指向最后一次导入结果', () => {
    expect(useGameStore.getState().lastImportResult).toBeNull();

    const lv = makeLevel({ id: 'last-1', name: '最后一次' });
    useGameStore.setState({
      pendingAllImportedLevels: [lv],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'last.json',
    });

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const last = useGameStore.getState().lastImportResult;
    expect(last).not.toBeNull();
    expect(last!.fileName).toBe('last.json');
    expect(last!.newCount).toBe(1);
  });

  it('clearImportHistory 同时清空 lastImportResult', () => {
    useGameStore.setState({
      lastImportResult: {
        id: 'temp',
        fileName: 'temp.json',
        timestamp: Date.now(),
        newCount: 1,
        overwrittenCount: 0,
        duplicatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failureReasons: [],
        levelDetails: [],
      },
    });

    expect(useGameStore.getState().lastImportResult).not.toBeNull();
    useGameStore.getState().clearImportHistory();
    expect(useGameStore.getState().lastImportResult).toBeNull();
  });
});

describe('新功能: 5种 outcome 完整预览（新增/覆盖/副本/跳过/失败）', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [
        makeLevel({ id: 'exist-a', name: '已有A' }),
        makeLevel({ id: 'exist-b', name: '已有B' }),
      ],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingFailedItems: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
      lastImportResult: null,
    });
  });

  it('5种 outcome 同时出现：新增+覆盖+副本+跳过+失败', () => {
    const newLv = makeLevel({ id: 'brand-new', name: '全新' });
    const overLv = makeLevel({ id: 'exist-a', name: '覆盖A' });
    const dupLv = makeLevel({ id: 'exist-b', name: '副本B原' });
    const skipLv = makeLevel({ id: 'skip-c', name: '已有B' });
    const failedItem = {
      levelData: { id: 'bad' },
      levelName: '坏关卡',
      levelId: 'bad-xyz',
      reason: '缺少起点和终点',
    };

    useGameStore.setState({
      pendingAllImportedLevels: [newLv, overLv, dupLv, skipLv],
      pendingFailedItems: [failedItem],
      pendingConflicts: [
        { incomingLevel: overLv, existingLevel: makeLevel({ id: 'exist-a', name: '已有A' }), conflictType: 'both' },
        { incomingLevel: dupLv, existingLevel: makeLevel({ id: 'exist-b', name: '已有B' }), conflictType: 'id' },
        { incomingLevel: skipLv, existingLevel: makeLevel({ id: 'exist-b', name: '已有B' }), conflictType: 'name' },
      ],
      pendingImportFileName: '5-outcomes.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 9999, fileHash: '5outcomes' };

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-a', 'overwrite');
    resolutions.set('exist-b', 'duplicate');
    resolutions.set('skip-c', 'cancel');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(3);
    expect(result.overwritten.length).toBe(1);
    expect(result.duplicated.length).toBe(1);
    expect(result.skipped.length).toBe(1);

    const history = useGameStore.getState().importHistory[0];
    expect(history.levelDetails.length).toBe(5);
    expect(history.newCount).toBe(1);
    expect(history.overwrittenCount).toBe(1);
    expect(history.duplicatedCount).toBe(1);
    expect(history.skippedCount).toBe(1);
    expect(history.failedCount).toBe(1);

    const outcomes = history.levelDetails.map(d => d.outcome).sort();
    expect(outcomes).toEqual(['duplicated', 'failed', 'new', 'overwritten', 'skipped']);

    const failed = history.levelDetails.find(d => d.outcome === 'failed')!;
    expect(failed.failureReason).toBe('缺少起点和终点');
    expect(failed.levelName).toBe('坏关卡');
  });
});
