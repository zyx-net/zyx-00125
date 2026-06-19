const fs = require('fs');
const path = require('path');

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function mkCell(type, extra = {}) {
  return { element: { type, id: genId(), ...extra } };
}

function createLevel({ id, name, width = 8, height = 6, extraWalls = [], gridOverrides = {} }) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({ element: null });
    }
    grid.push(row);
  }
  for (let x = 0; x < width; x++) {
    grid[0][x] = mkCell('wall');
    grid[height - 1][x] = mkCell('wall');
  }
  for (let y = 0; y < height; y++) {
    grid[y][0] = mkCell('wall');
    grid[y][width - 1] = mkCell('wall');
  }
  const defaultWalls = [[3, 2], [3, 3], [5, 1], [5, 2], [5, 3], ...extraWalls];
  for (const [x, y] of defaultWalls) {
    grid[y][x] = mkCell('wall');
  }
  grid[2][2] = mkCell('key', { color: 'red' });
  grid[4][4] = mkCell('key', { color: 'blue' });
  grid[2][4] = mkCell('door', { color: 'red', isOpen: false });
  grid[3][6] = mkCell('door', { color: 'blue', isOpen: false });
  grid[1][1] = mkCell('start');
  grid[4][6] = mkCell('end');
  for (const key in gridOverrides) {
    const [x, y] = key.split(',').map(Number);
    const val = gridOverrides[key];
    if (val === null) {
      grid[y][x] = { element: null };
    } else if (typeof val === 'object' && val.type) {
      grid[y][x] = mkCell(val.type, val.extra || {});
    }
  }
  return {
    id,
    name,
    width,
    height,
    grid,
    startPos: { x: 1, y: 1 },
    endPos: { x: 6, y: 4 },
  };
}

const conflictLevel = createLevel({
  id: 'sample-level-1',
  name: '第一关：初识钥匙',
  extraWalls: [[4, 2]],
});

const brandNewLevel = createLevel({
  id: 'brand-new-imported-level',
  name: '全新导入的测试关卡',
  width: 8,
  height: 6,
  extraWalls: [[2, 3]],
});

const pack = {
  name: 'test-conflict-plus-new',
  version: '1.0',
  exportedAt: new Date().toISOString(),
  levels: [conflictLevel, brandNewLevel],
};

const outDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'test-conflict-plus-new.json');
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2));
console.log('已生成测试关卡包:', outPath);
console.log('  - 冲突关卡 (同 ID 同名称, 多了一堵墙): sample-level-1');
console.log('  - 全新关卡: brand-new-imported-level');
