import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { canUndo, canRedo } from '../game/history';

export const HistoryPanel: React.FC = () => {
  const {
    actionHistory,
    historyIndex,
    mode,
    undo,
    redo,
    resetLevel,
  } = useGameStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentHistory = { actions: actionHistory, currentIndex: historyIndex };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actionHistory.length, historyIndex]);

  if (mode === 'edit') {
    return null;
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700 p-4 shadow-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-cyan-400">📜 行动历史</h3>
        <div className="flex gap-1">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              canUndo(currentHistory)
                ? 'bg-gray-800 hover:bg-gray-700 active:scale-95'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
            }`}
            onClick={undo}
            disabled={!canUndo(currentHistory)}
            title="撤销 (Ctrl+Z)"
          >
            ↩️ 撤销
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              canRedo(currentHistory)
                ? 'bg-gray-800 hover:bg-gray-700 active:scale-95'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
            }`}
            onClick={redo}
            disabled={!canRedo(currentHistory)}
            title="重做 (Ctrl+Y)"
          >
            ↪️ 重做
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 max-h-64 pr-1 custom-scrollbar"
      >
        {actionHistory.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            暂无行动记录
          </div>
        ) : (
          actionHistory.map((action, index) => (
            <div
              key={action.id}
              className={`text-xs px-2 py-1.5 rounded-lg transition-all ${
                index === historyIndex
                  ? 'bg-cyan-900/50 border border-cyan-500/50 text-cyan-300'
                  : index < historyIndex
                  ? 'bg-gray-800/30 text-gray-400'
                  : 'bg-gray-800/10 text-gray-600'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono">
                  {String(index).padStart(2, '0')}
                </span>
                <span className="flex-1 mx-2 truncate">
                  {action.description}
                </span>
                <span className="text-gray-500 font-mono text-[10px]">
                  ({action.position.x},{action.position.y})
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700 flex gap-2">
        <div className="flex-1 text-xs text-gray-400">
          当前: {historyIndex + 1} / {actionHistory.length}
        </div>
        <button
          className="px-3 py-1 bg-red-900/50 hover:bg-red-800/50 border border-red-700 rounded-lg text-xs transition-all"
          onClick={resetLevel}
        >
          🔄 重置
        </button>
      </div>
    </div>
  );
};
