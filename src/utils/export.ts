import type {
  Level, SaveData, ImportLevelDetail, ReplayRecord, ReplayImportDetail,
  ReplayImportFailedItem, ReplayImportConflict,
} from '../types/game';
import { validateLevel } from '../game/rules';
import { generateId } from '../game/grid';
import { validateReplayPack } from '../game/replay';

export interface ImportPackResult {
  validLevels: Level[];
  failedItems: Array<{
    levelData: unknown;
    levelName: string;
    levelId: string;
    reason: string;
  }>;
}

export function exportLevel(level: Level): void {
  const data = JSON.stringify(level, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (level.name || 'level').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `${safeName}-${level.id || 'level'}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLevelPack(levels: Level[], name: string = 'level-pack'): void {
  const pack = {
    name,
    version: '1.0',
    exportedAt: new Date().toISOString(),
    levels,
  };
  const data = JSON.stringify(pack, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSaveData(saveData: SaveData): void {
  const data = JSON.stringify(saveData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `save-${saveData.name || Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importLevel(file: File): Promise<Level> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const level = JSON.parse(content);
        const validation = validateLevel(level);
        if (!validation.valid) {
          reject(new Error(validation.message));
          return;
        }
        resolve(level);
      } catch {
        reject(new Error('文件格式错误或解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function importLevelPack(file: File): Promise<ImportPackResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const pack = JSON.parse(content);
        const result: ImportPackResult = {
          validLevels: [],
          failedItems: [],
        };

        if (pack.levels && Array.isArray(pack.levels)) {
          for (let i = 0; i < pack.levels.length; i++) {
            const level = pack.levels[i];
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
          if (result.validLevels.length > 0 || result.failedItems.length > 0) {
            resolve(result);
          } else {
            reject(new Error('关卡包中没有有效的关卡'));
          }
        } else {
          const validation = validateLevel(pack);
          if (validation.valid) {
            result.validLevels.push(pack);
            resolve(result);
          } else {
            result.failedItems.push({
              levelData: pack,
              levelName: pack?.name || '未知关卡',
              levelId: pack?.id || `failed-${generateId()}`,
              reason: validation.message || '关卡验证失败',
            });
            resolve(result);
          }
        }
      } catch {
        reject(new Error('文件格式错误或解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function triggerFileInput(accept: string, onFileSelected: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      onFileSelected(file);
    }
    document.body.removeChild(input);
  };
  document.body.appendChild(input);
  input.click();
}

export function exportImportResult(
  levels: Level[],
  record: { fileName: string; timestamp: number; levelDetails: ImportLevelDetail[] },
): void {
  const pack = {
    name: `imported-from-${record.fileName.replace('.json', '')}`,
    version: '1.0',
    exportedAt: new Date().toISOString(),
    importedFrom: record.fileName,
    importedAt: record.timestamp,
    importDetails: record.levelDetails,
    levels,
  };
  const data = JSON.stringify(pack, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = record.fileName.replace('.json', '').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `import-result-${safeName}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportImportRecordAsJson(
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
): void {
  const exportData = {
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
  const data = JSON.stringify(exportData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = record.fileName.replace('.json', '').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `import-result-${safeName}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReplay(replay: ReplayRecord): void {
  const pack = {
    exportType: 'replay',
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    replays: [replay],
  };
  const data = JSON.stringify(pack, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (replay.name || 'replay').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `replay-${safeName}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReplayPack(
  replays: ReplayRecord[],
  name: string = 'replay-pack'
): void {
  const pack = {
    exportType: 'replay-pack',
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    name,
    replays,
  };
  const data = JSON.stringify(pack, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = name.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `${safeName}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReplayImportRecordAsJson(
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
    replayDetails: ReplayImportDetail[];
  },
  replays: ReplayRecord[],
): void {
  const exportData = {
    exportType: 'replay-import-result',
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
    replayDetails: record.replayDetails,
    replays,
  };
  const data = JSON.stringify(exportData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = record.fileName.replace('.json', '').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  a.download = `replay-import-result-${safeName}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportReplayPackResult {
  validReplays: ReplayRecord[];
  failedItems: ReplayImportFailedItem[];
}

export function importReplayPack(file: File): Promise<ImportReplayPackResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const pack = JSON.parse(content);
        const verified = validateReplayPack(pack);

        if (verified.replays.length > 0 || verified.failedItems.length > 0) {
          resolve({
            validReplays: verified.replays,
            failedItems: verified.failedItems as ReplayImportFailedItem[],
          });
        } else {
          reject(new Error('回放包中没有有效的回放记录'));
        }
      } catch {
        reject(new Error('文件格式错误或解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function detectReplayConflicts(
  incoming: ReplayRecord[],
  existing: ReplayRecord[]
): ReplayImportConflict[] {
  const conflicts: ReplayImportConflict[] = [];
  for (const replay of incoming) {
    const byId = existing.find(r => r.id === replay.id);
    const byName = existing.find(r => r.name === replay.name);
    if (byId && byName && byId.id === byName.id) {
      conflicts.push({ incomingReplay: replay, existingReplay: byId, conflictType: 'both' });
    } else if (byId) {
      conflicts.push({ incomingReplay: replay, existingReplay: byId, conflictType: 'id' });
    } else if (byName) {
      conflicts.push({ incomingReplay: replay, existingReplay: byName, conflictType: 'name' });
    }
  }
  return conflicts;
}
