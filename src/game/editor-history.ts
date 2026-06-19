import type { EditorSnapshot, EditorHistoryState, Level, EditorState } from '../types/game';
import { cloneGrid, generateId } from './grid';

function cloneLevel(level: Level): Level {
  return {
    ...level,
    grid: cloneGrid(level.grid),
    startPos: { ...level.startPos },
    endPos: { ...level.endPos },
  };
}

function cloneEditorState(es: EditorState): EditorState {
  return { ...es };
}

export function createEditorHistory(initialLevel: Level, initialEditorState: EditorState): EditorHistoryState {
  const snapshot: EditorSnapshot = {
    level: cloneLevel(initialLevel),
    editorState: cloneEditorState(initialEditorState),
    timestamp: Date.now(),
  };
  return {
    snapshots: [snapshot],
    currentIndex: 0,
  };
}

export function addEditorSnapshot(
  history: EditorHistoryState,
  level: Level,
  editorState: EditorState
): EditorHistoryState {
  const truncated = history.snapshots.slice(0, history.currentIndex + 1);
  const snapshot: EditorSnapshot = {
    level: cloneLevel(level),
    editorState: cloneEditorState(editorState),
    timestamp: Date.now(),
  };
  truncated.push(snapshot);
  const MAX_HISTORY = 200;
  const finalSnapshots = truncated.length > MAX_HISTORY
    ? truncated.slice(truncated.length - MAX_HISTORY)
    : truncated;
  return {
    snapshots: finalSnapshots,
    currentIndex: finalSnapshots.length - 1,
  };
}

export function canEditorUndo(history: EditorHistoryState): boolean {
  return history.currentIndex > 0;
}

export function canEditorRedo(history: EditorHistoryState): boolean {
  return history.currentIndex < history.snapshots.length - 1;
}

export function editorUndo(history: EditorHistoryState): EditorSnapshot | null {
  if (!canEditorUndo(history)) return null;
  const newIndex = history.currentIndex - 1;
  const snap = history.snapshots[newIndex];
  return {
    level: cloneLevel(snap.level),
    editorState: cloneEditorState(snap.editorState),
    timestamp: snap.timestamp,
  };
}

export function editorRedo(history: EditorHistoryState): EditorSnapshot | null {
  if (!canEditorRedo(history)) return null;
  const newIndex = history.currentIndex + 1;
  const snap = history.snapshots[newIndex];
  return {
    level: cloneLevel(snap.level),
    editorState: cloneEditorState(snap.editorState),
    timestamp: snap.timestamp,
  };
}

export function getCurrentEditorSnapshot(history: EditorHistoryState): EditorSnapshot | null {
  if (history.currentIndex < 0 || history.currentIndex >= history.snapshots.length) {
    return null;
  }
  const snap = history.snapshots[history.currentIndex];
  return {
    level: cloneLevel(snap.level),
    editorState: cloneEditorState(snap.editorState),
    timestamp: snap.timestamp,
  };
}

export function resetEditorHistory(
  history: EditorHistoryState,
  level: Level,
  editorState: EditorState
): EditorHistoryState {
  return createEditorHistory(level, editorState);
}
