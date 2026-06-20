import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Level, ConflictResolution, ImportRecord, ImportLevelDetail } from '../types/game';
import type { ImportPackResult } from '../utils/export';
import { createEmptyGrid, generateId, setCell, cloneGrid } from '../game/grid';
import {
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

function buildExportResultJson(
  levels: Level[],
  record: { fileName: string; timestamp: number; levelDetails: ImportLevelDetail[] },
): object {
  return {
    name: `imported-from-${record.fileName.replace('.json', '')}`,
    version: '1.0',
    exportedAt: new Date().toISOString(),
    importedFrom: record.fileName,
    importedAt: record.timestamp,
    importDetails: record.levelDetails,
    levels,
  };
}

function buildExportRecordJson(
  record: {
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
  },
  levels: Level[],
): object {
  return {
    exportType: 'import-result',
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    originalImport: {
      fileName: record.fileName,
      fileSize: record.fileSize,
      fileHash: record.fileHash,
      timestamp: record.timestamp,
    },
    summary: {
      newCount: record.newCount,
      overwrittenCount: record.overwrittenCount,
      duplicatedCount: record.duplicatedCount,
      skippedCount: record.skippedCount,
      failedCount: record.failedCount,
    },
    failureReasons: record.failureReasons,
    levelDetails: record.levelDetails,
    levels,
  };
}

interface ImportResultExpectation {
  importedFrom: string;
  importDetails: Array<{ levelId: string; outcome: string; levelName?: string }>;
  levels: Array<{ id: string; name: string }>;
}

function assertImportResultFields(actual: any, expected: ImportResultExpectation): void {
  expect(actual).not.toBeNull();
  expect(typeof actual).toBe('object');

  expect(actual).toHaveProperty('importedFrom');
  expect(typeof actual.importedFrom).toBe('string');
  expect(actual.importedFrom).toBe(expected.importedFrom);

  expect(actual).toHaveProperty('importDetails');
  expect(Array.isArray(actual.importDetails)).toBe(true);
  expect(actual.importDetails.length).toBe(expected.importDetails.length);
  for (let i = 0; i < expected.importDetails.length; i++) {
    const ad = actual.importDetails[i];
    const ed = expected.importDetails[i];
    expect(ad.levelId).toBe(ed.levelId);
    expect(ad.outcome).toBe(ed.outcome);
    if (ed.levelName !== undefined) {
      expect(ad.levelName).toBe(ed.levelName);
    }
  }

  expect(actual).toHaveProperty('levels');
  expect(Array.isArray(actual.levels)).toBe(true);
  expect(actual.levels.length).toBe(expected.levels.length);
  for (let i = 0; i < expected.levels.length; i++) {
    const al = actual.levels[i];
    const el = expected.levels[i];
    expect(al.id).toBe(el.id);
    expect(al.name).toBe(el.name);
  }
}

function assertRecordJsonKeyFields(actual: any, expected: {
  originalFileName: string;
  levelDetails: Array<{ levelId: string; outcome: string }>;
  levels: Array<{ id: string; name: string }>;
}): void {
  expect(actual).not.toBeNull();
  expect(actual.exportType).toBe('import-result');

  expect(actual).toHaveProperty('originalImport');
  expect(actual.originalImport.fileName).toBe(expected.originalFileName);

  expect(actual).toHaveProperty('levelDetails');
  expect(Array.isArray(actual.levelDetails)).toBe(true);
  expect(actual.levelDetails.length).toBe(expected.levelDetails.length);
  for (let i = 0; i < expected.levelDetails.length; i++) {
    expect(actual.levelDetails[i].levelId).toBe(expected.levelDetails[i].levelId);
    expect(actual.levelDetails[i].outcome).toBe(expected.levelDetails[i].outcome);
  }

  expect(actual).toHaveProperty('levels');
  expect(Array.isArray(actual.levels)).toBe(true);
  expect(actual.levels.length).toBe(expected.levels.length);
  for (let i = 0; i < expected.levels.length; i++) {
    expect(actual.levels[i].id).toBe(expected.levels[i].id);
    expect(actual.levels[i].name).toBe(expected.levels[i].name);
  }
}

function parsePackLevels(json: string): Level[] {
  const pack = JSON.parse(json);
  if (pack.levels && Array.isArray(pack.levels)) {
    const valid: Level[] = [];
    for (const level of pack.levels) {
      try {
        const v = validateLevel(level);
        if (v.valid) valid.push(level);
      } catch { continue; }
    }
    if (valid.length > 0) return valid;
    throw new Error('关卡包中没有有效的关卡');
  }
  const v = validateLevel(pack);
  if (v.valid) return [pack];
  throw new Error('文件格式错误或解析失败');
}

describe('导出结果 JSON 三字段契约：importedFrom / importDetails / levels', () => {
  it('exportImportResult 格式：importedFrom、importDetails、levels 三字段齐全', () => {
    const lv = makeLevel({ id: 'contract-1', name: '契约测试' });
    const details: ImportLevelDetail[] = [
      { levelId: 'contract-1', levelName: '契约测试', outcome: 'new', newLevelId: 'contract-1', newLevelName: '契约测试' },
    ];
    const record = { fileName: 'source-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);

    assertImportResultFields(parsed, {
      importedFrom: 'source-pack.json',
      importDetails: [{ levelId: 'contract-1', outcome: 'new', levelName: '契约测试' }],
      levels: [{ id: 'contract-1', name: '契约测试' }],
    });
  });

  it('importedFrom 值回指来源文件名，不丢失后缀', () => {
    const lv = makeLevel({ id: 'src-1', name: '来源' });
    const details: ImportLevelDetail[] = [
      { levelId: 'src-1', levelName: '来源', outcome: 'new', newLevelId: 'src-1', newLevelName: '来源' },
    ];
    const record = { fileName: 'my-levels-2024.json', timestamp: 1000, levelDetails: details };
    const exported = buildExportResultJson([lv], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    expect(parsed.importedFrom).toBe('my-levels-2024.json');
  });

  it('importDetails 每条明细含 levelId + outcome，可回溯到具体关卡和操作结果', () => {
    const lv1 = makeLevel({ id: 'dt-1', name: '明细1' });
    const lv2 = makeLevel({ id: 'dt-2', name: '明细2' });
    const details: ImportLevelDetail[] = [
      { levelId: 'dt-1', levelName: '明细1', outcome: 'new', newLevelId: 'dt-1', newLevelName: '明细1' },
      { levelId: 'dt-2', levelName: '明细2', outcome: 'overwritten', conflictType: 'both', existingLevelId: 'dt-2', existingLevelName: '旧明细2', newLevelId: 'dt-2', newLevelName: '明细2' },
    ];
    const record = { fileName: 'detail-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv1, lv2], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    expect(parsed.importDetails.length).toBe(2);
    expect(parsed.importDetails[0].levelId).toBe('dt-1');
    expect(parsed.importDetails[0].outcome).toBe('new');
    expect(parsed.importDetails[0].newLevelId).toBe('dt-1');
    expect(parsed.importDetails[1].levelId).toBe('dt-2');
    expect(parsed.importDetails[1].outcome).toBe('overwritten');
    expect(parsed.importDetails[1].conflictType).toBe('both');
    expect(parsed.importDetails[1].existingLevelId).toBe('dt-2');
    expect(parsed.importDetails[1].newLevelId).toBe('dt-2');
  });

  it('levels 数组保留完整关卡层级和数据（grid 元素完好）', () => {
    const lv = makeLevel({ id: 'grid-1', name: '网格测试' });
    setCell(lv.grid, { x: 3, y: 2 }, { type: 'key', color: 'red', id: generateId() });
    setCell(lv.grid, { x: 5, y: 4 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });

    const details: ImportLevelDetail[] = [
      { levelId: 'grid-1', levelName: '网格测试', outcome: 'new', newLevelId: 'grid-1', newLevelName: '网格测试' },
    ];
    const record = { fileName: 'grid-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    expect(parsed.levels.length).toBe(1);
    const parsedLv = parsed.levels[0];
    expect(validateLevel(parsedLv).valid).toBe(true);
    expect(parsedLv.grid[2][3].element.type).toBe('key');
    expect(parsedLv.grid[2][3].element.color).toBe('red');
    expect(parsedLv.grid[4][5].element.type).toBe('door');
    expect(parsedLv.grid[4][5].element.color).toBe('blue');
    expect(parsedLv.startPos).toEqual(lv.startPos);
    expect(parsedLv.endPos).toEqual(lv.endPos);
  });

  it('5 种 outcome 的 importDetails 结构完整：new / overwritten / duplicated / skipped / failed', () => {
    const details: ImportLevelDetail[] = [
      { levelId: 'a', levelName: '新', outcome: 'new', newLevelId: 'a', newLevelName: '新' },
      { levelId: 'b', levelName: '覆', outcome: 'overwritten', conflictType: 'both', existingLevelId: 'b', existingLevelName: '旧覆', newLevelId: 'b', newLevelName: '覆' },
      { levelId: 'c', levelName: '副', outcome: 'duplicated', conflictType: 'id', existingLevelId: 'c', existingLevelName: '旧副', newLevelId: 'c-dup', newLevelName: '副 (副本)' },
      { levelId: 'd', levelName: '跳', outcome: 'skipped', conflictType: 'name', existingLevelId: 'd', existingLevelName: '旧跳' },
      { levelId: 'e', levelName: '败', outcome: 'failed', failureReason: '缺少起点' },
    ];
    const record = { fileName: '5out.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    expect(parsed.importDetails.length).toBe(5);
    const outcomes = parsed.importDetails.map((d: ImportLevelDetail) => d.outcome).sort();
    expect(outcomes).toEqual(['duplicated', 'failed', 'new', 'overwritten', 'skipped']);
    expect(parsed.importDetails[4].failureReason).toBe('缺少起点');
    expect(parsed.importDetails[1].conflictType).toBe('both');
    expect(parsed.importDetails[2].newLevelId).not.toBe('c');
  });
});

describe('exportImportRecordAsJson 格式关键字段', () => {
  it('originalImport.fileName 等价于 importedFrom 语义，levelDetails 等价于 importDetails 语义', () => {
    const lv = makeLevel({ id: 'rec-1', name: '记录格式' });
    const details: ImportLevelDetail[] = [
      { levelId: 'rec-1', levelName: '记录格式', outcome: 'new', newLevelId: 'rec-1', newLevelName: '记录格式' },
    ];
    const record = {
      fileName: 'store-export.json',
      fileSize: 2048,
      fileHash: 'abc123',
      timestamp: Date.now(),
      newCount: 1,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      levelDetails: details,
    };
    const exported = buildExportRecordJson(record, [lv]);
    const parsed = JSON.parse(JSON.stringify(exported));

    assertRecordJsonKeyFields(parsed, {
      originalFileName: 'store-export.json',
      levelDetails: [{ levelId: 'rec-1', outcome: 'new' }],
      levels: [{ id: 'rec-1', name: '记录格式' }],
    });
  });

  it('summary 统计与 levelDetails 的 outcome 计数一致', () => {
    const lv = makeLevel({ id: 'sum-1', name: '统计1' });
    const details: ImportLevelDetail[] = [
      { levelId: 'sum-1', levelName: '统计1', outcome: 'new', newLevelId: 'sum-1', newLevelName: '统计1' },
      { levelId: 'sum-2', levelName: '统计2', outcome: 'overwritten', conflictType: 'both', existingLevelId: 'sum-2', existingLevelName: '旧', newLevelId: 'sum-2', newLevelName: '统计2' },
      { levelId: 'bad-1', levelName: '坏', outcome: 'failed', failureReason: '缺字段' },
    ];
    const record = {
      fileName: 'summary-test.json',
      fileSize: 1024,
      fileHash: 'hash1',
      timestamp: Date.now(),
      newCount: 1,
      overwrittenCount: 1,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      failureReasons: ['缺字段'],
      levelDetails: details,
    };
    const exported = buildExportRecordJson(record, [lv]);
    const parsed = JSON.parse(JSON.stringify(exported));

    expect(parsed.summary.newCount).toBe(1);
    expect(parsed.summary.overwrittenCount).toBe(1);
    expect(parsed.summary.failedCount).toBe(1);
    expect(parsed.levelDetails.filter((d: ImportLevelDetail) => d.outcome === 'new').length).toBe(1);
    expect(parsed.levelDetails.filter((d: ImportLevelDetail) => d.outcome === 'overwritten').length).toBe(1);
    expect(parsed.levelDetails.filter((d: ImportLevelDetail) => d.outcome === 'failed').length).toBe(1);
  });
});

describe('完整链路：导出结果文件 → 回导 → 历史摘要 → 再复用一次', () => {
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

  it('链路1：导出结果 JSON → 回导 → customLevels 与原始关卡一致', () => {
    const lv1 = makeLevel({ id: 'rt-1', name: '往返1' });
    const lv2 = makeLevel({ id: 'rt-2', name: '往返2' });
    setCell(lv1.grid, { x: 3, y: 2 }, { type: 'key', color: 'green', id: generateId() });
    setCell(lv2.grid, { x: 4, y: 3 }, { type: 'wall', id: generateId() });

    const details: ImportLevelDetail[] = [
      { levelId: 'rt-1', levelName: '往返1', outcome: 'new', newLevelId: 'rt-1', newLevelName: '往返1' },
      { levelId: 'rt-2', levelName: '往返2', outcome: 'new', newLevelId: 'rt-2', newLevelName: '往返2' },
    ];
    const record = { fileName: 'rt-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv1, lv2], record);

    const exportedJson = JSON.stringify(exported);
    const reimported = parsePackLevels(exportedJson);

    expect(reimported.length).toBe(2);
    expect(reimported[0].id).toBe('rt-1');
    expect(reimported[0].grid[2][3].element.type).toBe('key');
    expect(reimported[0].grid[2][3].element.color).toBe('green');
    expect(reimported[1].id).toBe('rt-2');
    expect(reimported[1].grid[3][4].element.type).toBe('wall');

    useGameStore.setState({
      pendingAllImportedLevels: reimported,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'rt-pack-reimport.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: exportedJson.length, fileHash: 'rthash1' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);
    expect(custom.find(l => l.id === 'rt-1')!.grid[2][3].element.type).toBe('key');
    expect(custom.find(l => l.id === 'rt-2')!.grid[3][4].element.type).toBe('wall');
  });

  it('链路2：回导后查看历史摘要，摘要与导出文件 importDetails 一致', () => {
    const lv = makeLevel({ id: 'hist-1', name: '历史核对' });
    const details: ImportLevelDetail[] = [
      { levelId: 'hist-1', levelName: '历史核对', outcome: 'new', newLevelId: 'hist-1', newLevelName: '历史核对' },
    ];
    const record = { fileName: 'hist-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);
    const exportedJson = JSON.stringify(exported);
    const parsed = JSON.parse(exportedJson);
    const reimported = parsePackLevels(exportedJson);

    useGameStore.setState({
      pendingAllImportedLevels: reimported,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'hist-pack-reimport.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: exportedJson.length, fileHash: 'histhash' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const history = useGameStore.getState().importHistory;
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('hist-pack-reimport.json');
    expect(history[0].newCount).toBe(1);
    expect(history[0].levelDetails.length).toBe(1);
    expect(history[0].levelDetails[0].outcome).toBe('new');
    expect(history[0].levelDetails[0].levelId).toBe('hist-1');
    expect(history[0].levelDetails[0].levelName).toBe('历史核对');

    expect(history[0].levelDetails[0].outcome).toBe(parsed.importDetails[0].outcome);
    expect(history[0].levelDetails[0].levelId).toBe(parsed.importDetails[0].levelId);
  });

  it('链路3：再复用一次——从回导后 store 再次导出→再导入，关卡数据不变', () => {
    const lv = makeLevel({ id: 'reuse-1', name: '复用测试' });
    setCell(lv.grid, { x: 2, y: 3 }, { type: 'mechanism', color: 'red', isActive: false, id: generateId() });

    useGameStore.setState({
      pendingAllImportedLevels: [lv],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'first-import.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 512, fileHash: 'firsthash' };

    const resolutions1 = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions1);

    const record1 = useGameStore.getState().importHistory[0];
    const customAfterFirst = useGameStore.getState().customLevels;
    const levelIds1 = record1.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToReExport1 = customAfterFirst.filter(l => levelIds1.includes(l.id));

    const reExported1 = buildExportRecordJson(record1, levelsToReExport1);
    const reExportedJson1 = JSON.stringify(reExported1);
    const reimported1 = parsePackLevels(reExportedJson1);

    expect(reimported1.length).toBe(1);
    expect(reimported1[0].id).toBe('reuse-1');
    expect(reimported1[0].grid[3][2].element.type).toBe('mechanism');
    expect(reimported1[0].grid[3][2].element.color).toBe('red');

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: reimported1,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'second-import.json',
      importHistory: [],
      lastImportResult: null,
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: reExportedJson1.length, fileHash: 'secondhash' };

    const resolutions2 = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions2);

    const customAfterSecond = useGameStore.getState().customLevels;
    expect(customAfterSecond.length).toBe(1);
    expect(customAfterSecond[0].id).toBe('reuse-1');
    expect(customAfterSecond[0].name).toBe('复用测试');
    expect(customAfterSecond[0].grid[3][2].element.type).toBe('mechanism');
    expect(customAfterSecond[0].grid[3][2].element.color).toBe('red');

    const record2 = useGameStore.getState().importHistory[0];
    const levelIds2 = record2.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToReExport2 = customAfterSecond.filter(l => levelIds2.includes(l.id));

    const reExported2 = buildExportRecordJson(record2, levelsToReExport2);
    const reparsed2 = JSON.parse(JSON.stringify(reExported2));

    expect(reparsed2.levels[0].id).toBe('reuse-1');
    expect(reparsed2.levels[0].grid[3][2].element.type).toBe('mechanism');
    expect(reparsed2.levels[0].grid[3][2].element.color).toBe('red');
  });
});

describe('README J 节验收自动化：importedFrom / importDetails / levels 三字段断言', () => {
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

  it('5 种 outcome 混合导入后导出结果文件，importedFrom / importDetails / levels 三字段完整', () => {
    const newLv = makeLevel({ id: 'j-new', name: '全新关卡' });
    const overLv = makeLevel({ id: 'exist-a', name: '覆盖A' });
    const dupLv = makeLevel({ id: 'exist-b', name: '副本B原' });
    const skipLv = makeLevel({ id: 'j-skip', name: '已有B' });
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
    resolutions.set('j-skip', 'cancel');
    useGameStore.getState().resolveImportConflicts(resolutions);

    const record = useGameStore.getState().importHistory[0];
    const custom = useGameStore.getState().customLevels;
    const levelIds = record.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToExport = custom.filter(l => levelIds.includes(l.id));

    const exported = buildExportResultJson(levelsToExport, record);
    const parsed = JSON.parse(JSON.stringify(exported));

    assertImportResultFields(parsed, {
      importedFrom: '5-outcomes.json',
      importDetails: [
        { levelId: 'j-new', outcome: 'new', levelName: '全新关卡' },
        { levelId: 'exist-a', outcome: 'overwritten', levelName: '覆盖A' },
        { levelId: 'exist-b', outcome: 'duplicated', levelName: '副本B原' },
        { levelId: 'j-skip', outcome: 'skipped', levelName: '已有B' },
        { levelId: 'bad-xyz', outcome: 'failed', levelName: '坏关卡' },
      ],
      levels: levelsToExport.map(l => ({ id: l.id, name: l.name })),
    });
  });

  it('导出结果文件回导后关卡可游玩验证', () => {
    const lv = makeLevel({ id: 'j-play', name: '可游玩' });
    setCell(lv.grid, { x: 2, y: 1 }, { type: 'key', color: 'red', id: generateId() });
    setCell(lv.grid, { x: 3, y: 1 }, { type: 'door', color: 'red', isOpen: false, id: generateId() });

    const details: ImportLevelDetail[] = [
      { levelId: 'j-play', levelName: '可游玩', outcome: 'new', newLevelId: 'j-play', newLevelName: '可游玩' },
    ];
    const record = { fileName: 'playable.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);

    const reimported = parsePackLevels(JSON.stringify(exported));
    expect(reimported.length).toBe(1);
    expect(validateLevel(reimported[0]).valid).toBe(true);
    expect(reimported[0].grid[1][2].element.type).toBe('key');
    expect(reimported[0].grid[1][3].element.type).toBe('door');
  });

  it('再次导出的结果文件与首次导出的关卡数据部分完全一致', () => {
    const lv = makeLevel({ id: 'j-diff', name: '对比测试' });
    setCell(lv.grid, { x: 4, y: 2 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });
    setCell(lv.grid, { x: 3, y: 2 }, { type: 'key', color: 'blue', id: generateId() });

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: [lv],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'diff-pack.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 1024, fileHash: 'diffhash' };

    const resolutions1 = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions1);

    const record1 = useGameStore.getState().importHistory[0];
    const custom1 = useGameStore.getState().customLevels;
    const levelIds1 = record1.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToExport1 = custom1.filter(l => levelIds1.includes(l.id));

    const firstExport = buildExportResultJson(levelsToExport1, record1);
    const firstParsed = JSON.parse(JSON.stringify(firstExport));

    const reimported = parsePackLevels(JSON.stringify(firstExport));

    useGameStore.setState({
      customLevels: [],
      pendingAllImportedLevels: reimported,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'diff-pack-2nd.json',
      importHistory: [],
      lastImportResult: null,
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 2048, fileHash: 'diffhash2' };

    const resolutions2 = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions2);

    const record2 = useGameStore.getState().importHistory[0];
    const custom2 = useGameStore.getState().customLevels;
    const levelIds2 = record2.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToExport2 = custom2.filter(l => levelIds2.includes(l.id));

    const secondExport = buildExportResultJson(levelsToExport2, record2);
    const secondParsed = JSON.parse(JSON.stringify(secondExport));

    expect(firstParsed.levels.length).toBe(secondParsed.levels.length);
    for (let i = 0; i < firstParsed.levels.length; i++) {
      expect(secondParsed.levels[i].id).toBe(firstParsed.levels[i].id);
      expect(secondParsed.levels[i].name).toBe(firstParsed.levels[i].name);
      expect(secondParsed.levels[i].width).toBe(firstParsed.levels[i].width);
      expect(secondParsed.levels[i].height).toBe(firstParsed.levels[i].height);
      expect(JSON.stringify(secondParsed.levels[i].grid)).toBe(JSON.stringify(firstParsed.levels[i].grid));
      expect(secondParsed.levels[i].startPos).toEqual(firstParsed.levels[i].startPos);
      expect(secondParsed.levels[i].endPos).toEqual(firstParsed.levels[i].endPos);
    }
  });
});

describe('导出结果文件可被 importLevelPack 原样回导', () => {
  it('exportImportResult 格式：levels 数组被 importLevelPack 正确识别', async () => {
    const lv = makeLevel({ id: 'imp-1', name: '导入识别' });
    const details: ImportLevelDetail[] = [
      { levelId: 'imp-1', levelName: '导入识别', outcome: 'new', newLevelId: 'imp-1', newLevelName: '导入识别' },
    ];
    const record = { fileName: 'imp-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);

    const jsonStr = JSON.stringify(exported);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.levels).toBeDefined();
    expect(Array.isArray(parsed.levels)).toBe(true);
    expect(parsed.levels.length).toBe(1);
    expect(validateLevel(parsed.levels[0]).valid).toBe(true);

    const reimported = parsePackLevels(jsonStr);
    expect(reimported.length).toBe(1);
    expect(reimported[0].id).toBe('imp-1');
  });

  it('exportImportRecordAsJson 格式：levels 数组被 importLevelPack 正确识别', () => {
    const lv = makeLevel({ id: 'rec-imp-1', name: '记录导入识别' });
    const details: ImportLevelDetail[] = [
      { levelId: 'rec-imp-1', levelName: '记录导入识别', outcome: 'new', newLevelId: 'rec-imp-1', newLevelName: '记录导入识别' },
    ];
    const record = {
      fileName: 'rec-imp-pack.json',
      fileSize: 1024,
      fileHash: 'rechash',
      timestamp: Date.now(),
      newCount: 1,
      overwrittenCount: 0,
      duplicatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failureReasons: [],
      levelDetails: details,
    };
    const exported = buildExportRecordJson(record, [lv]);

    const jsonStr = JSON.stringify(exported);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.levels).toBeDefined();
    expect(Array.isArray(parsed.levels)).toBe(true);

    const reimported = parsePackLevels(jsonStr);
    expect(reimported.length).toBe(1);
    expect(reimported[0].id).toBe('rec-imp-1');
  });
});

describe('层级不散：importedFrom / importDetails / levels 必须在同一层级', () => {
  it('三字段均为顶层属性，不被嵌套到子对象', () => {
    const lv = makeLevel({ id: 'top-1', name: '顶层测试' });
    const details: ImportLevelDetail[] = [
      { levelId: 'top-1', levelName: '顶层测试', outcome: 'new', newLevelId: 'top-1', newLevelName: '顶层测试' },
    ];
    const record = { fileName: 'top-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([lv], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    const topKeys = Object.keys(parsed);
    expect(topKeys).toContain('importedFrom');
    expect(topKeys).toContain('importDetails');
    expect(topKeys).toContain('levels');

    expect(parsed.importedFrom).not.toBeUndefined();
    expect(typeof parsed.importedFrom).toBe('string');
    expect(Array.isArray(parsed.importDetails)).toBe(true);
    expect(Array.isArray(parsed.levels)).toBe(true);
  });

  it('importDetails 内每条明细层级一致，不出现深度嵌套', () => {
    const details: ImportLevelDetail[] = [
      { levelId: 'flat-1', levelName: '扁平1', outcome: 'new', newLevelId: 'flat-1', newLevelName: '扁平1' },
      { levelId: 'flat-2', levelName: '扁平2', outcome: 'overwritten', conflictType: 'both', existingLevelId: 'flat-2', existingLevelName: '旧2', newLevelId: 'flat-2', newLevelName: '扁平2' },
    ];
    const record = { fileName: 'flat-pack.json', timestamp: Date.now(), levelDetails: details };
    const exported = buildExportResultJson([], record);
    const parsed = JSON.parse(JSON.stringify(exported));

    for (const detail of parsed.importDetails) {
      expect(typeof detail.levelId).toBe('string');
      expect(typeof detail.outcome).toBe('string');
      if (detail.outcome !== 'new') {
        expect(typeof detail.conflictType).toBe('string');
      }
      if (detail.outcome === 'failed') {
        expect(typeof detail.failureReason).toBe('string');
      }
    }
  });
});

describe('再次生成时的摘要可回溯', () => {
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

  it('store reExportImportResult 收集的关卡 ID 与 levelDetails 中 new/overwritten/duplicated 一致', () => {
    const lv1 = makeLevel({ id: 'store-1', name: 'Store1' });
    const lv2 = makeLevel({ id: 'store-2', name: 'Store2' });
    setCell(lv1.grid, { x: 2, y: 2 }, { type: 'wall', id: generateId() });

    useGameStore.setState({
      pendingAllImportedLevels: [lv1, lv2],
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'store-pack.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 2048, fileHash: 'storehash' };

    const resolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(resolutions);

    const record = useGameStore.getState().importHistory[0];
    const levelIdsFromDetails = record.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);

    const custom = useGameStore.getState().customLevels;
    const levelsFromStore = custom.filter(l => levelIdsFromDetails.includes(l.id));

    expect(levelsFromStore.length).toBe(2);
    expect(levelsFromStore.find(l => l.id === 'store-1')).toBeTruthy();
    expect(levelsFromStore.find(l => l.id === 'store-2')).toBeTruthy();

    const reExported = buildExportRecordJson(record, levelsFromStore);
    const parsed = JSON.parse(JSON.stringify(reExported));

    assertRecordJsonKeyFields(parsed, {
      originalFileName: 'store-pack.json',
      levelDetails: [
        { levelId: 'store-1', outcome: 'new' },
        { levelId: 'store-2', outcome: 'new' },
      ],
      levels: [
        { id: 'store-1', name: 'Store1' },
        { id: 'store-2', name: 'Store2' },
      ],
    });
  });

  it('覆盖场景：reExportImportResult 收集的关卡是覆盖后的版本', () => {
    const existing = makeLevel({ id: 'over-1', name: '原始' });
    useGameStore.setState({ customLevels: [existing] });

    const overLv = makeLevel({ id: 'over-1', name: '覆盖后' });
    setCell(overLv.grid, { x: 5, y: 3 }, { type: 'key', color: 'yellow', id: generateId() });

    useGameStore.setState({
      pendingAllImportedLevels: [overLv],
      pendingFailedItems: [],
      pendingConflicts: [
        { incomingLevel: overLv, existingLevel: existing, conflictType: 'both' },
      ],
      pendingImportFileName: 'over-pack.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 512, fileHash: 'overhash' };

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('over-1', 'overwrite');
    useGameStore.getState().resolveImportConflicts(resolutions);

    const record = useGameStore.getState().importHistory[0];
    const custom = useGameStore.getState().customLevels;
    const levelIds = record.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToExport = custom.filter(l => levelIds.includes(l.id));

    expect(levelsToExport.length).toBe(1);
    expect(levelsToExport[0].name).toBe('覆盖后');
    expect(levelsToExport[0].grid[3][5].element.type).toBe('key');
    expect(levelsToExport[0].grid[3][5].element.color).toBe('yellow');
  });

  it('duplicate 场景：reExportImportResult 收集的是副本关卡（新 ID）', () => {
    const existing = makeLevel({ id: 'dup-1', name: '原版' });
    useGameStore.setState({ customLevels: [existing] });

    const dupLv = makeLevel({ id: 'dup-1', name: '原版' });
    setCell(dupLv.grid, { x: 3, y: 3 }, { type: 'door', color: 'green', isOpen: false, id: generateId() });

    useGameStore.setState({
      pendingAllImportedLevels: [dupLv],
      pendingFailedItems: [],
      pendingConflicts: [
        { incomingLevel: dupLv, existingLevel: existing, conflictType: 'both' },
      ],
      pendingImportFileName: 'dup-pack.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 512, fileHash: 'duphash' };

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('dup-1', 'duplicate');
    useGameStore.getState().resolveImportConflicts(resolutions);

    const record = useGameStore.getState().importHistory[0];
    const custom = useGameStore.getState().customLevels;
    const dupDetail = record.levelDetails.find(d => d.outcome === 'duplicated')!;
    expect(dupDetail).toBeTruthy();
    expect(dupDetail.newLevelId).not.toBe('dup-1');
    expect(dupDetail.newLevelName).toContain('副本');

    const levelIds = record.levelDetails
      .filter(d => d.outcome === 'new' || d.outcome === 'overwritten' || d.outcome === 'duplicated')
      .map(d => d.newLevelId);
    const levelsToExport = custom.filter(l => levelIds.includes(l.id));

    expect(levelsToExport.length).toBe(1);
    expect(levelsToExport[0].id).not.toBe('dup-1');
    expect(levelsToExport[0].name).toContain('副本');
    expect(levelsToExport[0].grid[3][3].element.type).toBe('door');
  });
});

describe('assertImportResultFields 辅助断言自身行为验证', () => {
  it('importedFrom 不匹配时抛出断言错误', () => {
    const obj = { importedFrom: 'a.json', importDetails: [], levels: [] };
    expect(() => assertImportResultFields(obj, {
      importedFrom: 'b.json',
      importDetails: [],
      levels: [],
    })).toThrow();
  });

  it('importDetails 长度不匹配时抛出断言错误', () => {
    const obj = {
      importedFrom: 'a.json',
      importDetails: [{ levelId: '1', outcome: 'new', levelName: 'x' }],
      levels: [],
    };
    expect(() => assertImportResultFields(obj, {
      importedFrom: 'a.json',
      importDetails: [],
      levels: [],
    })).toThrow();
  });

  it('levels ID 不匹配时抛出断言错误', () => {
    const obj = {
      importedFrom: 'a.json',
      importDetails: [],
      levels: [{ id: 'wrong', name: '错' }],
    };
    expect(() => assertImportResultFields(obj, {
      importedFrom: 'a.json',
      importDetails: [],
      levels: [{ id: 'right', name: '对' }],
    })).toThrow();
  });

  it('完全匹配时不抛出', () => {
    const obj = {
      importedFrom: 'ok.json',
      importDetails: [{ levelId: 'x', outcome: 'new', levelName: '测试' }],
      levels: [{ id: 'x', name: '测试' }],
    };
    expect(() => assertImportResultFields(obj, {
      importedFrom: 'ok.json',
      importDetails: [{ levelId: 'x', outcome: 'new', levelName: '测试' }],
      levels: [{ id: 'x', name: '测试' }],
    })).not.toThrow();
  });
});
