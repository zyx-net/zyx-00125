import type {
  Action,
  GameState,
  KeyStep,
  Level,
  LevelContentDigest,
  Mode,
  ReplayCompatibility,
  ReplayCompatibilityInfo,
  ReplayRecord,
} from '../types/game';
import { cloneGameState, cloneGrid, generateId } from './grid';
import { createInitialGameState } from './engine';

export { cloneGameState };

export function computeGridHash(grid: Level['grid']): string {
  let hash = 0;
  const str = JSON.stringify(grid);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function computeLevelDigest(level: Level): LevelContentDigest {
  return {
    width: level.width,
    height: level.height,
    startPos: { ...level.startPos },
    endPos: { ...level.endPos },
    gridHash: computeGridHash(level.grid),
  };
}

export function extractKeySteps(actionHistory: Action[]): KeyStep[] {
  const keySteps: KeyStep[] = [];
  for (let i = 0; i < actionHistory.length; i++) {
    const action = actionHistory[i];
    if (action.type !== 'move') {
      keySteps.push({
        actionIndex: i,
        description: action.description,
        type: action.type,
      });
    }
  }
  if (keySteps.length === 0 && actionHistory.length > 0) {
    const last = actionHistory[actionHistory.length - 1];
    keySteps.push({
      actionIndex: actionHistory.length - 1,
      description: last.description,
      type: last.type,
    });
  }
  return keySteps;
}

export function buildReplayRecord(
  name: string,
  level: Level,
  initialState: GameState,
  actionHistory: Action[],
  finalState?: GameState
): ReplayRecord {
  const winState = finalState ?? actionHistory[actionHistory.length - 1]?.stateSnapshot;
  return {
    id: generateId(),
    name,
    levelId: level.id,
    levelName: level.name,
    steps: Math.max(0, actionHistory.length - 1),
    isWin: winState?.isWin ?? false,
    createdAt: Date.now(),
    keySteps: extractKeySteps(actionHistory),
    levelDigest: computeLevelDigest(level),
    actionHistory: actionHistory.map(a => ({
      ...a,
      stateSnapshot: cloneGameState(a.stateSnapshot),
    })),
    finalState: winState ? cloneGameState(winState) : undefined,
    initialState: cloneGameState(initialState),
  };
}

export function checkReplayCompatibility(
  replay: ReplayRecord,
  currentLevel: Level
): ReplayCompatibilityInfo {
  const differences: string[] = [];
  const digest = replay.levelDigest;

  if (replay.levelId !== currentLevel.id) {
    return {
      status: 'incompatible',
      reason: '关卡 ID 不匹配',
      differences: [`期望 ID=${replay.levelId}，当前 ID=${currentLevel.id}`],
    };
  }

  if (digest.width !== currentLevel.width || digest.height !== currentLevel.height) {
    differences.push(`尺寸变化：${digest.width}×${digest.height} → ${currentLevel.width}×${currentLevel.height}`);
  }
  if (digest.startPos.x !== currentLevel.startPos.x || digest.startPos.y !== currentLevel.startPos.y) {
    differences.push(`起点变化：(${digest.startPos.x},${digest.startPos.y}) → (${currentLevel.startPos.x},${currentLevel.startPos.y})`);
  }
  if (digest.endPos.x !== currentLevel.endPos.x || digest.endPos.y !== currentLevel.endPos.y) {
    differences.push(`终点变化：(${digest.endPos.x},${digest.endPos.y}) → (${currentLevel.endPos.x},${currentLevel.endPos.y})`);
  }

  const currentGridHash = computeGridHash(currentLevel.grid);
  if (digest.gridHash !== currentGridHash) {
    differences.push('网格内容（墙壁/钥匙/门/机关等布局）发生变化');
  }

  if (differences.length === 0) {
    return { status: 'compatible' };
  }

  return {
    status: 'view-only',
    reason: '关卡内容已被编辑',
    differences,
  };
}

export interface ReplayStepResult {
  gameState: GameState;
  action: Action;
  isLastStep: boolean;
}

export function getReplayStateAtStep(
  replay: ReplayRecord,
  stepIndex: number
): GameState | null {
  if (stepIndex < 0 || stepIndex >= replay.actionHistory.length) {
    return null;
  }
  return cloneGameState(replay.actionHistory[stepIndex].stateSnapshot);
}

export function getInitialReplayState(replay: ReplayRecord, level?: Level): GameState {
  if (level) {
    return createInitialGameState(level);
  }
  return cloneGameState(replay.initialState);
}

export function validateReplayRecord(data: unknown): {
  valid: boolean;
  record?: ReplayRecord;
  reason?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: '回放记录不是合法对象' };
  }
  const r = data as Record<string, unknown>;
  if (typeof r.id !== 'string') return { valid: false, reason: '缺少 id 字段' };
  if (typeof r.name !== 'string') return { valid: false, reason: '缺少 name 字段' };
  if (typeof r.levelId !== 'string') return { valid: false, reason: '缺少 levelId 字段' };
  if (typeof r.levelName !== 'string') return { valid: false, reason: '缺少 levelName 字段' };
  if (typeof r.steps !== 'number') return { valid: false, reason: '缺少 steps 字段' };
  if (typeof r.isWin !== 'boolean') return { valid: false, reason: '缺少 isWin 字段' };
  if (r.isWin !== true) return { valid: false, reason: '回放记录未通关，仅通关记录可导入' };
  if (typeof r.createdAt !== 'number') return { valid: false, reason: '缺少 createdAt 字段' };
  if (!r.levelDigest || typeof r.levelDigest !== 'object') {
    return { valid: false, reason: '缺少 levelDigest 字段' };
  }
  const ld = r.levelDigest as Record<string, unknown>;
  if (typeof ld.width !== 'number' || typeof ld.height !== 'number') {
    return { valid: false, reason: 'levelDigest 缺少尺寸信息' };
  }
  if (!ld.startPos || typeof ld.startPos !== 'object') {
    return { valid: false, reason: 'levelDigest 缺少起点位置' };
  }
  if (!ld.endPos || typeof ld.endPos !== 'object') {
    return { valid: false, reason: 'levelDigest 缺少终点位置' };
  }
  if (!Array.isArray(r.actionHistory) || r.actionHistory.length === 0) {
    return { valid: false, reason: 'actionHistory 为空或不存在' };
  }
  if (!r.initialState || typeof r.initialState !== 'object') {
    return { valid: false, reason: '缺少 initialState 字段' };
  }
  return { valid: true, record: r as unknown as ReplayRecord };
}

