"use client";
import { Fab, Tooltip } from "@mui/material";
import { Undo as UndoIcon } from "@mui/icons-material";
import { successScale } from "../../lib/portalStyles";
import { UndoAction } from "../../lib/hooks/usePortalUndo";

interface UndoFabProps {
  undoAction: UndoAction | null;
  onUndo: () => void;
}

export default function UndoFab({ undoAction, onUndo }: UndoFabProps) {
  if (!undoAction) return null;

  return (
    <Tooltip title={`Undo: ${undoAction.label}`} arrow placement="left">
      <Fab
        color="secondary"
        sx={{
          position: 'fixed',
          bottom: { xs: 90, md: 24 },
          right: 24,
          animation: `${successScale} 0.3s ease-out`,
          zIndex: 1000,
        }}
        onClick={onUndo}
        aria-label={`Undo ${undoAction.label}`}
      >
        <UndoIcon />
      </Fab>
    </Tooltip>
  );
}
