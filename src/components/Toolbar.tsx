import React, { useState, useMemo, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { sampleLevels } from '../data/sampleLevels';
import type { CellType, Color, ConflictResolution } from '../types/game';

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
    hasUnsavedDraft,
    draftUpdatedAt,
    isDraftRestored,
    allDraftIds,
    pendingConflicts,
    resolveImportConflicts,
    cancelPendingConflicts,
    discardCurrentDraft,
    currentLevel,
    undo,
    redo,
    editorHistory,
  } = useGameStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveType, setSaveType] = useState<'level' | 'game'>('level');
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [showSaveSelect, setShowSaveSelect] = useState(false);
  const [width, setWidth] = useState(8);
  const [height, setHeight] = useState(6);
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, ConflictResolution>>(new Map());

  useEffect(() => {
    if (pendingConflicts.length > 0) {
      const initial = new Map<string, ConflictResolution>();
      for (const c of pendingConflicts) {
        initial.set(c.incomingLevel.id, 'duplicate');
      }
      setConflictResolutions(initial);
    }
  }, [pendingConflicts]);

  const draftIdSet = useMemo(() => new Set(allDraftIds), [allDraftIds]);

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

  const handleConfirmConflicts = () => {
    const result = resolveImportConflicts(conflictResolutions);
    const parts: string[] = [];
    if (result.overwritten.length) parts.push(`覆盖 ${result.overwritten.length} 个`);
    if (result.duplicated.length) parts.push(`另存副本 ${result.duplicated.length} 个`);
    if (result.skipped.length) parts.push(`跳过 ${result.skipped.length} 个`);
    if (result.imported.length > 0) {
      showMessage(`✅ 导入完成：${parts.join('，')}，共导入 ${result.imported.length} 个关卡`, 'success');
    } else {
      showMessage(`ℹ️ 导入完成：${parts.join('，')}，未导入任何关卡`, 'info');
    }
    setConflictResolutions(new Map());
  };

  const handleSetAllResolutions = (res: ConflictResolution) => {
    const next = new Map<string, ConflictResolution>();
    for (const c of pendingConflicts) {
      next.set(c.incomingLevel.id, res);
    }
    setConflictResolutions(next);
  };

  const formatTime = (t: number | null) => {
    if (!t) return '';
    const d = new Date(t);
    const now = Date.now();
    const diff = Math.floor((now - t) / 1000);
    if (diff < 60) return `${diff} 秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    return d.toLocaleTimeString();
  };

  const canEditorUndo = editorHistory.currentIndex > 0;
  const canEditorRedo = editorHistory.currentIndex < editorHistory.snapshots.length - 1;

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

          {hasUnsavedDraft && (
            <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 border animate-pulse ${
              isDraftRestored
                ? 'bg-amber-900/40 text-amber-300 border-amber-600/60'
                : 'bg-orange-900/40 text-orange-300 border-orange-600/60'
            }`}
              title={draftUpdatedAt ? `上次修改：${new Date(draftUpdatedAt).toLocaleString()}` : ''}
            >
              <span>📝</span>
              <span>{isDraftRestored ? '草稿已恢复' : '草稿未保存'}</span>
              {draftUpdatedAt && <span className="opacity-70">· {formatTime(draftUpdatedAt)}</span>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'edit' && (
            <>
              <button
                className={`px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  canEditorUndo
                    ? 'bg-gray-800 hover:bg-gray-700'
                    : 'bg-gray-800/40 text-gray-500 cursor-not-allowed'
                }`}
                onClick={undo}
                disabled={!canEditorUndo}
                title="撤销编辑 (Ctrl+Z)"
              >
                ↩️ 撤销
              </button>
              <button
                className={`px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  canEditorRedo
                    ? 'bg-gray-800 hover:bg-gray-700'
                    : 'bg-gray-800/40 text-gray-500 cursor-not-allowed'
                }`}
                onClick={redo}
                disabled={!canEditorRedo}
                title="重做编辑 (Ctrl+Y)"
              >
                ↪️ 重做
              </button>
              {hasUnsavedDraft && (
                <button
                  className="px-3 py-2 bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/60 text-yellow-200 rounded-lg text-sm transition-all"
                  onClick={() => {
                    if (window.confirm('确定放弃当前草稿吗？未保存的编辑将丢失。')) {
                      discardCurrentDraft();
                    }
                  }}
                >
                  🗑️ 放弃草稿
                </button>
              )}
            </>
          )}

          <div className="relative">
            <button
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all flex items-center gap-2"
              onClick={() => setShowLevelSelect(!showLevelSelect)}
            >
              📂 选择关卡
              <span className="text-xs">▼</span>
            </button>
            {showLevelSelect && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-56 max-h-72 overflow-y-auto">
                <div className="p-2 text-xs text-gray-400 border-b border-gray-700">
                  样例关卡
                </div>
                {sampleLevels.map((level) => (
                  <button
                    key={level.id}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-700 text-sm transition-all ${
                      currentLevel.id === level.id ? 'bg-gray-700/60 border-l-2 border-cyan-500' : ''
                    }`}
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
                    {customLevels.map((level) => {
                      const hasDraft = draftIdSet.has(level.id);
                      return (
                        <button
                          key={level.id}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-700 text-sm transition-all flex justify-between items-center ${
                            currentLevel.id === level.id ? 'bg-gray-700/60 border-l-2 border-cyan-500' : ''
                          } ${hasDraft ? 'bg-orange-900/10' : ''}`}
                          onClick={() => {
                            loadLevel(level);
                            setShowLevelSelect(false);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span>{level.name}</span>
                            {hasDraft && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-700/50 text-orange-200 rounded border border-orange-600/50" title="有未保存的草稿">
                                草稿
                              </span>
                            )}
                          </span>
                          {currentLevel.id === level.id && <span className="text-cyan-400 text-xs">●</span>}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            className={`px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
              hasUnsavedDraft
                ? 'bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-500/30 text-white font-semibold'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
            onClick={() => {
              setSaveName(currentLevel.name && currentLevel.name !== '未命名关卡' ? currentLevel.name : '');
              setShowSaveDialog(true);
            }}
          >
            {hasUnsavedDraft ? '💾 保存草稿' : '💾 保存'}
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

            {saveType === 'level' && hasUnsavedDraft && (
              <div className="mb-4 p-3 bg-orange-900/30 border border-orange-700/50 rounded-lg text-sm text-orange-200">
                💡 保存成功后将自动清除草稿
              </div>
            )}

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

      {pendingConflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-bold mb-2 text-amber-400">⚠️ 导入冲突检测</h3>
            <p className="text-sm text-gray-300 mb-4">
              检测到 <span className="font-bold text-amber-300">{pendingConflicts.length}</span> 个关卡与现有内容冲突，请为每个冲突选择处理方式：
            </p>

            <div className="flex gap-2 mb-4 pb-4 border-b border-gray-700">
              <button
                className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800/60 text-red-200 border border-red-700/60 rounded transition-all"
                onClick={() => handleSetAllResolutions('cancel')}
              >
                全部取消
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-blue-900/50 hover:bg-blue-800/60 text-blue-200 border border-blue-700/60 rounded transition-all"
                onClick={() => handleSetAllResolutions('duplicate')}
              >
                全部另存副本
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-orange-900/50 hover:bg-orange-800/60 text-orange-200 border border-orange-700/60 rounded transition-all"
                onClick={() => handleSetAllResolutions('overwrite')}
              >
                全部覆盖
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-2 space-y-3">
              {pendingConflicts.map((c) => {
                const res = conflictResolutions.get(c.incomingLevel.id) || 'duplicate';
                const conflictLabel = c.conflictType === 'both' ? 'ID 和名称' : c.conflictType === 'id' ? 'ID' : '名称';
                return (
                  <div key={c.incomingLevel.id} className="p-4 bg-gray-800/60 border border-gray-700 rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{c.incomingLevel.name || '未命名关卡'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-700/40 text-amber-200 rounded border border-amber-600/40">
                            {conflictLabel}冲突
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          尺寸 {c.incomingLevel.width}×{c.incomingLevel.height}
                          {c.existingLevel && (
                            <span className="ml-2">
                              → 现有: <span className="text-cyan-300">{c.existingLevel.name}</span>
                              {' '}({c.existingLevel.width}×{c.existingLevel.height})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all border ${
                          res === 'overwrite'
                            ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-500/30'
                            : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 text-gray-200'
                        }`}
                        onClick={() => {
                          const next = new Map(conflictResolutions);
                          next.set(c.incomingLevel.id, 'overwrite');
                          setConflictResolutions(next);
                        }}
                      >
                        ⚠️ 覆盖原关卡
                      </button>
                      <button
                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all border ${
                          res === 'duplicate'
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 text-gray-200'
                        }`}
                        onClick={() => {
                          const next = new Map(conflictResolutions);
                          next.set(c.incomingLevel.id, 'duplicate');
                          setConflictResolutions(next);
                        }}
                      >
                        📄 另存副本
                      </button>
                      <button
                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all border ${
                          res === 'cancel'
                            ? 'bg-gray-600 border-gray-500 text-white'
                            : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 text-gray-200'
                        }`}
                        onClick={() => {
                          const next = new Map(conflictResolutions);
                          next.set(c.incomingLevel.id, 'cancel');
                          setConflictResolutions(next);
                        }}
                      >
                        ❌ 取消导入
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all"
                onClick={cancelPendingConflicts}
              >
                全部取消
              </button>
              <button
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-all font-semibold"
                onClick={handleConfirmConflicts}
              >
                确认导入 ({Array.from(conflictResolutions.values()).filter(r => r !== 'cancel').length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
