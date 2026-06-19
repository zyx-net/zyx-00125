import type { Level, SaveData, ImportLevelDetail } from '../types/game';
import { validateLevel } from '../game/rules';
import { generateId } from '../game/grid';

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
