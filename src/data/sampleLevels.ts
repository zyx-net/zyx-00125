import type { Level } from '../types/game';
import { createEmptyGrid, setCell, generateId } from '../game/grid';

function createSampleLevel1(): Level {
  const width = 8;
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

  setCell(grid, { x: 3, y: 2 }, { type: 'wall', id: generateId() });
  setCell(grid, { x: 3, y: 3 }, { type: 'wall', id: generateId() });
  setCell(grid, { x: 5, y: 1 }, { type: 'wall', id: generateId() });
  setCell(grid, { x: 5, y: 2 }, { type: 'wall', id: generateId() });
  setCell(grid, { x: 5, y: 3 }, { type: 'wall', id: generateId() });

  setCell(grid, { x: 2, y: 2 }, { type: 'key', color: 'red', id: generateId() });
  setCell(grid, { x: 4, y: 4 }, { type: 'key', color: 'blue', id: generateId() });

  setCell(grid, { x: 4, y: 2 }, {
    type: 'door',
    color: 'red',
    isOpen: false,
    id: generateId(),
  });
  setCell(grid, { x: 6, y: 3 }, {
    type: 'door',
    color: 'blue',
    isOpen: false,
    id: generateId(),
  });

  setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
  setCell(grid, { x: 6, y: 4 }, { type: 'end', id: generateId() });

  return {
    id: 'sample-level-1',
    name: '第一关：初识钥匙',
    width,
    height,
    grid,
    startPos: { x: 1, y: 1 },
    endPos: { x: 6, y: 4 },
  };
}

function createSampleLevel2(): Level {
  const width = 10;
  const height = 8;
  const grid = createEmptyGrid(width, height);

  for (let x = 0; x < width; x++) {
    setCell(grid, { x, y: 0 }, { type: 'wall', id: generateId() });
    setCell(grid, { x, y: height - 1 }, { type: 'wall', id: generateId() });
  }
  for (let y = 0; y < height; y++) {
    setCell(grid, { x: 0, y }, { type: 'wall', id: generateId() });
    setCell(grid, { x: width - 1, y }, { type: 'wall', id: generateId() });
  }

  for (let y = 1; y <= 3; y++) {
    setCell(grid, { x: 3, y }, { type: 'wall', id: generateId() });
  }
  for (let x = 4; x <= 6; x++) {
    setCell(grid, { x, y: 3 }, { type: 'wall', id: generateId() });
  }
  for (let y = 4; y <= 6; y++) {
    setCell(grid, { x: 6, y }, { type: 'wall', id: generateId() });
  }
  setCell(grid, { x: 2, y: 5 }, { type: 'wall', id: generateId() });
  setCell(grid, { x: 3, y: 6 }, { type: 'wall', id: generateId() });

  setCell(grid, { x: 1, y: 1 }, { type: 'key', color: 'red', id: generateId() });
  setCell(grid, { x: 4, y: 1 }, { type: 'key', color: 'green', id: generateId() });
  setCell(grid, { x: 8, y: 6 }, { type: 'key', color: 'yellow', id: generateId() });

  setCell(grid, { x: 3, y: 4 }, {
    type: 'door',
    color: 'red',
    isOpen: false,
    id: generateId(),
  });
  setCell(grid, { x: 7, y: 4 }, {
    type: 'door',
    color: 'green',
    isOpen: false,
    id: generateId(),
  });
  setCell(grid, { x: 8, y: 1 }, {
    type: 'door',
    color: 'yellow',
    isOpen: false,
    id: generateId(),
  });

  setCell(grid, { x: 1, y: 6 }, {
    type: 'mechanism',
    color: 'red',
    isActive: false,
    id: generateId(),
  });
  setCell(grid, { x: 5, y: 6 }, {
    type: 'mechanism',
    color: 'yellow',
    isActive: false,
    id: generateId(),
  });

  setCell(grid, { x: 1, y: 2 }, { type: 'start', id: generateId() });
  setCell(grid, { x: 8, y: 2 }, { type: 'end', id: generateId() });

  return {
    id: 'sample-level-2',
    name: '第二关：机关重重',
    width,
    height,
    grid,
    startPos: { x: 1, y: 2 },
    endPos: { x: 8, y: 2 },
  };
}

export const sampleLevels: Level[] = [
  createSampleLevel1(),
  createSampleLevel2(),
];

export function getSampleLevelById(id: string): Level | undefined {
  return sampleLevels.find(level => level.id === id);
}

export function createEmptyLevel(width: number = 8, height: number = 6): Level {
  const grid = createEmptyGrid(width, height);
  setCell(grid, { x: 1, y: 1 }, { type: 'start', id: generateId() });
  setCell(grid, { x: width - 2, y: height - 2 }, { type: 'end', id: generateId() });

  return {
    id: generateId(),
    name: '未命名关卡',
    width,
    height,
    grid,
    startPos: { x: 1, y: 1 },
    endPos: { x: width - 2, y: height - 2 },
  };
}
