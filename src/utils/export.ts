import type { Level, SaveData } from '../types/game';
import { validateLevel } from '../game/rules';

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

export function importLevelPack(file: File): Promise<Level[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const pack = JSON.parse(content);
        
        if (pack.levels && Array.isArray(pack.levels)) {
          const validLevels: Level[] = [];
          for (const level of pack.levels) {
            const validation = validateLevel(level);
            if (validation.valid) {
              validLevels.push(level);
            }
          }
          if (validLevels.length > 0) {
            resolve(validLevels);
          } else {
            reject(new Error('关卡包中没有有效的关卡'));
          }
        } else {
          const validation = validateLevel(pack);
          if (validation.valid) {
            resolve([pack]);
          } else {
            reject(new Error(validation.message));
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
