import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { getAllDoors, getAllMechanisms } from '../game/engine';
import { getColorName } from '../game/rules';
import type { Color } from '../types/game';

const colorBg: Record<Color, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
};

const colorBorder: Record<Color, string> = {
  red: 'border-red-400',
  blue: 'border-blue-400',
  green: 'border-green-400',
  yellow: 'border-yellow-300',
};

export const StatusPanel: React.FC = () => {
  const { gameState, mode, getBestMoves, hasUnsavedDraft, draftUpdatedAt, isDraftRestored, currentLevel, editorHistory } = useGameStore();
  const { player, turn, isWin, level } = gameState;
  const doors = getAllDoors(gameState);
  const mechanisms = getAllMechanisms(gameState);
  const bestMoves = getBestMoves(level.id);

  if (mode === 'edit') {
    const totalSnaps = editorHistory.snapshots.length;
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-orange-400">✏️ 编辑模式</h3>
          {hasUnsavedDraft && (
            <span className={`text-[10px] px-2 py-1 rounded-full border animate-pulse ${
              isDraftRestored
                ? 'bg-amber-900/40 text-amber-300 border-amber-600/60'
                : 'bg-orange-900/40 text-orange-300 border-orange-600/60'
            }`}>
              📝 {isDraftRestored ? '草稿已恢复' : '草稿未保存'}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-300 mb-2">
          关卡：<span className="text-cyan-300 font-medium">{currentLevel.name || '未命名关卡'}</span>
        </p>
        <div className="text-xs text-gray-400 space-y-1 mb-3">
          <p>• 尺寸：{currentLevel.width} × {currentLevel.height}</p>
          <p>• 历史记录：{editorHistory.currentIndex + 1} / {totalSnaps}</p>
          {draftUpdatedAt && (
            <p>• 草稿更新：{new Date(draftUpdatedAt).toLocaleString()}</p>
          )}
        </div>
        <div className="text-xs text-gray-400 space-y-1 pt-3 border-t border-gray-700">
          <p>• 选择工具和颜色后点击网格</p>
          <p>• 起点和终点只能有一个</p>
          <p>• 编辑会自动保存为草稿</p>
          <p>• 保存后草稿会被清除</p>
          <p>• Ctrl+Z 撤销，Ctrl+Y 重做</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-700 p-4 shadow-xl space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-cyan-400">📊 状态</h3>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{turn}</div>
          <div className="text-xs text-gray-400">回合数</div>
        </div>
      </div>

      {bestMoves && (
        <div className="text-xs text-yellow-400 bg-yellow-900/30 px-3 py-2 rounded-lg border border-yellow-700/50">
          ⭐ 最佳记录: {bestMoves} 步
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-2">🎒 背包</h4>
        <div className="flex flex-wrap gap-2 min-h-[40px] bg-gray-800/50 rounded-lg p-2">
          {player.inventory.length === 0 ? (
            <span className="text-xs text-gray-500 italic">空空如也...</span>
          ) : (
            player.inventory.map((color, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full ${colorBg[color]} border-2 ${colorBorder[color]} flex items-center justify-center shadow-lg`}
                title={`${getColorName(color)}钥匙`}
              >
                🔑
              </div>
            ))
          )}
        </div>
      </div>

      {doors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">🚪 门状态</h4>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {doors.map((door) => (
              <div
                key={door.id}
                className="flex items-center justify-between text-xs bg-gray-800/50 px-2 py-1 rounded"
              >
                <span className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-full ${colorBg[door.color as Color]}`} />
                  {getColorName(door.color as Color)}门
                  <span className="text-gray-500">({door.x},{door.y})</span>
                </span>
                <span className={door.isOpen ? 'text-green-400' : 'text-red-400'}>
                  {door.isOpen ? '✅ 开' : '🔒 关'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mechanisms.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">⚙️ 机关</h4>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {mechanisms.map((mech) => (
              <div
                key={mech.id}
                className="flex items-center justify-between text-xs bg-gray-800/50 px-2 py-1 rounded"
              >
                <span className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-full ${colorBg[mech.color as Color]}`} />
                  {getColorName(mech.color as Color)}机关
                  <span className="text-gray-500">({mech.x},{mech.y})</span>
                </span>
                <span className={mech.isActive ? 'text-green-400' : 'text-gray-400'}>
                  {mech.isActive ? '⚡ 激活' : '⭕ 未激活'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-2">🎮 操作说明</h4>
        <div className="text-xs text-gray-400 space-y-1">
          <p>↑↓←→ 或 WASD 移动</p>
          <p>Ctrl+Z 撤销，Ctrl+Y 重做</p>
          <p>R 重置关卡</p>
        </div>
      </div>

      {isWin && (
        <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500 rounded-lg p-4 text-center animate-pulse">
          <div className="text-3xl mb-2">🎉</div>
          <div className="text-lg font-bold text-green-400">恭喜通关！</div>
          <div className="text-sm text-gray-300 mt-1">
            用时 {turn} 步
            {bestMoves && turn <= bestMoves && (
              <span className="text-yellow-400 ml-2">⭐ 新纪录！</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
