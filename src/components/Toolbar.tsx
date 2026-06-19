import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { sampleLevels } from '../data/sampleLevels';
import type { CellType, Color } from '../types/game';

const colorOptions: { value: Color; label: string; color: string }[] = [
  { value: 'red', label: '红', color: 'bg-red-500' },
  { value: 'blue', label: '蓝', color: 'bg-blue-500' },
  { value: 'green', label: '绿', color: 'bg-green-500' },
  { value: 'yellow', label: '黄', color: 'bg-yellow-400' },
];

const toolOptions: { value: CellType | 'eraser'; label: string; icon: string }[] = [
  { value: 'wall', label: '墙壁', icon: '🧱' },
  { value: 'start', label: '起点', icon: '🚩' },
  { value: 'end', label: '终点', icon: '🏁' },
  { value: 'key', label: '钥匙', icon: '🔑' },
  { value: 'door', label: '门', icon: '🚪' },
  { value: 'mechanism', label: '机关', icon: '⚙️' },
  { value: 'eraser', label: '橡皮擦', icon: '🧹' },
];

export const Toolbar: React.FC = () => {
  const {
    mode,
    setMode,
    editorState,
    setEditorTool,
    setEditorColor,
    setGridSize,
    loadSampleLevel,
    loadLevel,
    saveLevel,
    saveGame,
    resetLevel,
    exportCurrentLevel,
    exportAllLevels,
    importLevels,
    exportCurrentSave,
    customLevels,
    savedGames,
    loadGame,
    showMessage,
  } = useGameStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveType, setSaveType] = useState<'level' | 'game'>('level');
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [showSaveSelect, setShowSaveSelect] = useState(false);
  const [width, setWidth] = useState(8);
  const [height, setHeight] = useState(6);

  const handleSave = () => {
    if (!saveName.trim()) {
      showMessage('❌ 请输入名称', 'error');
      return;
    }

    if (saveType === 'level') {
      const result = saveLevel(saveName);
      showMessage(result.message, result.success ? 'success' : 'error');
      if (result.success) {
        setShowSaveDialog(false);
        setSaveName('');
      }
    } else {
      saveGame(saveName);
      setShowSaveDialog(false);
      setSaveName('');
    }
  };

  const handleImport = async () => {
    const result = await importLevels();
    showMessage(result.message, result.success ? 'success' : 'error');
  };

  const handleResize = () => {
    if (width < 3 || width > 20 || height < 3 || height > 20) {
      showMessage('❌ 网格大小必须在 3-20 之间', 'error');
      return;
    }
    setGridSize(width, height);
  };

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm border-b border-gray-700 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-cyan-400 tracking-wider">
            🎮 解谜关卡编辑器
          </h1>
          
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'play'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setMode('play')}
            >
              🎮 游玩
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'edit'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setMode('edit')}
            >
              ✏️ 编辑
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all flex items-center gap-2"
              onClick={() => setShowLevelSelect(!showLevelSelect)}
            >
              📂 选择关卡
              <span className="text-xs">▼</span>
            </button>
            {showLevelSelect && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-48 max-h-60 overflow-y-auto">
                <div className="p-2 text-xs text-gray-400 border-b border-gray-700">
                  样例关卡
                </div>
                {sampleLevels.map((level) => (
                  <button
                    key={level.id}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 text-sm transition-all"
                    onClick={() => {
                      loadSampleLevel(level.id);
                      setShowLevelSelect(false);
                    }}
                  >
                    {level.name}
                  </button>
                ))}
                {customLevels.length > 0 && (
                  <>
                    <div className="p-2 text-xs text-gray-400 border-b border-gray-700 border-t border-gray-700">
                      自定义关卡
                    </div>
                    {customLevels.map((level) => (
                      <button
                        key={level.id}
                        className="w-full px-3 py-2 text-left hover:bg-gray-700 text-sm transition-all flex justify-between items-center"
                        onClick={() => {
                          loadLevel(level);
                          setShowLevelSelect(false);
                        }}
                      >
                        <span>{level.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all"
            onClick={() => setShowSaveDialog(true)}
          >
            💾 保存
          </button>

          <div className="relative">
            <button
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all flex items-center gap-2"
              onClick={() => setShowSaveSelect(!showSaveSelect)}
            >
              📁 读取存档
              <span className="text-xs">▼</span>
            </button>
            {showSaveSelect && savedGames.length > 0 && (
              <div className="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-48 max-h-60 overflow-y-auto">
                {savedGames.map((save) => (
                  <button
                    key={save.id}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 text-sm transition-all"
                    onClick={() => {
                      loadGame(save);
                      setShowSaveSelect(false);
                    }}
                  >
                    <div className="font-medium">{save.name}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(save.timestamp).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all"
            onClick={handleImport}
          >
            📥 导入
          </button>

          <button
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all"
            onClick={exportCurrentLevel}
          >
            📤 导出关卡
          </button>

          <button
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all"
            onClick={exportAllLevels}
          >
            📦 导出关卡包
          </button>

          <button
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all"
            onClick={exportCurrentSave}
          >
            📤 导出存档
          </button>

          <button
            className="px-3 py-2 bg-red-900/50 hover:bg-red-800/50 border border-red-700 rounded-lg text-sm transition-all"
            onClick={resetLevel}
          >
            🔄 重置
          </button>
        </div>
      </div>

      {mode === 'edit' && (
        <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">网格大小:</span>
            <input
              type="number"
              min="3"
              max="20"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value) || 8)}
              className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
            />
            <span className="text-gray-400">×</span>
            <input
              type="number"
              min="3"
              max="20"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value) || 6)}
              className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
            />
            <button
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-sm transition-all"
              onClick={handleResize}
            >
              应用
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">颜色:</span>
            <div className="flex gap-1">
              {colorOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    editorState.selectedColor === opt.value
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  } ${opt.color}`}
                  onClick={() => setEditorColor(opt.value)}
                  title={opt.label}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {toolOptions.map((tool) => (
              <button
                key={tool.value}
                className={`px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  editorState.selectedTool === tool.value
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={() => setEditorTool(tool.value)}
              >
                <span>{tool.icon}</span>
                <span className="hidden sm:inline">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-cyan-400">💾 保存</h3>
            
            <div className="flex gap-2 mb-4">
              <button
                className={`flex-1 py-2 rounded-lg transition-all ${
                  saveType === 'level'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={() => setSaveType('level')}
              >
                保存关卡
              </button>
              <button
                className={`flex-1 py-2 rounded-lg transition-all ${
                  saveType === 'game'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={() => setSaveType('game')}
              >
                保存进度
              </button>
            </div>

            <input
              type="text"
              placeholder="请输入名称..."
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg mb-4 focus:outline-none focus:border-cyan-500"
              autoFocus
            />

            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveName('');
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-all"
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
