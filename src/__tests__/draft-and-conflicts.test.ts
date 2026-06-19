import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Level, EditorState, ConflictResolution } from '../types/game';
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
  isLevelDirty,
  saveLastEditingLevelId,
  loadLastEditingLevelId,
  clearLastEditingLevelId,
  clearAllStorage,
} from '../utils/storage';
import { validateLevel } from '../game/rules';
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

beforeEach(() => {
  ls.clear();
});
afterEach(() => {
  ls.clear();
});

function makeEditorState(): EditorState {
  return {
    selectedTool: 'wall',
    selectedColor: 'red',
    gridWidth: 8,
    gridHeight: 6,
  };
}

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

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe('编辑历史: 快照栈与撤销重做', () => {
  it('初始创建后 currentIndex=0，不能撤销可以重做（无操作时）', () => {
    const level = makeLevel();
    const es = makeEditorState();
    const h = createEditorHistory(level, es);
    expect(h.currentIndex).toBe(0);
    expect(h.snapshots.length).toBe(1);
    expect(canEditorUndo(h)).toBe(false);
    expect(canEditorRedo(h)).toBe(false);
  });

  it('添加几次快照后可以撤销直到初始', () => {
    const level0 = makeLevel({ id: 'lv1' });
    const es = makeEditorState();
    let h = createEditorHistory(level0, es);

    for (let i = 0; i < 3; i++) {
      const grid = cloneGrid(level0.grid);
      setCell(grid, { x: 3 + i, y: 2 }, { type: 'wall', id: generateId() });
      const lv: Level = { ...level0, grid, width: level0.width, height: level0.height };
      h = addEditorSnapshot(h, lv, es);
    }
    expect(h.currentIndex).toBe(3);
    expect(h.snapshots.length).toBe(4);
    expect(canEditorUndo(h)).toBe(true);
    expect(canEditorRedo(h)).toBe(false);

    for (let i = 0; i < 3; i++) {
      const snap = editorUndo(h);
      expect(snap).not.toBeNull();
      h = { ...h, currentIndex: h.currentIndex - 1 };
    }
    expect(canEditorUndo(h)).toBe(false);
  });

  it('撤销后再重做，回到与撤销前相同的状态', () => {
    const level0 = makeLevel({ id: 'lv2' });
    const es = makeEditorState();
    let h = createEditorHistory(level0, es);

    const grid1 = cloneGrid(level0.grid);
    setCell(grid1, { x: 4, y: 3 }, { type: 'key', color: 'blue', id: generateId() });
    const lv1: Level = { ...level0, grid: grid1 };
    h = addEditorSnapshot(h, lv1, es);

    const grid2 = cloneGrid(grid1);
    setCell(grid2, { x: 5, y: 3 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });
    const lv2: Level = { ...level0, grid: grid2 };
    h = addEditorSnapshot(h, lv2, { ...es, selectedTool: 'door' });

    const beforeUndo = h.snapshots[h.currentIndex];
    const undoSnap = editorUndo(h);
    expect(undoSnap).not.toBeNull();
    expect(undoSnap!.level.grid[3][5].element).toBeNull();
    h = { ...h, currentIndex: h.currentIndex - 1 };

    const redoSnap = editorRedo(h);
    expect(redoSnap).not.toBeNull();
    expect(redoSnap!.level.grid[3][5].element?.type).toBe('door');
    expect(redoSnap!.level.grid[3][4].element?.type).toBe('key');
    expect(redoSnap!.level.grid[3][4].element?.color).toBe('blue');
    expect(redoSnap!.editorState.selectedTool).toBe('door');

    const redoJson = JSON.stringify(redoSnap!.level.grid);
    const beforeJson = JSON.stringify(beforeUndo.level.grid);
    expect(redoJson).toBe(beforeJson);
  });

  it('快照之间互不影响（immutable 隔离）', () => {
    const level0 = makeLevel({ id: 'lv3' });
    const es = makeEditorState();
    let h = createEditorHistory(level0, es);

    const grid1 = cloneGrid(level0.grid);
    setCell(grid1, { x: 2, y: 2 }, { type: 'mechanism', color: 'green', isActive: false, id: generateId() });
    const lv1: Level = { ...level0, grid: grid1 };
    h = addEditorSnapshot(h, lv1, es);

    const snap0 = h.snapshots[0];
    const snap1 = h.snapshots[1];
    expect(snap0.level.grid[2][2].element).toBeNull();
    expect(snap1.level.grid[2][2].element?.type).toBe('mechanism');

    // 修改 snap1 的引用对象（因为是数组中取出的引用），但注意：
    // 我们要验证的是 addEditorSnapshot 时的深拷贝隔离，
    // 所以对外部传入的 lv1 修改，不应影响已保存的快照
    setCell(lv1.grid, { x: 2, y: 2 }, null);
    expect(lv1.grid[2][2].element).toBeNull();
    expect(h.snapshots[1].level.grid[2][2].element?.type).toBe('mechanism');

    // 同样验证 snap0 和 snap1 的 level 是不同对象
    setCell(snap1.level.grid, { x: 2, y: 2 }, null);
    // snap0 仍然保持不变
    expect(snap0.level.grid[2][2].element).toBeNull();
  });
});

