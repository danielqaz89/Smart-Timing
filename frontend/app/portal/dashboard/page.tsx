'use client';

import { useEffect, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, Button, Stack, Chip, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { People, Folder, PersonAdd, Assessment, AccessTime, Today, DateRange, CalendarMonth } from '@mui/icons-material';
import Link from 'next/link';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import dynamic from 'next/dynamic';
import ActivityFeed from '../../../components/portal/ActivityFeed';
import StatCardWithTrend from '../../../components/portal/StatCardWithTrend';
import { DashboardSkeleton } from '../../../components/portal/SkeletonLoaders';

const HoursBarChart = dynamic(() => import('../../../components/HoursBarChart'), { ssr: false });
const CalendarHeatmap = dynamic(() => import('../../../components/CalendarHeatmap'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function DashboardContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const [stats, setStats] = useState<any>(null);
  const [prevStats, setPrevStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');
  const [companyLogs, setCompanyLogs] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
    loadActivities();
    loadCompanyLogs();
  }, []);

  useEffect(() => {
    loadStats();
  }, [timeRange]);

  // Persist time range selection
  useEffect(() => {
    try {
      localStorage.setItem('dashboard_time_range', timeRange);
    } catch {}
  }, [timeRange]);

  // Restore time range on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashboard_time_range');
      if (saved === 'today' || saved === 'week' || saved === 'month') {
        setTimeRange(saved);
      }
    } catch {}
  }, []);

  const loadStats = async () => {
    try {
      const [usersRes, invitesRes, reportsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/api/company/users`),
        fetchWithAuth(`${API_BASE}/api/company/invites`),
        fetchWithAuth(`${API_BASE}/api/company/case-reports?range=${timeRange}`),
      ]);
      const users = await usersRes.json();
      const invites = await invitesRes.json();
      const reports = await reportsRes.json();

      const currentStats = {
        totalUsers: users.users?.length || 0,
        pendingUsers: users.users?.filter((u: any) => !u.approved).length || 0,
        pendingInvites: invites.invites?.filter((i: any) => !i.used_at).length || 0,
        totalHours: calculateTotalHours(reports.reports || []),
        submittedReports: reports.reports?.filter((r: any) => r.status === 'submitted').length || 0,
      };

      // Calculate trends (mock previous period data)
      if (!prevStats) {
        setPrevStats({
          totalUsers: Math.max(0, currentStats.totalUsers - Math.floor(Math.random() * 3)),
          pendingUsers: Math.max(0, currentStats.pendingUsers + Math.floor(Math.random() * 2)),
          totalHours: Math.max(0, currentStats.totalHours - Math.floor(Math.random() * 20)),
          submittedReports: Math.max(0, currentStats.submittedReports - Math.floor(Math.random() * 2)),
        });
      }

      setStats(currentStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/audit-log?limit=10`);
      const data = await res.json();
      setActivities(data.activities || []);
    } catch (error) {
      console.error('Failed to load activities:', error);
      // Mock data for development
      setActivities([]);
    }
  };

  const loadCompanyLogs = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/logs?limit=30`);
      const data = await res.json();
      setCompanyLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load company logs:', error);
      setCompanyLogs([]);
    }
  };

  const calculateTotalHours = (reports: any[]) => {
    return reports.reduce((sum, report) => {
      const hours = parseFloat(report.total_hours) || 0;
      return sum + hours;
    }, 0);
  };

  const calculateTrend = (current: number, previous: number) => {
    if (!previous || previous === 0) return { value: 0, isPositive: true, previousValue: previous };
    const change = ((current - previous) / previous) * 100;
    return {
      value: change,
      isPositive: change >= 0,
      previousValue: previous,
    };
  };

  const statCards = [
    { 
      title: t('portal.dashboard.users', 'Brukere'), 
      value: stats?.totalUsers || 0, 
      icon: <People fontSize="large" />, 
      color: 'primary.main',
      trend: prevStats ? calculateTrend(stats?.totalUsers || 0, prevStats.totalUsers) : undefined
    },
    { 
      title: t('portal.dashboard.pending', 'Venter godkjenning'), 
      value: stats?.pendingUsers || 0, 
      icon: <PersonAdd fontSize="large" />, 
      color: 'warning.main',
      trend: prevStats ? calculateTrend(stats?.pendingUsers || 0, prevStats.pendingUsers) : undefined
    },
    { 
      title: t('portal.dashboard.hours', 'Timer logget'), 
      value: `${(stats?.totalHours || 0).toFixed(1)}t`, 
      icon: <AccessTime fontSize="large" />, 
      color: 'success.main',
      trend: prevStats ? calculateTrend(stats?.totalHours || 0, prevStats.totalHours) : undefined
    },
    { 
      title: t('portal.dashboard.reports', 'Innsendte rapporter'), 
      value: stats?.submittedReports || 0, 
      icon: <Assessment fontSize="large" />, 
      color: 'info.main',
      trend: prevStats ? calculateTrend(stats?.submittedReports || 0, prevStats.submittedReports) : undefined
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  const showOnboardingBanner = (() => {
    try { return localStorage.getItem('onboarding_dismissed') !== 'true'; } catch { return true; }
  })();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{t('portal.dashboard', 'Dashboard')}</Typography>
        
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(_, value) => value && setTimeRange(value)}
          size="small"
        >
          <ToggleButton value="today">
            <Today sx={{ mr: 0.5, fontSize: 18 }} />
            I dag
          </ToggleButton>
          <ToggleButton value="week">
            <DateRange sx={{ mr: 0.5, fontSize: 18 }} />
            Denne uken
          </ToggleButton>
          <ToggleButton value="month">
            <CalendarMonth sx={{ mr: 0.5, fontSize: 18 }} />
            Denne måneden
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {showOnboardingBanner && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="h6">{t('portal.onboarding.title', 'Kom i gang med selskapet')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('portal.onboarding.subtitle', 'Fullfør noen enkle steg: maler, team og integrasjoner.')}</Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Link href="/portal/onboarding" passHref legacyBehavior>
                  <Button variant="contained">{t('common.open', 'Åpne')}</Button>
                </Link>
<Button variant="text" onClick={() => { try { localStorage.setItem('onboarding_dismissed', 'true'); } catch { void 0; } }}>{t('common.dismiss', 'Skjul')}</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {statCards.map((card, idx) => (
          <Grid item xs={12} sm={6} md={3} key={idx}>
            <StatCardWithTrend
              title={card.title}
              value={card.value}
              icon={card.icon}
              color={card.color}
              trend={card.trend}
            />
          </Grid>
        ))}
      </Grid>

      {/* Activity Feed and Charts */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={4}>
          <ActivityFeed activities={activities} loading={false} />
        </Grid>
        
        <Grid item xs={12} md={8}>
          <Stack spacing={3}>
            {/* Hours Bar Chart */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('portal.dashboard.hours_distribution', 'Timefordeling')}
                </Typography>
                {companyLogs.length > 0 ? (
                  <HoursBarChart logs={companyLogs} />
                ) : (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                      {t('portal.dashboard.no_hours_data', 'Ingen timedata tilgjengelig')}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Calendar Heatmap */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('portal.dashboard.activity_heatmap', 'Aktivitetskalender')}
                </Typography>
                {companyLogs.length > 0 ? (
                  <CalendarHeatmap logs={companyLogs} />
                ) : (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                      {t('portal.dashboard.no_activity_data', 'Ingen aktivitetsdata tilgjengelig')}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

export default function DashboardPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <DashboardContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
