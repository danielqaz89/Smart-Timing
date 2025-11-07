'use client';

import { useEffect, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, CircularProgress } from '@mui/material';
import { People, Folder, PersonAdd, Assessment } from '@mui/icons-material';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function DashboardContent() {
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
    { title: 'Brukere', value: stats?.totalUsers || 0, icon: <People fontSize="large" />, color: 'primary.main' },
    { title: 'Godkjenninger', value: stats?.pendingUsers || 0, icon: <PersonAdd fontSize="large" />, color: 'warning.main' },
    { title: 'Invitasjoner', value: stats?.pendingInvites || 0, icon: <Assessment fontSize="large" />, color: 'info.main' },
  ];

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>
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