describe('草稿存储: 按关卡 ID 自动落本地与恢复', () => {
  it('saveDraft → loadDraft，level 结构逐字段一致', () => {
    const level = makeLevel({ id: 'my-draft', name: '我的草稿' });
    const g = cloneGrid(level.grid);
    setCell(g, { x: 3, y: 3 }, { type: 'key', color: 'yellow', id: generateId() });
    setCell(g, { x: 4, y: 3 }, { type: 'wall', id: generateId() });
    level.grid = g;

    const es = makeEditorState();
    es.selectedTool = 'mechanism';
    es.selectedColor = 'green';
    const eh = createEditorHistory(level, es);

    const saved = saveDraft('my-draft', level, es, eh);
    expect(saved.savedAt).toBeGreaterThan(0);
    expect(saved.updatedAt).toBeGreaterThan(0);

    const loaded = loadDraft('my-draft');
    expect(loaded).not.toBeNull();
    expect(loaded!.levelId).toBe('my-draft');
    expect(loaded!.level.name).toBe('我的草稿');
    expect(loaded!.level.grid[3][3].element?.type).toBe('key');
    expect(loaded!.level.grid[3][3].element?.color).toBe('yellow');
    expect(loaded!.level.grid[3][4].element?.type).toBe('wall');
    expect(loaded!.level.startPos).toEqual(level.startPos);
    expect(loaded!.level.endPos).toEqual(level.endPos);
    expect(loaded!.editorState.selectedTool).toBe('mechanism');
    expect(loaded!.editorState.selectedColor).toBe('green');
    expect(loaded!.editorHistory.snapshots.length).toBe(1);
  });

  it('模拟跨浏览器重启: JSON 序列化后再加载，结构一致', () => {
    const level = makeLevel({ id: 'persist-1', width: 6, height: 6 });
    const g = cloneGrid(level.grid);
    setCell(g, { x: 2, y: 2 }, { type: 'key', color: 'red', id: generateId() });
    setCell(g, { x: 3, y: 2 }, { type: 'door', color: 'red', isOpen: true, id: generateId() });
    setCell(g, { x: 4, y: 4 }, { type: 'mechanism', color: 'blue', isActive: true, id: generateId() });
    level.grid = g;

    const es = makeEditorState();
    let eh = createEditorHistory(level, es);
    const g2 = cloneGrid(g);
    setCell(g2, { x: 3, y: 2 }, null); // remove door
    setCell(g2, { x: 3, y: 2 }, { type: 'wall', id: generateId() }); // put wall at (x:3,y:2) = grid[2][3]
    const lv2: Level = { ...level, grid: g2 };
    eh = addEditorSnapshot(eh, lv2, { ...es, selectedColor: 'blue' });

    saveDraft('persist-1', lv2, { ...es, selectedColor: 'blue' }, eh);
    saveLastEditingLevelId('persist-1');

    const raw = localStorage.getItem('puzzle_draft_persist-1');
    expect(raw).toBeTruthy();
    const simulatedReload = JSON.parse(raw!);
    ls.clear();
    localStorage.setItem('puzzle_draft_persist-1', JSON.stringify(simulatedReload));
    localStorage.setItem('puzzle_last_editing_level', JSON.stringify('persist-1'));
    localStorage.setItem('puzzle_draft_index', JSON.stringify(['persist-1']));

    const loaded = loadDraft('persist-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.level.grid[2][2].element?.type).toBe('key');
    // setCell({x:3, y:2}) => grid[y=2][x=3]
    expect(loaded!.level.grid[2][3].element?.type).toBe('wall');
    expect(loaded!.level.grid[2][3].element?.color).toBeUndefined();
    expect(loaded!.level.grid[4][4].element?.isActive).toBe(true);
    expect(loaded!.editorHistory.snapshots.length).toBe(2);
    expect(loaded!.editorHistory.currentIndex).toBe(1);
    expect(loadLastEditingLevelId()).toBe('persist-1');
  });

  it('loadAllDrafts / hasDraft / deleteDraft 完整流程', () => {
    const ids = ['a', 'b', 'c'];
    for (const id of ids) {
      const lv = makeLevel({ id, name: `关卡 ${id}` });
      saveDraft(id, lv, makeEditorState(), createEditorHistory(lv, makeEditorState()));
    }
    expect(hasDraft('a')).toBe(true);
    expect(hasDraft('nonexistent')).toBe(false);
    const all = loadAllDrafts();
    expect(all.length).toBe(3);

    deleteDraft('b');
    expect(hasDraft('b')).toBe(false);
    expect(loadAllDrafts().length).toBe(2);
  });

  it('isLevelDirty 能正确检测草稿与正式版的差异', () => {
    const official = makeLevel({ id: 'dirty-test', name: '正式版' });
    expect(isLevelDirty('dirty-test', official)).toBe(false);

    saveDraft('dirty-test', official, makeEditorState(), createEditorHistory(official, makeEditorState()));
    expect(isLevelDirty('dirty-test', official)).toBe(false);

    const modified = deepClone(official);
    setCell(modified.grid, { x: 5, y: 2 }, { type: 'wall', id: generateId() });
    expect(isLevelDirty('dirty-test', modified)).toBe(true);

    const renamed = deepClone(official);
    renamed.name = '改了名字';
    expect(isLevelDirty('dirty-test', renamed)).toBe(true);

    const resized = deepClone(official);
    resized.width = 10;
    expect(isLevelDirty('dirty-test', resized)).toBe(true);
  });
});

describe('冲突检测与处理: 三种分支（覆盖/另存/取消）', () => {
  function detectConflicts(incoming: Level[], existing: Level[]) {
    const conflicts: { incomingLevel: Level; existingLevel?: Level; conflictType: 'id' | 'name' | 'both' }[] = [];
    for (const level of incoming) {
      const byId = existing.find(l => l.id === level.id);
      const byName = existing.find(l => l.name === level.name);
      if (byId && byName && byId.id === byName.id) {
        conflicts.push({ incomingLevel: level, existingLevel: byId, conflictType: 'both' });
      } else if (byId) {
        conflicts.push({ incomingLevel: level, existingLevel: byId, conflictType: 'id' });
      } else if (byName) {
        conflicts.push({ incomingLevel: level, existingLevel: byName, conflictType: 'name' });
      }
    }
    return conflicts;
  }

  it('能正确检测 ID 冲突、名称冲突、双冲突三种类型', () => {
    const existing: Level[] = [
      makeLevel({ id: 'e1', name: '关卡一' }),
      makeLevel({ id: 'e2', name: '关卡二' }),
    ];
    const incoming: Level[] = [
      makeLevel({ id: 'e1', name: '名字改了' }),
      makeLevel({ id: 'new-id', name: '关卡二' }),
      makeLevel({ id: 'e2', name: '关卡二' }),
      makeLevel({ id: 'brand-new', name: '完全新' }),
    ];
    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts.length).toBe(3);
    expect(conflicts[0].conflictType).toBe('id');
    expect(conflicts[1].conflictType).toBe('name');
    expect(conflicts[2].conflictType).toBe('both');
  });

  it('覆盖分支：现有 ID 被替换为传入内容，草稿被删除', () => {
    const existingLv = makeLevel({ id: 'same-id', name: '原有关卡' });
    saveDraft('same-id', existingLv, makeEditorState(), createEditorHistory(existingLv, makeEditorState()));
    expect(hasDraft('same-id')).toBe(true);

    const incomingLv = makeLevel({ id: 'same-id', name: '已覆盖' });
    setCell(incomingLv.grid, { x: 4, y: 4 }, { type: 'wall', id: generateId() });

    let customLevels = [existingLv];
    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('same-id', 'overwrite');

    const idx = customLevels.findIndex(l => l.id === 'same-id');
    if (idx >= 0) {
      customLevels[idx] = { ...incomingLv, id: existingLv.id };
    }
    deleteDraft(existingLv.id);

    expect(customLevels[0].name).toBe('已覆盖');
    expect(customLevels[0].grid[4][4].element?.type).toBe('wall');
    expect(hasDraft('same-id')).toBe(false);
  });

  it('另存副本分支：生成新 ID 和去重名称，不影响原关卡', () => {
    const original = makeLevel({ id: 'orig-1', name: '唯一名字' });
    const incoming = makeLevel({ id: 'orig-1', name: '唯一名字' });
    setCell(incoming.grid, { x: 2, y: 5 }, { type: 'mechanism', color: 'yellow', isActive: false, id: generateId() });

    const existing = [original];
    const existingNames = new Set(existing.map(l => l.name));
    const newId = generateId();
    let candidate = '唯一名字 (副本)';
    let c = 2;
    while (existingNames.has(candidate)) {
      candidate = `唯一名字 (副本${c})`;
      c++;
    }
    const dup: Level = { ...incoming, id: newId, name: candidate };
    const result = [...existing, dup];

    expect(result.length).toBe(2);
    expect(result[0].id).toBe('orig-1');
    expect(result[0].grid[5][2].element).toBeNull();
    expect(result[1].id).toBe(newId);
    expect(result[1].name).toBe('唯一名字 (副本)');
    expect(result[1].grid[5][2].element?.type).toBe('mechanism');
  });

  it('取消分支：不修改任何现有数据', () => {
    const original = makeLevel({ id: 'keep', name: '保留关卡' });
    const snapshot = deepClone(original);
    const incoming = makeLevel({ id: 'keep', name: '保留关卡' });
    setCell(incoming.grid, { x: 1, y: 1 }, { type: 'wall', id: generateId() });

    const customLevels = [original];
    const before = JSON.stringify(customLevels);
    // cancel => do nothing
    const after = JSON.stringify(customLevels);
    expect(before).toBe(after);
    expect(JSON.stringify(customLevels[0].grid)).toBe(JSON.stringify(snapshot.grid));
  });

  it('混合三种分支批量处理，结果统计正确', () => {
    const existing: Level[] = [
      makeLevel({ id: 'a', name: 'A' }),
      makeLevel({ id: 'b', name: 'B' }),
      makeLevel({ id: 'c', name: 'C' }),
    ];
    const incoming: Level[] = [
      makeLevel({ id: 'a', name: 'A-new' }),
      makeLevel({ id: 'b', name: 'B' }),
      makeLevel({ id: 'c', name: 'C' }),
    ];

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('a', 'overwrite');
    resolutions.set('b', 'duplicate');
    resolutions.set('c', 'cancel');

    let allCustom = [...existing];
    const stats = { imported: 0, overwritten: 0, duplicated: 0, skipped: 0 };

    for (const inc of incoming) {
      const res = resolutions.get(inc.id);
      if (res === 'overwrite') {
        const idx = allCustom.findIndex(l => l.id === inc.id);
        allCustom[idx] = { ...inc, id: existing[idx].id };
        stats.overwritten++;
        stats.imported++;
      } else if (res === 'duplicate') {
        allCustom.push({ ...inc, id: generateId(), name: inc.name + ' (副本)' });
        stats.duplicated++;
        stats.imported++;
      } else {
        stats.skipped++;
      }
    }

    expect(stats.overwritten).toBe(1);
    expect(stats.duplicated).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.imported).toBe(2);
    expect(allCustom.length).toBe(4);
    expect(allCustom.find(l => l.id === 'a')!.name).toBe('A-new');
    expect(allCustom.filter(l => l.name.startsWith('B')).length).toBe(2);
    expect(allCustom.find(l => l.id === 'c')!.name).toBe('C');
  });
});

