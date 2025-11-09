import { useState, useEffect, useCallback } from 'react';

export type UndoAction = {
  type: 'approve' | 'reject' | 'delete' | 'update' | 'add';
  label: string;
  onUndo: () => Promise<void> | void;
  data?: any;
};

export function usePortalUndo() {
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  // Auto-clear undo after 10 seconds
  useEffect(() => {
    if (!undoAction) return;
    const timeout = setTimeout(() => setUndoAction(null), 10000);
    return () => clearTimeout(timeout);
  }, [undoAction]);

  const setUndo = useCallback((action: UndoAction) => {
    setUndoAction(action);
  }, []);

  const executeUndo = useCallback(async () => {
    if (!undoAction) return;
    try {
      await undoAction.onUndo();
      setUndoAction(null);
    } catch (error) {
      console.error('Undo failed:', error);
      // Keep undo available if it fails
    }
  }, [undoAction]);

  const clearUndo = useCallback(() => {
    setUndoAction(null);
  }, []);

  return {
    undoAction,
    setUndo,
    executeUndo,
    clearUndo,
    hasUndo: !!undoAction,
  };
}
