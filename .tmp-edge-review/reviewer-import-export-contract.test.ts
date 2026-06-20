import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Level } from '../src/types/game';
import type { ConflictResolution } from '../src/types/game';
import { createEmptyGrid, generateId, setCell } from '../src/game/grid';
import { importLevelPack } from '../src/utils/export';
import { useGameStore } from '../src/store/useGameStore';

class LocalStorageMock {
  private store: Record<string, string> = {};

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
}

const ls = new LocalStorageMock();
vi.stubGlobal('localStorage', ls);
vi.stubGlobal('window', { confirm: () => true });

class MockFileReader {
  result: string | null = null;
  onload: ((event: { target: { result: string | null } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(file: File): void {
    file.text()
      .then((text) => {
        this.result = text;
        this.onload?.({ target: { result: text } });
      })
      .catch(() => {
        this.onerror?.();
      });
  }
}

vi.stubGlobal('FileReader', MockFileReader);

function makeLevel(id: string, name: string): Level {
  const width = 8;
  const height = 6;
  const grid = createEmptyGrid(width, height);
  const startPos = { x: 1, y: 1 };
  const endPos = { x: 6, y: 4 };
  setCell(grid, startPos, { type: 'start', id: generateId() });
  setCell(grid, endPos, { type: 'end', id: generateId() });

  return {
    id,
    name,
    width,
    height,
    grid,
    startPos,
    endPos,
  };
}

function resetStore(): void {
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
  (useGameStore.getState() as any)._pendingFileMeta = null;
}

async function captureDownload(action: () => boolean | void): Promise<{ download: string; text: string }> {
  const blobStore = new Map<string, Blob>();
  let seq = 0;

  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => {
      const url = `blob:review-${++seq}`;
      blobStore.set(url, blob);
      return url;
    },
    revokeObjectURL: (_url: string) => {},
  });

  return new Promise((resolve, reject) => {
    const anchor = {
      href: '',
      download: '',
      click: () => {
        const blob = blobStore.get(anchor.href);
        if (!blob) {
          reject(new Error(`missing blob for ${anchor.href}`));
          return;
        }
        blob.text()
          .then((text) => resolve({ download: anchor.download, text }))
          .catch(reject);
      },
    };

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'a') {
          throw new Error(`unexpected tag ${tag}`);
        }
        return anchor;
      },
      body: {
        appendChild: (_node: unknown) => {},
        removeChild: (_node: unknown) => {},
      },
    });

    action();
  });
}

async function writeReviewerFile(name: string, text: string): Promise<string> {
  const fullPath = resolve('.tmp-edge-review', name);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text, 'utf8');
  return fullPath;
}

async function fileFromDisk(filePath: string): Promise<File> {
  const buf = await readFile(filePath);
  return new File([buf], filePath.split(/[/\\]/).pop() || 'review.json', {
    type: 'application/json',
  });
}

async function createAndExportImportRecord(sourceFileName: string) {
  resetStore();

  const level = makeLevel('review-level-1', 'Reviewer Level 1');
  setCell(level.grid, { x: 3, y: 2 }, { type: 'key', color: 'green', id: generateId() });
  setCell(level.grid, { x: 4, y: 2 }, { type: 'door', color: 'green', isOpen: false, id: generateId() });

  useGameStore.setState({
    pendingAllImportedLevels: [level],
    pendingFailedItems: [],
    pendingConflicts: [],
    pendingImportFileName: sourceFileName,
  });
  (useGameStore.getState() as any)._pendingFileMeta = { fileSize: 321, fileHash: `hash-${sourceFileName}` };

  const resolutions = new Map<string, ConflictResolution>();
  useGameStore.getState().resolveImportConflicts(resolutions);
  const record = useGameStore.getState().importHistory[0];

  const download = await captureDownload(() => useGameStore.getState().reExportImportResult(record.id));
  const filePath = await writeReviewerFile(download.download, download.text);

  return { filePath, download, record };
}

describe('reviewer-owned import-result verification', () => {
  beforeEach(() => {
    resetStore();
  });

  it('success chain: history re-export file can be re-imported and re-exported with stable level data', async () => {
    const first = await createAndExportImportRecord('reviewer-source.json');
    const firstParsed = JSON.parse(first.download.text);
    const reimported = await importLevelPack(await fileFromDisk(first.filePath));

    expect(reimported.validLevels).toHaveLength(1);
    expect(reimported.validLevels[0].id).toBe('review-level-1');
    expect(reimported.validLevels[0].grid[2][3].element?.type).toBe('key');
    expect(reimported.validLevels[0].grid[2][4].element?.type).toBe('door');

    resetStore();
    useGameStore.setState({
      pendingAllImportedLevels: reimported.validLevels,
      pendingFailedItems: [],
      pendingConflicts: [],
      pendingImportFileName: 'reviewer-reimport.json',
    });
    (useGameStore.getState() as any)._pendingFileMeta = { fileSize: first.download.text.length, fileHash: 'hash-second' };
    const secondResolutions = new Map<string, ConflictResolution>();
    useGameStore.getState().resolveImportConflicts(secondResolutions);
    const secondRecord = useGameStore.getState().importHistory[0];

    const second = await captureDownload(() => useGameStore.getState().reExportImportResult(secondRecord.id));
    const secondParsed = JSON.parse(second.text);

    expect(secondParsed.levels).toHaveLength(1);
    expect(JSON.stringify(secondParsed.levels)).toBe(JSON.stringify(firstParsed.levels));
  });

  it('failure chain: malformed JSON file is rejected by importLevelPack', async () => {
    const filePath = await writeReviewerFile('reviewer-invalid.json', '{not-json');
    await expect(importLevelPack(await fileFromDisk(filePath))).rejects.toThrow('文件格式错误或解析失败');
  });

  it('contract chain: history re-export should expose importedFrom/importDetails/levels at top level', async () => {
    const { download } = await createAndExportImportRecord('reviewer-source.json');
    const parsed = JSON.parse(download.text);

    expect(parsed.importedFrom).toBe('reviewer-source.json');
    expect(Array.isArray(parsed.importDetails)).toBe(true);
    expect(Array.isArray(parsed.levels)).toBe(true);
  });
});