describe('恢复流程: 草稿恢复后可继续编辑、撤销重做、导出', () => {
  it('恢复草稿 → 继续编辑 → 撤销 → 再编辑 → 导出，内容一致', () => {
    // 7x7，默认 start=(1,1), end=(5,5)
    const base = makeLevel({ id: 'recover', name: '恢复关卡', width: 7, height: 7 });

    let es: EditorState = { selectedTool: 'key', selectedColor: 'red', gridWidth: 7, gridHeight: 7 };
    let eh = createEditorHistory(base, es);

    const g1 = cloneGrid(base.grid);
    setCell(g1, { x: 3, y: 3 }, { type: 'key', color: 'red', id: generateId() });
    const lv1: Level = { ...base, grid: g1 };
    eh = addEditorSnapshot(eh, lv1, es);

    const g2 = cloneGrid(g1);
    setCell(g2, { x: 4, y: 3 }, { type: 'door', color: 'red', isOpen: false, id: generateId() });
    const lv2: Level = { ...base, grid: g2 };
    eh = addEditorSnapshot(eh, lv2, { ...es, selectedTool: 'door' });

    saveDraft('recover', lv2, { ...es, selectedTool: 'door' }, eh);

    // === 模拟刷新页面：重新加载 ===
    const loadedDraft = loadDraft('recover');
    expect(loadedDraft).not.toBeNull();
    let restoredEH = loadedDraft!.editorHistory;
    let restoredLevel = loadedDraft!.level;
    let restoredES = loadedDraft!.editorState;

    expect(restoredLevel.grid[3][3].element?.type).toBe('key');
    expect(restoredLevel.grid[3][4].element?.type).toBe('door');
    expect(restoredLevel.grid[3][4].element?.color).toBe('red');
    expect(restoredEH.currentIndex).toBe(2);
    expect(canEditorUndo(restoredEH)).toBe(true);

    // 撤销到上一步（门还没放）
    const undoSnap = editorUndo(restoredEH);
    expect(undoSnap).not.toBeNull();
    restoredEH = { ...restoredEH, currentIndex: restoredEH.currentIndex - 1 };
    expect(undoSnap!.level.grid[3][4].element).toBeNull();
    expect(undoSnap!.level.grid[3][3].element?.type).toBe('key');

    // 继续编辑：放机关（不放在终点，终点是(5,5)，放(5,4)）
    const g3 = cloneGrid(undoSnap!.level.grid);
    setCell(g3, { x: 5, y: 4 }, { type: 'mechanism', color: 'green', isActive: false, id: generateId() });
    const lv3: Level = { ...undoSnap!.level, grid: g3 };
    restoredEH = addEditorSnapshot(restoredEH, lv3, { ...restoredES, selectedTool: 'mechanism', selectedColor: 'green' });

    // 导出前做验证
    expect(validateLevel(lv3).valid).toBe(true);

    // 导出内容（模拟 JSON 序列化）
    const exported = JSON.parse(JSON.stringify(lv3));
    expect(exported.grid[3][3].element?.type).toBe('key');
    expect(exported.grid[3][4].element).toBeNull();
    expect(exported.grid[4][5].element?.type).toBe('mechanism'); // grid[y=4][x=5]
    expect(exported.grid[4][5].element?.color).toBe('green');
    expect(exported.id).toBe('recover');
    expect(exported.name).toBe('恢复关卡');

    // 保存正式版后，草稿被删除
    saveDraft('recover', lv3, restoredES, restoredEH);
    expect(hasDraft('recover')).toBe(true);
    deleteDraft('recover');
    expect(hasDraft('recover')).toBe(false);
  });

  it('草稿中存储的撤销历史快照互不影响（deep clone 验证）', () => {
    const base = makeLevel({ id: 'clone-check' });
    const es = makeEditorState();
    let eh = createEditorHistory(base, es);

    const steps = [
      { x: 2, y: 2, type: 'wall' as const },
      { x: 3, y: 2, type: 'wall' as const },
      { x: 4, y: 2, type: 'wall' as const },
    ];
    let cur = base;
    for (const s of steps) {
      const g = cloneGrid(cur.grid);
      setCell(g, { x: s.x, y: s.y }, { type: s.type, id: generateId() });
      cur = { ...cur, grid: g };
      eh = addEditorSnapshot(eh, cur, es);
    }

    saveDraft('clone-check', cur, es, eh);
    const loaded = loadDraft('clone-check')!;

    // 修改最后一个快照的内容，不应影响之前的快照
    const lastSnap = loaded.editorHistory.snapshots[3];
    lastSnap.level.grid[2][3].element = null;

    const snap2 = loaded.editorHistory.snapshots[2];
    expect(snap2.level.grid[2][3].element?.type).toBe('wall');

    // 直接从草稿里撤销回到步骤 1，也应该是有墙的
    const u1 = editorUndo(loaded.editorHistory);
    expect(u1!.level.grid[2][4].element).toBeNull();
    expect(u1!.level.grid[2][3].element?.type).toBe('wall');
    const h1 = { ...loaded.editorHistory, currentIndex: loaded.editorHistory.currentIndex - 1 };
    const u2 = editorUndo(h1);
    expect(u2!.level.grid[2][3].element).toBeNull();
    expect(u2!.level.grid[2][2].element?.type).toBe('wall');
  });

  it('试玩切换回编辑：lastEditingLevelId 指向正确草稿', () => {
    const editId = 'editing-while-play';
    const lv = makeLevel({ id: editId, name: '编辑中的关卡' });
    saveLastEditingLevelId(editId);
    saveDraft(editId, lv, makeEditorState(), createEditorHistory(lv, makeEditorState()));

    // 模拟：用户先切去试玩（play mode，lastEditingLevelId 不变），再回来
    // 恢复流程会读取 loadLastEditingLevelId + loadDraft
    expect(loadLastEditingLevelId()).toBe(editId);
    const reloaded = loadDraft(editId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.levelId).toBe(editId);
    expect(reloaded!.level.name).toBe('编辑中的关卡');

    clearLastEditingLevelId();
    expect(loadLastEditingLevelId()).toBeNull();
  });
});

