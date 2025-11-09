'use client';

import { Box, Typography, Paper, Stack, Avatar, Chip } from '@mui/material';
import { 
  PersonAdd, 
  CheckCircle, 
  Cancel, 
  Description, 
  FolderOpen,
  AccessTime 
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { nb } from 'date-fns/locale';

interface Activity {
  id: string;
  type: 'user_approved' | 'user_joined' | 'report_submitted' | 'report_approved' | 'report_rejected' | 'case_assigned';
  user_email?: string;
  case_id?: string;
  created_at: string;
  details?: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
}

export default function ActivityFeed({ activities, loading }: ActivityFeedProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_approved':
      case 'report_approved':
        return <CheckCircle sx={{ color: 'success.main' }} />;
      case 'user_joined':
        return <PersonAdd sx={{ color: 'info.main' }} />;
      case 'report_submitted':
        return <Description sx={{ color: 'warning.main' }} />;
      case 'report_rejected':
        return <Cancel sx={{ color: 'error.main' }} />;
      case 'case_assigned':
        return <FolderOpen sx={{ color: 'primary.main' }} />;
      default:
        return <AccessTime sx={{ color: 'text.secondary' }} />;
    }
  };

  const getActivityText = (activity: Activity) => {
    const email = activity.user_email || 'En bruker';
    const caseId = activity.case_id || 'en sak';
    
    switch (activity.type) {
      case 'user_approved':
        return `${email} ble godkjent`;
      case 'user_joined':
        return `${email} ble med i selskapet`;
      case 'report_submitted':
        return `${email} sendte inn rapport for ${caseId}`;
      case 'report_approved':
        return `Rapport fra ${email} ble godkjent`;
      case 'report_rejected':
        return `Rapport fra ${email} ble avslått`;
      case 'case_assigned':
        return `${email} ble tildelt ${caseId}`;
      default:
        return activity.details || 'Aktivitet';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { 
        addSuffix: true, 
        locale: nb 
      });
    } catch {
      return 'nylig';
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Nylig aktivitet</Typography>
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center', opacity: 0.3 }}>
              <Avatar sx={{ width: 40, height: 40 }} />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ height: 16, bgcolor: 'grey.300', borderRadius: 1, mb: 0.5, width: '70%' }} />
                <Box sx={{ height: 12, bgcolor: 'grey.200', borderRadius: 1, width: '40%' }} />
              </Box>
            </Box>
          ))}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Nylig aktivitet</Typography>
      
      {activities.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <AccessTime sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">Ingen aktivitet ennå</Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          {activities.map((activity) => (
            <Box 
              key={activity.id} 
              sx={{ 
                display: 'flex', 
                gap: 2, 
                alignItems: 'flex-start',
                pb: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none', pb: 0 }
              }}
            >
              <Avatar sx={{ width: 40, height: 40, bgcolor: 'background.paper' }}>
                {getActivityIcon(activity.type)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {getActivityText(activity)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatTimeAgo(activity.created_at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
