'use client';

import { useEffect, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, CircularProgress, Button, Stack } from '@mui/material';
import { People, Folder, PersonAdd, Assessment } from '@mui/icons-material';
import Link from 'next/link';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function DashboardContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/api/company/users`),
        fetchWithAuth(`${API_BASE}/api/company/invites`),
      ]);
      const users = await usersRes.json();
      const invites = await invitesRes.json();
      
      setStats({
        totalUsers: users.users?.length || 0,
        pendingUsers: users.users?.filter((u: any) => !u.approved).length || 0,
        pendingInvites: invites.invites?.filter((i: any) => !i.used_at).length || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: t('portal.dashboard.users', 'Brukere'), value: stats?.totalUsers || 0, icon: <People fontSize="large" />, color: 'primary.main' },
    { title: t('portal.dashboard.approvals', 'Godkjenninger'), value: stats?.pendingUsers || 0, icon: <PersonAdd fontSize="large" />, color: 'warning.main' },
    { title: t('portal.dashboard.invites', 'Invitasjoner'), value: stats?.pendingInvites || 0, icon: <Assessment fontSize="large" />, color: 'info.main' },
  ];

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  const showOnboardingBanner = (() => {
    try { return localStorage.getItem('onboarding_dismissed') !== 'true'; } catch { return true; }
  })();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('portal.dashboard', 'Dashboard')}</Typography>

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
          <Grid item xs={12} sm={6} md={4} key={idx}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">{card.title}</Typography>
                    <Typography variant="h3">{card.value}</Typography>
                  </Box>
                  <Box sx={{ color: card.color }}>{card.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
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
