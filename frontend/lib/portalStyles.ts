import { keyframes } from "@mui/material/styles";

// Animation keyframes (matching main app)
export const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

export const successScale = keyframes`
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
`;

export const slideUp = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

// Status color mapping for consistent UI
export const STATUS_COLORS = {
  approved: 'success',
  pending: 'warning',
  submitted: 'warning',
  rejected: 'error',
  closed: 'error',
  active: 'info',
  paused: 'default',
  draft: 'default',
} as const;

export type StatusType = keyof typeof STATUS_COLORS;

export function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  const normalizedStatus = status.toLowerCase() as StatusType;
  return STATUS_COLORS[normalizedStatus] || 'default';
}

// Helper to format status labels
export function formatStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
