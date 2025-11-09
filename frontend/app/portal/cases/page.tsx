'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Card, CardContent, Grid, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Stack, Paper } from '@mui/material';
import { Add, Delete, TrendingUp, Folder, Timer, People, GroupAdd } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function CasesContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseNotes, setNewCaseNotes] = useState('');
  const [newCaseStatus, setNewCaseStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCaseId, setBulkCaseId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/company/users`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleAddCase = async () => {
    if (!newCaseId.trim() || !selectedUser) return;
    setLoading(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${selectedUser.id}/cases`, {
        method: 'POST',
        body: JSON.stringify({ 
          case_id: newCaseId.trim(), 
          notes: newCaseNotes.trim(),
          status: newCaseStatus 
        }),
      });
      await loadUsers();
      enqueueSnackbar('Sak lagt til', { variant: 'success' });
      setDialogOpen(false);
      setNewCaseId('');
      setNewCaseNotes('');
      setNewCaseStatus('active');
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke legge til sak: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkCaseId.trim() || selectedUserIds.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(
        selectedUserIds.map(userId =>
          fetchWithAuth(`${API_BASE}/api/company/users/${userId}/cases`, {
            method: 'POST',
            body: JSON.stringify({ 
              case_id: bulkCaseId.trim(),
              status: 'active'
            }),
          })
        )
      );
      await loadUsers();
      enqueueSnackbar(`Sak tildelt ${selectedUserIds.length} brukere`, { variant: 'success' });
      setBulkDialogOpen(false);
      setBulkCaseId('');
      setSelectedUserIds([]);
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke tildele sak: ${error?.message || error}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCaseStatus = async (userId: number, caseId: number, newStatus: string) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${userId}/cases/${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await loadUsers();
      enqueueSnackbar('Status oppdatert', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke oppdatere status: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const handleRemoveCase = async (userId, caseRowId) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${userId}/cases/${caseRowId}`, {
        method: 'DELETE',
      });
      await loadUsers();
      enqueueSnackbar('Sak fjernet', { variant: 'success' });
    } catch (error: any) {
      enqueueSnackbar(`Kunne ikke fjerne sak: ${error?.message || error}`, { variant: 'error' });
    }
  };

  const filteredUsers = users
    .map(u => ({
      ...u,
      cases: u.cases?.filter(c => {
        if (statusFilter === 'all') return true;
        return c.status === statusFilter;
      }) || []
    }))
    .filter(u =>
      (u.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       u.google_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       u.cases?.some(c => c.case_id?.toLowerCase().includes(searchTerm.toLowerCase())))
    );

  // Calculate analytics
  const allCases = users.flatMap(u => u.cases || []);
  const totalCases = allCases.length;
  const activeCases = allCases.filter(c => c.status === 'active').length;
  const pausedCases = allCases.filter(c => c.status === 'paused').length;
  const closedCases = allCases.filter(c => c.status === 'closed').length;
  const avgHoursPerCase = totalCases > 0 
    ? (allCases.reduce((sum, c) => sum + (parseFloat(c.hours_logged) || 0), 0) / totalCases).toFixed(1)
    : '0.0';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'info';
      case 'paused': return 'default';
      case 'closed': return 'error';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'paused': return 'Pauset';
      case 'closed': return 'Lukket';
      default: return status;
    }
  };

  const VirtuosoTableComponents = {
    Scroller: React.forwardRef((props, ref) => (
      <div {...props} ref={ref} style={{ overflowX: 'auto' }} />
    )),
    Table: (props) => <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />,
    TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} />),
    TableRow: (props) => <tr {...props} style={{ borderBottom: '1px solid #e0e0e0' }} />,
    TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref} />),
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('portal.cases.title', 'Saksadministrasjon')}</Typography>
        <Button
          variant="contained"
          startIcon={<GroupAdd />}
          onClick={() => setBulkDialogOpen(true)}
        >
          {t('portal.cases.bulk_assign', 'Massetildeling')}
        </Button>
      </Box>

      {/* Analytics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">Totalt antall saker</Typography>
                  <Typography variant="h4">{totalCases}</Typography>
                </Box>
                <Folder sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">Aktive saker</Typography>
                  <Typography variant="h4">{activeCases}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {pausedCases} pauset, {closedCases} lukket
                  </Typography>
                </Box>
                <TrendingUp sx={{ fontSize: 40, color: 'success.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">Gjennomsnitt timer/sak</Typography>
                  <Typography variant="h4">{avgHoursPerCase}t</Typography>
                </Box>
                <Timer sx={{ fontSize: 40, color: 'warning.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">Brukere med saker</Typography>
                  <Typography variant="h4">{users.filter(u => u.cases?.length > 0).length}</Typography>
                </Box>
                <People sx={{ fontSize: 40, color: 'info.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            placeholder={t('portal.cases.search_placeholder', 'Søk etter bruker eller saks-ID...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">Alle</MenuItem>
              <MenuItem value="active">Aktiv</MenuItem>
              <MenuItem value="paused">Pauset</MenuItem>
              <MenuItem value="closed">Lukket</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Box sx={{ height: 600, border: '1px solid #e0e0e0', borderRadius: 1 }}>
        <TableVirtuoso
          data={filteredUsers}
          components={VirtuosoTableComponents}
          fixedHeaderContent={() => (
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('portal.cases.user', 'Bruker')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.google_email', 'Google-epost')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.role', 'Rolle')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.status', 'Status')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('portal.cases.assigned_cases', 'Tildelte saker')}</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>{t('table.actions', 'Handlinger')}</th>
            </tr>
          )}
          itemContent={(index, user) => (
            <>
              <td style={{ padding: '12px' }}>{user.user_email || '-'}</td>
              <td style={{ padding: '12px' }}>{user.google_email || '-'}</td>
              <td style={{ padding: '12px' }}>
                <Chip label={user.role} size="small" />
              </td>
              <td style={{ padding: '12px' }}>
                <Chip
                  label={user.approved ? t('common.approved', 'Godkjent') : t('common.pending', 'Venter')}
                  size="small"
                  color={user.approved ? 'success' : 'warning'}
                />
              </td>
              <td style={{ padding: '12px' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {user.cases?.length > 0 ? (
                    user.cases.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.case_id}
                        size="small"
                        onDelete={() => handleRemoveCase(user.id, c.id)}
                        deleteIcon={<Delete />}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">{t('portal.cases.no_cases', 'Ingen saker')}</Typography>
                  )}
                </Box>
              </td>
              <td style={{ padding: '12px' }}>
                <Stack spacing={0.5}>
                  {user.cases?.length > 0 ? (
                    user.cases.map((c) => (
                      <FormControl key={c.id} size="small" fullWidth>
                        <Select
                          value={c.status || 'active'}
                          onChange={(e) => handleUpdateCaseStatus(user.id, c.id, e.target.value)}
                          variant="standard"
                        >
                          <MenuItem value="active">Aktiv</MenuItem>
                          <MenuItem value="paused">Pauset</MenuItem>
                          <MenuItem value="closed">Lukket</MenuItem>
                        </Select>
                      </FormControl>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">-</Typography>
                  )}
                </Stack>
              </td>
              <td style={{ padding: '12px' }}>
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={() => {
                    setSelectedUser(user);
                    setDialogOpen(true);
                  }}
>
                  {t('portal.cases.add_case', 'Legg til sak')}
                </Button>
              </td>
            </>
          )}
        />
      </Box>

      {/* Add Case Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.cases.add_case_for', 'Legg til sak for')} {selectedUser?.user_email}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.case_id', 'Saks-ID')}
            value={newCaseId}
            onChange={(e) => setNewCaseId(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={newCaseStatus}
              label="Status"
              onChange={(e) => setNewCaseStatus(e.target.value)}
            >
              <MenuItem value="active">Aktiv</MenuItem>
              <MenuItem value="paused">Pauset</MenuItem>
              <MenuItem value="closed">Lukket</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label={t('fields.notes_optional', 'Notater (valgfritt)')}
            value={newCaseNotes}
            onChange={(e) => setNewCaseNotes(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleAddCase} variant="contained" disabled={loading || !newCaseId.trim()}>
            {t('common.add', 'Legg til')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Assignment Dialog */}
      <Dialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.cases.bulk_assign_title', 'Tildel sak til flere brukere')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.case_id', 'Saks-ID')}
            value={bulkCaseId}
            onChange={(e) => setBulkCaseId(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <FormControl fullWidth>
            <InputLabel>{t('portal.cases.select_users', 'Velg brukere')}</InputLabel>
            <Select
              multiple
              value={selectedUserIds}
              onChange={(e) => setSelectedUserIds(e.target.value as number[])}
              input={<OutlinedInput label={t('portal.cases.select_users', 'Velg brukere')} />}
              renderValue={(selected) => `${selected.length} brukere valgt`}
            >
              {users.filter(u => u.approved).map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  <Checkbox checked={selectedUserIds.indexOf(user.id) > -1} />
                  <ListItemText 
                    primary={user.user_email} 
                    secondary={
                      <Chip label={user.role} size="small" sx={{ ml: 1 }} />
                    }
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {selectedUserIds.length} brukere valgt
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setBulkDialogOpen(false);
            setSelectedUserIds([]);
          }}>
            {t('common.cancel', 'Avbryt')}
          </Button>
          <Button 
            onClick={handleBulkAssign} 
            variant="contained" 
            disabled={loading || !bulkCaseId.trim() || selectedUserIds.length === 0}
          >
            {t('portal.cases.assign', 'Tildel')} ({selectedUserIds.length})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function CasesPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <CasesContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
