import React, { useEffect, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { Grid } from './components/Grid';
import { StatusPanel } from './components/StatusPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { Controls } from './components/Controls';
import { useGameStore } from './store/useGameStore';
import type { Direction } from './types/game';

const App: React.FC = () => {
  const {
    mode,
    message,
    messageType,
    move,
    undo,
    redo,
    resetLevel,
    restoreFromStorage,
    currentLevel,
    hasUnsavedDraft,
    isDraftRestored,
    draftUpdatedAt,
  } = useGameStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            undo();
            return;
          case 'y':
            e.preventDefault();
            redo();
            return;
        }
      }

      if (mode === 'play') {
        let direction: Direction | null = null;

        switch (e.key.toLowerCase()) {
          case 'arrowup':
          case 'w':
            direction = 'up';
            break;
          case 'arrowdown':
          case 's':
            direction = 'down';
            break;
          case 'arrowleft':
          case 'a':
            direction = 'left';
            break;
          case 'arrowright':
          case 'd':
            direction = 'right';
            break;
          case 'r':
            if (!ctrlKey) {
              e.preventDefault();
              resetLevel();
              return;
            }
            break;
        }

        if (direction) {
          e.preventDefault();
          move(direction);
        }
      }
    },
    [mode, move, undo, redo, resetLevel]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const result = restoreFromStorage();
    if (!result.restoredGame && !result.restoredDraft) {
      // no-op: initial message is fine
    }
  }, [restoreFromStorage]);

  const messageBgClass = {
    success: 'bg-green-900/80 border-green-500 text-green-300',
    error: 'bg-red-900/80 border-red-500 text-red-300 animate-shake',
    info: 'bg-cyan-900/80 border-cyan-500 text-cyan-300',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Toolbar />

        <div className="flex-1 p-4">
          {message && (
            <div
              className={`max-w-2xl mx-auto mb-4 px-4 py-3 rounded-lg border backdrop-blur-sm transition-all duration-300 ${
                messageBgClass[messageType]
              }`}
            >
              {message}
            </div>
          )}

          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-200 flex items-center justify-center gap-2">
                {currentLevel.name || '未命名关卡'}
                {hasUnsavedDraft && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border animate-pulse ${
                    isDraftRestored
                      ? 'bg-amber-900/40 text-amber-300 border-amber-600/60'
                      : 'bg-orange-900/40 text-orange-300 border-orange-600/60'
                  }`}
                    title={draftUpdatedAt ? `草稿更新：${new Date(draftUpdatedAt).toLocaleString()}` : ''}
                  >
                    📝 {isDraftRestored ? '已恢复' : '草稿'}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500">
                {mode === 'edit' ? '✏️ 编辑模式 · 自动保存草稿中' : '🎮 游玩模式'}
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
              <div className="w-full lg:w-64 space-y-4 order-2 lg:order-1">
                <StatusPanel />
                <Controls />
              </div>

              <div className="order-1 lg:order-2 flex-shrink-0">
                <Grid />
              </div>

              <div className="w-full lg:w-72 order-3">
                <HistoryPanel />
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center py-4 text-xs text-gray-600 border-t border-gray-800">
          <p>🎮 解谜关卡编辑器 | 使用方向键或WASD移动 | Ctrl+Z撤销 Ctrl+Y重做 | R重置</p>
          <p className="mt-1">数据保存在本地浏览器中，刷新或重启后仍可恢复</p>
        </footer>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
};

export default App;