export interface VerifiedReplayPack {
  replays: ReplayRecord[];
  failedItems: Array<{
    replayData: unknown;
    replayName: string;
    replayId: string;
    reason: string;
  }>;
}

export function validateReplayPack(data: unknown): VerifiedReplayPack {
  const result: VerifiedReplayPack = { replays: [], failedItems: [] };

  if (!data || typeof data !== 'object') {
    result.failedItems.push({
      replayData: data,
      replayName: '未知回放',
      replayId: 'invalid-pack',
      reason: '数据不是合法对象',
    });
    return result;
  }

  const obj = data as Record<string, unknown>;
  const candidates: unknown[] = [];

  if (Array.isArray(obj.replays)) {
    candidates.push(...(obj.replays as unknown[]));
  } else if (Array.isArray(obj)) {
    candidates.push(...(obj as unknown[]));
  } else {
    candidates.push(obj);
  }

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const vr = validateReplayRecord(cand);
    if (vr.valid && vr.record) {
      result.replays.push(vr.record);
    } else {
      const candObj = cand as Record<string, unknown> | undefined;
      result.failedItems.push({
        replayData: cand,
        replayName: (candObj?.name as string) || `回放 ${i + 1}`,
        replayId: (candObj?.id as string) || `failed-${generateId()}`,
        reason: vr.reason || '回放验证失败',
      });
    }
  }

  return result;
}

export interface CanSaveReplayResult {
  allowed: boolean;
  reason?: string;
}

export function canSaveReplay(
  gameState: GameState,
  actionHistory: Action[],
  mode: Mode,
): CanSaveReplayResult {
  if (mode !== 'play') {
    return { allowed: false, reason: '编辑模式下不能保存回放' };
  }
  if (actionHistory.length < 2) {
    return { allowed: false, reason: '行动步骤太少，无法保存回放' };
  }
  if (!gameState.isWin) {
    return { allowed: false, reason: '通关后才能保存攻略记录' };
  }
  return { allowed: true };
}

export function sanitizeReplays(replays: ReplayRecord[]): ReplayRecord[] {
  return replays.filter(r => r.isWin === true);
}
