import React, { useState, useMemo, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { sampleLevels } from '../data/sampleLevels';
import type { CellType, Color, ConflictResolution, ImportConflict, ImportLevelDetail } from '../types/game';

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

function usePreviewStats(
  allLevels: { id: string }[],
  conflicts: ImportConflict[],
  resolutions: Map<string, ConflictResolution>,
) {
  return useMemo(() => {
    const conflictIds = new Set(conflicts.map(c => c.incomingLevel.id));
    let newCount = 0;
    let overwriteCount = 0;
    let duplicateCount = 0;
    let skipCount = 0;
    for (const lv of allLevels) {
      if (!conflictIds.has(lv.id)) {
        newCount++;
      } else {
        const res = resolutions.get(lv.id) || 'duplicate';
        if (res === 'overwrite') overwriteCount++;
        else if (res === 'duplicate') duplicateCount++;
        else skipCount++;
      }
    }
    return { newCount, overwriteCount, duplicateCount, skipCount };
  }, [allLevels, conflicts, resolutions]);
}

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
    pendingAllImportedLevels,
    pendingImportFileName,
    resolveImportConflicts,
    cancelPendingConflicts,
    discardCurrentDraft,
    currentLevel,
    undo,
    redo,
    editorHistory,
    importHistory,
    clearImportHistory,
  } = useGameStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveType, setSaveType] = useState<'level' | 'game'>('level');
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [showSaveSelect, setShowSaveSelect] = useState(false);
  const [width, setWidth] = useState(8);
  const [height, setHeight] = useState(6);
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, ConflictResolution>>(new Map());
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const showImportPreview = pendingAllImportedLevels.length > 0;

  useEffect(() => {
    if (showImportPreview) {
      const initial = new Map<string, ConflictResolution>();
      for (const c of pendingConflicts) {
        initial.set(c.incomingLevel.id, 'duplicate');
      }
      setConflictResolutions(initial);
    }
  }, [showImportPreview, pendingConflicts]);

  const previewStats = usePreviewStats(pendingAllImportedLevels, pendingConflicts, conflictResolutions);

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
    if (!result.success) {
      showMessage(result.message, 'error');
    }
  };

  const handleResize = () => {
    if (width < 3 || width > 20 || height < 3 || height > 20) {
      showMessage('❌ 网格大小必须在 3-20 之间', 'error');
      return;
    }
    setGridSize(width, height);
  };

  const handleConfirmImport = () => {
    const result = resolveImportConflicts(conflictResolutions);
    const parts: string[] = [];
    const newResult = result.imported.length - result.overwritten.length - result.duplicated.length;
    if (newResult > 0) parts.push(`新增 ${newResult} 个`);
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

  const conflictIdSet = useMemo(() => new Set(pendingConflicts.map(c => c.incomingLevel.id)), [pendingConflicts]);
  const nonConflictLevels = useMemo(() => pendingAllImportedLevels.filter(l => !conflictIdSet.has(l.id)), [pendingAllImportedLevels, conflictIdSet]);

  const totalWillImport = previewStats.newCount + previewStats.overwriteCount + previewStats.duplicateCount;

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
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all relative"
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

      {importHistory.length > 0 && !showImportPreview && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <button
            className="text-xs text-gray-400 hover:text-gray-200 transition-all flex items-center gap-1"
            onClick={() => setShowImportHistory(!showImportHistory)}
          >
            📋 导入记录 ({importHistory.length})
            <span className={`transition-transform ${showImportHistory ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showImportHistory && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {importHistory.map((rec) => {
                const isExpanded = expandedHistoryId === rec.id;
                const hasDetails = rec.levelDetails && rec.levelDetails.length > 0;
                return (
                  <div key={rec.id} className="bg-gray-800/40 rounded overflow-hidden">
                    <div
                      className={`flex items-center gap-3 text-xs px-3 py-2 cursor-pointer hover:bg-gray-800/60 transition-all ${
                        hasDetails ? '' : 'cursor-default'
                      }`}
                      onClick={() => {
                        if (hasDetails) {
                          setExpandedHistoryId(isExpanded ? null : rec.id);
                        }
                      }}
                    >
                      {hasDetails && (
                        <span className={`text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                      )}
                      <span className="text-gray-300 font-mono truncate max-w-[160px] flex-shrink-0" title={rec.fileName}>
                        {rec.fileName}
                      </span>
                      <span className="text-gray-500 flex-shrink-0">
                        {new Date(rec.timestamp).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {rec.failedCount > 0 ? (
                          <span className="text-red-400">失败 {rec.failedCount}</span>
                        ) : (
                          <>
                            {rec.newCount > 0 && <span className="text-green-400">+{rec.newCount}</span>}
                            {rec.overwrittenCount > 0 && <span className="text-orange-400">↑{rec.overwrittenCount}</span>}
                            {rec.duplicatedCount > 0 && <span className="text-blue-400">⊂{rec.duplicatedCount}</span>}
                            {rec.skippedCount > 0 && <span className="text-gray-500">⊘{rec.skippedCount}</span>}
                          </>
                        )}
                      </span>
                      {rec.failureReasons.length > 0 && (
                        <span className="text-red-300/70 truncate max-w-[200px]" title={rec.failureReasons.join('; ')}>
                          {rec.failureReasons[0]}
                        </span>
                      )}
                    </div>
                    {isExpanded && hasDetails && (
                      <div className="border-t border-gray-700/50 bg-gray-900/40 px-3 py-2 space-y-1">
                        {rec.levelDetails.map((d: ImportLevelDetail, idx: number) => {
                          const outcomeMap: Record<string, { label: string; cls: string }> = {
                            new: { label: '新增', cls: 'bg-green-900/40 text-green-300 border-green-700/50' },
                            overwritten: { label: '覆盖', cls: 'bg-orange-900/40 text-orange-300 border-orange-700/50' },
                            duplicated: { label: '另存副本', cls: 'bg-blue-900/40 text-blue-300 border-blue-700/50' },
                            skipped: { label: '跳过', cls: 'bg-gray-700/40 text-gray-400 border-gray-600/50' },
                            failed: { label: '失败', cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
                          };
                          const o = outcomeMap[d.outcome];
                          return (
                            <div key={idx} className="flex items-start gap-2 text-[11px] py-1">
                              <span className={`px-1.5 py-0.5 rounded border flex-shrink-0 ${o.cls}`}>
                                {o.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-300 truncate" title={d.levelName}>
                                  {d.levelName}
                                  <span className="text-gray-500 ml-1">({d.levelId === '__file__' ? '文件级错误' : d.levelId.slice(0, 12) + '…'})</span>
                                </div>
                                {d.outcome === 'overwritten' && d.existingLevelName && (
                                  <div className="text-orange-400/70 text-[10px]">
                                    → 覆盖已有：{d.existingLevelName}
                                    {d.conflictType && <span className="text-gray-500 ml-1">（{d.conflictType === 'both' ? 'ID+名称' : d.conflictType}冲突）</span>}
                                  </div>
                                )}
                                {d.outcome === 'duplicated' && d.newLevelName && (
                                  <div className="text-blue-400/70 text-[10px]">
                                    → 另存为：{d.newLevelName}
                                  </div>
                                )}
                                {d.outcome === 'skipped' && d.conflictType && (
                                  <div className="text-gray-500 text-[10px]">
                                    冲突类型：{d.conflictType === 'both' ? 'ID+名称' : d.conflictType}
                                  </div>
                                )}
                                {d.outcome === 'failed' && d.failureReason && (
                                  <div className="text-red-400/80 text-[10px]">
                                    原因：{d.failureReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-all mt-1"
                onClick={() => {
                  if (window.confirm('确定清空导入记录吗？')) {
                    clearImportHistory();
                    setExpandedHistoryId(null);
                  }
                }}
              >
                清空记录
              </button>
            </div>
          )}
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

      {showImportPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-[100] p-0 sm:p-4">
          <div className="bg-gray-900 border sm:border border-gray-700 sm:rounded-xl w-full sm:w-full sm:max-w-2xl shadow-2xl flex flex-col min-h-0 sm:max-h-[92vh]">
            <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-cyan-400 flex-shrink-0">📥 导入预览</h3>
              <span className="text-xs text-gray-500 font-mono truncate" title={pendingImportFileName}>
                {pendingImportFileName}
              </span>
            </div>

            <div className="sticky top-[52px] sm:top-[57px] z-[5] bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50 px-4 sm:px-6 py-3 flex-shrink-0">
              <div className="flex flex-wrap gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-800/60 rounded-lg border border-gray-700">
                {previewStats.newCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-green-300 font-medium">将新增 {previewStats.newCount}</span>
                  </div>
                )}
                {previewStats.overwriteCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-orange-300 font-medium">将覆盖 {previewStats.overwriteCount}</span>
                  </div>
                )}
                {previewStats.duplicateCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-blue-300 font-medium">将另存副本 {previewStats.duplicateCount}</span>
                  </div>
                )}
                {previewStats.skipCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-gray-400 font-medium">将跳过 {previewStats.skipCount}</span>
                  </div>
                )}
              </div>

              {pendingConflicts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-gray-700/50 items-center">
                  <span className="text-[11px] sm:text-xs text-gray-400 mr-1">批量:</span>
                  <button
                    className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs bg-orange-900/50 hover:bg-orange-800/60 active:bg-orange-700/60 text-orange-200 border border-orange-700/60 rounded transition-all flex-shrink-0"
                    onClick={() => handleSetAllResolutions('overwrite')}
                  >
                    全部覆盖
                  </button>
                  <button
                    className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs bg-blue-900/50 hover:bg-blue-800/60 active:bg-blue-700/60 text-blue-200 border border-blue-700/60 rounded transition-all flex-shrink-0"
                    onClick={() => handleSetAllResolutions('duplicate')}
                  >
                    全部另存副本
                  </button>
                  <button
                    className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs bg-gray-700/50 hover:bg-gray-600/60 active:bg-gray-500/60 text-gray-300 border border-gray-600/60 rounded transition-all flex-shrink-0"
                    onClick={() => handleSetAllResolutions('cancel')}
                  >
                    全部跳过
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-3 sm:py-4 min-h-0 space-y-2">
              {nonConflictLevels.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] sm:text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider sticky top-0 bg-gray-900/90 py-1">新增关卡</div>
                  {nonConflictLevels.map((lv) => (
                    <div key={lv.id} className="p-2.5 sm:p-3 bg-green-900/20 border border-green-800/40 rounded-lg mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-green-400 text-sm">✅</span>
                        <span className="font-medium text-green-200 text-sm">{lv.name || '未命名关卡'}</span>
                        <span className="text-[10px] text-green-500/70 bg-green-900/40 px-1.5 py-0.5 rounded flex-shrink-0">将新增</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 ml-6">
                        ID: {lv.id.slice(0, 14)}… · 尺寸 {lv.width}×{lv.height}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingConflicts.length > 0 && (
                <div>
                  <div className="text-[11px] sm:text-xs text-amber-500/80 mb-2 font-medium uppercase tracking-wider sticky top-0 bg-gray-900/90 py-1">冲突关卡</div>
                  {pendingConflicts.map((c) => {
                    const res = conflictResolutions.get(c.incomingLevel.id) || 'duplicate';
                    const conflictLabel = c.conflictType === 'both' ? 'ID 和名称' : c.conflictType === 'id' ? 'ID' : '名称';
                    return (
                      <div key={c.incomingLevel.id} className="p-2.5 sm:p-3 bg-gray-800/60 border border-gray-700 rounded-lg mb-2">
                        <div className="flex justify-between items-start mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white flex items-center gap-2 text-sm flex-wrap">
                              <span className="truncate">{c.incomingLevel.name || '未命名关卡'}</span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-amber-700/40 text-amber-200 rounded border border-amber-600/40 flex-shrink-0">
                                {conflictLabel}冲突
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              尺寸 {c.incomingLevel.width}×{c.incomingLevel.height}
                              {c.existingLevel && (
                                <span className="ml-2 block sm:inline">
                                  → 现有: <span className="text-cyan-300">{c.existingLevel.name}</span>
                                  {' '}({c.existingLevel.width}×{c.existingLevel.height})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            className={`flex-1 px-2 py-1.5 rounded text-[11px] sm:text-xs transition-all border ${
                              res === 'overwrite'
                                ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-500/30'
                                : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 active:bg-gray-600 text-gray-200'
                            }`}
                            onClick={() => {
                              const next = new Map(conflictResolutions);
                              next.set(c.incomingLevel.id, 'overwrite');
                              setConflictResolutions(next);
                            }}
                          >
                            ⚠️ 覆盖
                          </button>
                          <button
                            className={`flex-1 px-2 py-1.5 rounded text-[11px] sm:text-xs transition-all border ${
                              res === 'duplicate'
                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
                                : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 active:bg-gray-600 text-gray-200'
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
                            className={`flex-1 px-2 py-1.5 rounded text-[11px] sm:text-xs transition-all border ${
                              res === 'cancel'
                                ? 'bg-gray-600 border-gray-500 text-white'
                                : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700 active:bg-gray-600 text-gray-200'
                            }`}
                            onClick={() => {
                              const next = new Map(conflictResolutions);
                              next.set(c.incomingLevel.id, 'cancel');
                              setConflictResolutions(next);
                            }}
                          >
                            ❌ 跳过
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.4)]">
              <span className="text-xs sm:text-sm text-gray-400 text-center sm:text-left">
                共 {pendingAllImportedLevels.length} 个关卡，将导入 {totalWillImport} 个
              </span>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg transition-all text-sm"
                  onClick={() => {
                    cancelPendingConflicts();
                    setConflictResolutions(new Map());
                  }}
                >
                  取消导入
                </button>
                <button
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg transition-all font-semibold text-sm ${
                    totalWillImport > 0
                      ? 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400 text-white shadow-lg shadow-cyan-500/20'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={totalWillImport > 0 ? handleConfirmImport : undefined}
                  disabled={totalWillImport === 0}
                >
                  确认导入 ({totalWillImport})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
