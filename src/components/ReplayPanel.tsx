import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import type { ReplayRecord } from '../types/game';
import { sampleLevels } from '../data/sampleLevels';
import { canSaveReplay } from '../game/replay';

export const ReplayPanel: React.FC = () => {
  const {
    mode,
    replays,
    playbackState,
    currentLevel,
    customLevels,
    replayFilter,
    setReplayFilter,
    startReplayPlayback,
    stepReplayForward,
    stepReplayBackward,
    pauseReplay,
    resumeReplay,
    setReplaySpeed,
    jumpToReplayStep,
    cancelReplayPlayback,
    applyReplayToLevel,
    deleteReplay,
    exportReplay,
    exportAllReplays,
    currentReplayCompatibility,
    checkReplayCompatibility,
    showMessage,
    importReplays,
    saveReplay,
    gameState,
    actionHistory,
  } = useGameStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const currentPlayback = useMemo(() => {
    if (!playbackState.replayId) return null;
    return replays.find(r => r.id === playbackState.replayId) || null;
  }, [playbackState.replayId, replays]);

  const filteredReplays = useMemo(() => {
    const list = replayFilter
      ? replays.filter(r => r.levelId === replayFilter)
      : replays;
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [replays, replayFilter]);

  const allLevels = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of sampleLevels) map.set(l.id, l.name);
    for (const l of customLevels) map.set(l.id, l.name);
    for (const r of replays) {
      if (!map.has(r.levelId)) map.set(r.levelId, r.levelName);
    }
    return Array.from(map.entries());
  }, [customLevels, replays]);

  useEffect(() => {
    if (playbackState.status === 'playing' && currentPlayback) {
      const interval = 1000 / playbackState.speed;
      intervalRef.current = setInterval(() => {
        const { playbackState: ps } = useGameStore.getState();
        if (ps.status !== 'playing') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        if (ps.currentStep >= ps.totalSteps) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          pauseReplay();
          return;
        }
        stepReplayForward();
      }, interval);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [playbackState.status, playbackState.speed, currentPlayback, stepReplayForward, pauseReplay]);

  if (mode === 'edit') return null;

  const handleSave = () => {
    if (!saveName.trim()) {
      showMessage('❌ 请输入回放名称', 'error');
      return;
    }
    const result = saveReplay(saveName.trim());
    showMessage(result.message, result.success ? 'success' : 'error');
    if (result.success) {
      setShowSaveDialog(false);
      setSaveName('');
    }
  };

  const handleStartPlayback = (replay: ReplayRecord) => {
    checkReplayCompatibility(replay.id);
    const result = startReplayPlayback(replay.id);
    showMessage(result.message, result.success ? 'info' : 'error');
  };

  const handleApply = (replay: ReplayRecord) => {
    const result = applyReplayToLevel(replay.id);
    showMessage(result.message, result.success ? 'success' : 'error');
  };

  const handleImport = async () => {
    const result = await importReplays();
    if (!result.success) {
      showMessage(result.message, 'error');
    }
  };

  const saveReplayCheck = useMemo(
    () => canSaveReplay(gameState, actionHistory, mode),
    [gameState, actionHistory, mode],
  );

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700 p-4 shadow-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-purple-400">🎬 解法回放</h3>
        <div className="flex gap-1">
          <button
            className={`px-2 py-1 rounded-lg text-xs transition-all ${
              saveReplayCheck.allowed
                ? 'bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700/50 text-purple-200'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
            }`}
            onClick={() => {
              setSaveName(`${currentLevel.name}-${new Date().toLocaleDateString()}`);
              setShowSaveDialog(true);
            }}
            disabled={!saveReplayCheck.allowed}
            title={!saveReplayCheck.allowed ? saveReplayCheck.reason : '保存当前行动历史为回放'}
          >
            💾 保存
          </button>
          <button
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-all"
            onClick={handleImport}
            title="导入回放 JSON 文件"
          >
            📥 导入
          </button>
          <button
            className={`px-2 py-1 rounded-lg text-xs transition-all ${
              replays.length > 0
                ? 'bg-gray-800 hover:bg-gray-700'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
            }`}
            onClick={exportAllReplays}
            disabled={replays.length === 0}
            title="导出所有回放为 JSON"
          >
            📦 导出全部
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[120px]">
          <select
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs focus:outline-none focus:border-purple-500"
            value={replayFilter || ''}
            onChange={(e) => setReplayFilter(e.target.value || null)}
          >
            <option value="">全部历史 ({replays.length})</option>
            <optgroup label="按关卡筛选">
              {allLevels.map(([id, name]) => {
                const count = replays.filter(r => r.levelId === id).length;
                return (
                  <option key={id} value={id}>
                    {name || id.slice(0, 8)} ({count})
                  </option>
                );
              })}
            </optgroup>
          </select>
        </div>
        {replayFilter && (
          <button
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            onClick={() => setReplayFilter(null)}
          >
            ✕ 清除筛选
          </button>
        )}
      </div>

      {currentPlayback && (
        <div className="mb-3 p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <div className="text-sm font-semibold text-purple-200 truncate">
              ▶ {currentPlayback.name}
            </div>
            <div className="text-xs text-purple-300 font-mono">
              {playbackState.currentStep} / {playbackState.totalSteps}
            </div>
          </div>

          {currentReplayCompatibility && currentReplayCompatibility.status === 'view-only' && (
            <div className="text-[11px] text-amber-300 bg-amber-900/30 px-2 py-1 rounded border border-amber-700/50">
              ⚠️ {currentReplayCompatibility.reason}，仅查看步骤
              {currentReplayCompatibility.differences?.slice(0, 1).map((d, i) => (
                <div key={i} className="opacity-80">· {d}</div>
              ))}
            </div>
          )}

          <input
            type="range"
            min={0}
            max={playbackState.totalSteps}
            value={playbackState.currentStep}
            onChange={(e) => jumpToReplayStep(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />

          <div className="flex gap-1 items-center justify-between flex-wrap">
            <div className="flex gap-1">
              <button
                className="w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded text-xs"
                onClick={stepReplayBackward}
                title="上一步"
              >
                ⏮
              </button>
              {playbackState.status === 'playing' ? (
                <button
                  className="w-7 h-7 bg-purple-700 hover:bg-purple-600 rounded text-xs"
                  onClick={pauseReplay}
                  title="暂停"
                >
                  ⏸
                </button>
              ) : (
                <button
                  className={`w-7 h-7 rounded text-xs ${
                    playbackState.currentStep >= playbackState.totalSteps
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                  onClick={resumeReplay}
                  disabled={playbackState.currentStep >= playbackState.totalSteps}
                  title="播放"
                >
                  ▶
                </button>
              )}
              <button
                className={`w-7 h-7 rounded text-xs ${
                  playbackState.currentStep >= playbackState.totalSteps
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={stepReplayForward}
                disabled={playbackState.currentStep >= playbackState.totalSteps}
                title="下一步"
              >
                ⏭
              </button>
            </div>

            <select
              className="px-1.5 py-1 bg-gray-800 border border-gray-600 rounded text-xs"
              value={playbackState.speed}
              onChange={(e) => setReplaySpeed(parseFloat(e.target.value))}
            >
              <option value="0.25">0.25×</option>
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>

            <button
              className="px-2 py-1 bg-red-900/50 hover:bg-red-800/50 border border-red-700/50 rounded text-xs"
              onClick={cancelReplayPlayback}
              title="取消回放，恢复原状态"
            >
              ❌ 取消
            </button>
          </div>

          {playbackState.status === 'finished' && (
            <div className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded border border-green-700/50 text-center">
              🎉 播放完成
            </div>
          )}
        </div>
      )}

      <div
        ref={listScrollRef}
        className="flex-1 overflow-y-auto space-y-1.5 max-h-[280px] pr-1 custom-scrollbar"
      >
        {filteredReplays.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {replays.length === 0
              ? '暂无回放记录\n通关后才能保存攻略记录'
              : '当前关卡下没有回放记录'}
          </div>
        ) : (
          filteredReplays.map((replay) => {
            const isExpanded = expandedId === replay.id;
            const isCurrentLevel = replay.levelId === currentLevel.id;
            const compat = replay.levelId === currentLevel.id
              ? checkReplayCompatibility(replay.id)
              : null;
            return (
              <div
                key={replay.id}
                className={`rounded-lg border transition-all overflow-hidden ${
                  isCurrentLevel
                    ? 'bg-purple-900/20 border-purple-700/40'
                    : 'bg-gray-800/30 border-gray-700/50'
                }`}
              >
                <div
                  className="p-2 cursor-pointer hover:bg-gray-800/50 transition-all"
                  onClick={() => setExpandedId(isExpanded ? null : replay.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={`flex-shrink-0 text-xs ${isExpanded ? 'rotate-90' : ''} transition-transform text-gray-500`}>
                        ▶
                      </span>
                      <span className="font-medium text-sm truncate text-gray-200">
                        {replay.name}
                      </span>
                      {replay.isWin && (
                        <span className="flex-shrink-0 text-[10px] px-1 py-0.5 bg-green-900/50 text-green-300 rounded border border-green-700/50">
                          通关
                        </span>
                      )}
                      {!replay.isWin && (
                        <span className="flex-shrink-0 text-[10px] px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded border border-gray-600/50">
                          未通关
                        </span>
                      )}
                      {isCurrentLevel && compat?.status === 'view-only' && (
                        <span className="flex-shrink-0 text-[10px] px-1 py-0.5 bg-amber-900/50 text-amber-300 rounded border border-amber-700/50" title={compat.reason}>
                          仅查看
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-mono flex-shrink-0">
                      {replay.steps}步
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="truncate" title={replay.levelName}>
                      📂 {replay.levelName || replay.levelId.slice(0, 8)}
                    </span>
                    <span className="flex-shrink-0">·</span>
                    <span className="flex-shrink-0">
                      {new Date(replay.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-700/50 bg-gray-900/50 p-2 space-y-2">
                    {replay.keySteps.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-[11px] text-gray-500 font-medium">🔑 关键步骤</div>
                        <div className="space-y-0.5 max-h-20 overflow-y-auto pr-1">
                          {replay.keySteps.map((ks, i) => (
                            <div
                              key={i}
                              className="text-[11px] px-1.5 py-0.5 bg-gray-800/50 rounded text-gray-400 flex justify-between gap-2"
                            >
                              <span className="truncate">
                                <span className="text-purple-400 font-mono mr-1">#{ks.actionIndex}</span>
                                {ks.description}
                              </span>
                              <span className="text-gray-500 text-[10px] flex-shrink-0">
                                {ks.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-1 flex-wrap pt-1">
                      <button
                        className="px-2 py-1 bg-purple-700/60 hover:bg-purple-600 rounded text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartPlayback(replay);
                        }}
                      >
                        ▶ 播放
                      </button>
                      <button
                        className={`px-2 py-1 rounded text-xs ${
                          isCurrentLevel && compat?.status === 'compatible'
                            ? 'bg-cyan-700/60 hover:bg-cyan-600'
                            : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCurrentLevel && compat?.status === 'compatible') {
                            handleApply(replay);
                          }
                        }}
                        disabled={!isCurrentLevel || compat?.status !== 'compatible'}
                        title={
                          !isCurrentLevel
                            ? '请先切换到对应关卡'
                            : compat?.status === 'view-only'
                            ? '关卡已被编辑，无法安全套用'
                            : '一键套用解法到当前关卡'
                        }
                      >
                        ⚡ 套用
                      </button>
                      <button
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportReplay(replay.id);
                        }}
                      >
                        📤 导出
                      </button>
                      <button
                        className="px-2 py-1 bg-red-900/40 hover:bg-red-800/40 border border-red-700/40 rounded text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`确定删除回放"${replay.name}"吗？`)) {
                            deleteReplay(replay.id);
                            setExpandedId(null);
                          }
                        }}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-purple-400">💾 保存解法回放</h3>
            <input
              type="text"
              placeholder="请输入回放名称..."
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg mb-4 focus:outline-none focus:border-purple-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <div className="text-xs text-gray-400 mb-4 space-y-1">
              <p>📂 关卡：{currentLevel.name}</p>
              <p>📊 步数：{Math.max(0, actionHistory.length - 1)}</p>
              <p>🎯 结果：{gameState.isWin ? '✅ 已通关' : '⏳ 未通关'}</p>
            </div>
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
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-all font-semibold"
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