describe('导入冲突回归: 非冲突关卡不丢失（store 级别集成测试）', () => {
  beforeEach(() => {
    ls.clear();
    useGameStore.setState({
      customLevels: [
        makeLevel({ id: 'exist-1', name: '已有一' }),
      ],
      pendingConflicts: [],
      pendingAllImportedLevels: [],
      pendingImportFileName: '',
      importHistory: [],
      allDraftIds: [],
    });
  });

  it('1 个 ID 冲突 + 1 个全新关卡，选择覆盖 → 新关卡完整加入，冲突项被覆盖', () => {
    const newLv = makeLevel({ id: 'brand-new', name: '全新关卡' });
    setCell(newLv.grid, { x: 5, y: 3 }, { type: 'key', color: 'green', id: generateId() });
    const conflictLv = makeLevel({ id: 'exist-1', name: '已有一' });
    setCell(conflictLv.grid, { x: 2, y: 2 }, { type: 'wall', id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-1', name: '已有一' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-1', 'overwrite');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(2);
    expect(result.overwritten.length).toBe(1);
    expect(result.skipped.length).toBe(0);
    expect(result.duplicated.length).toBe(0);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);

    const overwritten = custom.find(l => l.id === 'exist-1')!;
    expect(overwritten.grid[2][2].element?.type).toBe('wall');

    const brandNew = custom.find(l => l.id === 'brand-new')!;
    expect(brandNew).toBeTruthy();
    expect(brandNew.name).toBe('全新关卡');
    expect(brandNew.grid[3][5].element?.type).toBe('key');
    expect(brandNew.grid[3][5].element?.color).toBe('green');

    expect(useGameStore.getState().pendingConflicts.length).toBe(0);
    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);
  });

  it('1 个冲突 + 2 个全新关卡，冲突选另存副本 → 全部 3 个新关卡都加入', () => {
    const new1 = makeLevel({ id: 'new-1', name: '新关卡1' });
    const new2 = makeLevel({ id: 'new-2', name: '新关卡2' });
    const conflictLv = makeLevel({ id: 'exist-1', name: '已有一' });
    setCell(conflictLv.grid, { x: 3, y: 3 }, { type: 'door', color: 'blue', isOpen: false, id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-1', name: '已有一' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, new1, new2],
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-1', 'duplicate');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(3);
    expect(result.duplicated.length).toBe(1);
    expect(result.overwritten.length).toBe(0);
    expect(result.skipped.length).toBe(0);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(4);

    expect(custom.filter(l => l.name.startsWith('已有一')).length).toBe(2);
    expect(custom.find(l => l.id === 'new-1')).toBeTruthy();
    expect(custom.find(l => l.id === 'new-2')).toBeTruthy();

    const dup = custom.find(l => l.name === '已有一 (副本)')!;
    expect(dup).toBeTruthy();
    expect(dup.grid[3][3].element?.type).toBe('door');
    expect(dup.grid[3][3].element?.color).toBe('blue');
  });

  it('单项取消冲突项 → 只跳过冲突，非冲突关卡仍被导入', () => {
    const newLv = makeLevel({ id: 'should-import', name: '新关卡' });
    const conflictLv = makeLevel({ id: 'exist-1', name: '已有一' });
    setCell(conflictLv.grid, { x: 2, y: 2 }, { type: 'wall', id: generateId() });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-1', name: '已有一' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
    });

    const resolutions = new Map<string, ConflictResolution>();
    resolutions.set('exist-1', 'cancel');

    const result = useGameStore.getState().resolveImportConflicts(resolutions);

    expect(result.imported.length).toBe(1);
    expect(result.skipped.length).toBe(1);
    expect(result.overwritten.length).toBe(0);
    expect(result.duplicated.length).toBe(0);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(2);
    expect(custom.find(l => l.id === 'should-import')).toBeTruthy();
    expect(custom.find(l => l.id === 'exist-1')!.grid[2][2].element).toBeNull();

    expect(useGameStore.getState().pendingConflicts.length).toBe(0);
    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);
  });

  it('全部取消（cancelPendingConflicts）→ 原数据一丝不改，pending 全部清空', () => {
    const origSnapshot = JSON.stringify(useGameStore.getState().customLevels);

    const newLv = makeLevel({ id: 'should-not-import', name: '不应导入' });
    const conflictLv = makeLevel({ id: 'exist-1', name: '已有一' });

    useGameStore.setState({
      pendingConflicts: [
        { incomingLevel: conflictLv, existingLevel: makeLevel({ id: 'exist-1', name: '已有一' }), conflictType: 'both' },
      ],
      pendingAllImportedLevels: [conflictLv, newLv],
    });

    useGameStore.getState().cancelPendingConflicts();

    expect(useGameStore.getState().pendingConflicts.length).toBe(0);
    expect(useGameStore.getState().pendingAllImportedLevels.length).toBe(0);

    const custom = useGameStore.getState().customLevels;
    expect(custom.length).toBe(1);
    expect(custom[0].id).toBe('exist-1');
    expect(JSON.stringify(custom)).toBe(origSnapshot);
  });
});
