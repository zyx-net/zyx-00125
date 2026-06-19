import type { Action, GameState } from '../types/game';
import { generateId } from './grid';

export interface HistoryState {
  actions: Action[];
  currentIndex: number;
}

export function createHistory(): HistoryState {
  return {
    actions: [],
    currentIndex: -1,
  };
}

export function addAction(
  history: HistoryState,
  type: Action['type'],
  position: { x: number; y: number },
  description: string,
  stateSnapshot: GameState,
  direction?: Action['direction']
): HistoryState {
  const newAction: Action = {
    id: generateId(),
    type,
    direction,
    position,
    description,
    timestamp: Date.now(),
    stateSnapshot,
  };

  const truncatedActions = history.actions.slice(0, history.currentIndex + 1);
  truncatedActions.push(newAction);

  return {
    actions: truncatedActions,
    currentIndex: truncatedActions.length - 1,
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.currentIndex > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.currentIndex < history.actions.length - 1;
}

export function undo(history: HistoryState): { history: HistoryState; state: GameState } | null {
  if (!canUndo(history)) return null;
  
  const newIndex = history.currentIndex - 1;
  const state = history.actions[newIndex].stateSnapshot;
  
  return {
    history: {
      ...history,
      currentIndex: newIndex,
    },
    state,
  };
}

export function redo(history: HistoryState): { history: HistoryState; state: GameState } | null {
  if (!canRedo(history)) return null;
  
  const newIndex = history.currentIndex + 1;
  const state = history.actions[newIndex].stateSnapshot;
  
  return {
    history: {
      ...history,
      currentIndex: newIndex,
    },
    state,
  };
}

export function getCurrentState(history: HistoryState): GameState | null {
  if (history.currentIndex < 0 || history.currentIndex >= history.actions.length) {
    return null;
  }
  return history.actions[history.currentIndex].stateSnapshot;
}

export function resetHistory(history: HistoryState, initialState: GameState): HistoryState {
  return {
    actions: [{
      id: generateId(),
      type: 'move',
      position: initialState.player.position,
      description: '初始状态',
      timestamp: Date.now(),
      stateSnapshot: initialState,
    }],
    currentIndex: 0,
  };
}
