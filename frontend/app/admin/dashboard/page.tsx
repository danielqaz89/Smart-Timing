'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  People as PeopleIcon,
  Assignment as LogsIcon,
  Folder as ProjectsIcon,
  TrendingUp as TrendingIcon,
} from '@mui/icons-material';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface Analytics {
  users: {
    total_users: number;
    total_settings: number;
  };
  logs: {
    total_logs: number;
    active_users: number;
    total_hours: string;
    active_months: number;
  };
  projects: {
    total_projects: number;
    users_with_projects: number;
    active_projects: number;
  };
  recent_active_users: Array<{
    user_id: string;
    log_count: number;
    last_activity: string;
  }>;
  timestamp: string;
}

function DashboardContent() {
  const { fetchWithAuth } = useAdmin();
  const { t } = useTranslations();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`${API_BASE}/api/admin/analytics`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load analytics');
      }

      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analytics) {
    return null;
  }

  const statsCards = [
    {
      title: t('admin.dashboard.total_users', 'Total Users'),
      value: analytics.users.total_users,
      icon: <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      color: '#1976d2',
    },
    {
      title: t('admin.dashboard.total_logs', 'Total Logs'),
      value: analytics.logs.total_logs,
      icon: <LogsIcon sx={{ fontSize: 40, color: 'success.main' }} />,
      color: '#2e7d32',
    },
    {
      title: t('admin.dashboard.total_projects', 'Total Projects'),
      value: analytics.projects.total_projects,
      icon: <ProjectsIcon sx={{ fontSize: 40, color: 'warning.main' }} />,
      color: '#ed6c02',
    },
    {
      title: t('admin.dashboard.total_hours', 'Total Hours Logged'),
      value: parseFloat(analytics.logs.total_hours || '0').toFixed(1),
      icon: <TrendingIcon sx={{ fontSize: 40, color: 'secondary.main' }} />,
      color: '#9c27b0',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('admin.dashboard', 'Dashboard')}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statsCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card elevation={3}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {card.title}
                    </Typography>
                    <Typography variant="h4">{card.value}</Typography>
                  </Box>
                  {card.icon}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('admin.dashboard.system_stats', 'System Statistics')}
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary={t('admin.dashboard.active_users', 'Active Users (with logs)')}
                  secondary={analytics.logs.active_users}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t('admin.dashboard.users_with_projects', 'Users with Projects')}
                  secondary={analytics.projects.users_with_projects}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t('admin.dashboard.active_projects', 'Active Projects')}
                  secondary={analytics.projects.active_projects}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={t('admin.dashboard.active_months', 'Active Months')}
                  secondary={analytics.logs.active_months}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('admin.dashboard.most_active', 'Most Active Users (Last 7 Days)')}
            </Typography>
            <List>
              {analytics.recent_active_users.length === 0 ? (
                <ListItem>
                  <ListItemText secondary={t('admin.dashboard.no_activity_7d', 'No activity in the last 7 days')} />
                </ListItem>
              ) : (
                analytics.recent_active_users.map((user, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={user.user_id}
                      secondary={`${user.log_count} logs • Last: ${new Date(
                        user.last_activity
                      ).toLocaleDateString()}`}
                    />
                    <Chip label={user.log_count} color="primary" size="small" />
                  </ListItem>
                ))
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2, textAlign: 'right' }}>
        <Typography variant="caption" color="textSecondary">
          {t('common.last_updated', 'Last updated:')} {new Date(analytics.timestamp).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <DashboardContent />
      </AdminLayout>
    </AdminProvider>
  );
}
