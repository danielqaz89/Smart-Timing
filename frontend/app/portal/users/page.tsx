'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack } from '@mui/material';
import { Check, Close, PersonAdd, PeopleAlt, CheckCircle } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';
import EmptyState from '../../../components/portal/EmptyState';
import { TableSkeleton } from '../../../components/portal/SkeletonLoaders';
import UndoFab from '../../../components/portal/UndoFab';
import { usePortalUndo } from '../../../lib/hooks/usePortalUndo';
import { getStatusColor, successScale } from '../../../lib/portalStyles';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function UsersContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const { enqueueSnackbar } = useSnackbar();
  const { undoAction, setUndo, executeUndo } = usePortalUndo();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newCase, setNewCase] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`${API_BASE}/api/company/users`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      enqueueSnackbar(t('portal.users.load_failed', 'Kunne ikke laste brukere'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number, user: any) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: true }),
      });
      
      // Success animation and toast
      enqueueSnackbar(
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircle sx={{ animation: `${successScale} 0.3s ease-out` }} />
          <span>{t('portal.users.approved', 'Bruker godkjent')}</span>
        </Stack> as any,
        { variant: 'success' }
      );
      
      // Set undo action
      setUndo({
        type: 'approve',
        label: `Approve ${user.user_email}`,
        onUndo: async () => {
          await fetchWithAuth(`${API_BASE}/api/company/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ approved: false }),
          });
          await loadUsers();
          enqueueSnackbar(t('common.undone', 'Angret'), { variant: 'info' });
        },
      });
      
      loadUsers();
    } catch (error) {
      console.error('Failed to approve:', error);
      enqueueSnackbar(t('portal.users.approve_failed', 'Kunne ikke godkjenne'), { variant: 'error' });
    }
  };

  const handleAddCase = async () => {
    if (!selectedUser || !newCase) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${selectedUser.id}/cases`, {
        method: 'POST',
        body: JSON.stringify({ case_id: newCase }),
      });
      setSelectedUser(null);
      setNewCase('');
      loadUsers();
    } catch (error) {
      console.error('Failed to add case:', error);
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>{t('portal.users.title', 'Brukere')}</Typography>
        <Paper elevation={3} sx={{ height: 600, overflow: 'hidden' }}>
          <TableSkeleton rows={8} />
        </Paper>
      </Box>
    );
  }

  if (!loading && users.length === 0) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>{t('portal.users.title', 'Brukere')}</Typography>
        <Paper elevation={3}>
          <EmptyState
            icon={<PeopleAlt />}
            title={t('portal.users.empty', 'Ingen brukere ennå')}
            description={t('portal.users.empty_desc', 'Inviter brukere til selskapet for å komme i gang.')}
            actionLabel={t('portal.users.invite', 'Inviter bruker')}
            onAction={() => window.location.href = '/portal/invites'}
          />
        </Paper>
        <UndoFab undoAction={undoAction} onUndo={executeUndo} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('portal.users.title', 'Brukere')}</Typography>
      <Paper elevation={3} sx={{ height: 600 }}>
        <TableVirtuoso
          data={users}
          components={{
            Table: (props) => <Table {...props} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
          }}
          fixedHeaderContent={() => (
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.email', 'E-post')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.role', 'Rolle')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.status', 'Status')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.cases', 'Saker')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.actions', 'Handlinger')}</TableCell>
            </TableRow>
          )}
          itemContent={(index, user) => (
            <>
              <TableCell>{user.user_email}</TableCell>
              <TableCell><Chip label={user.role} size="small" /></TableCell>
              <TableCell>
                <Chip 
                  label={user.approved ? t('common.approved', 'Godkjent') : t('common.pending', 'Venter')} 
                  color={getStatusColor(user.approved ? 'approved' : 'pending')}
                  size="small"
                />
              </TableCell>
              <TableCell>{user.cases?.length || 0}</TableCell>
              <TableCell align="right">
                {!user.approved && <IconButton size="small" color="success" onClick={() => handleApprove(user.id, user)}><Check fontSize="small" /></IconButton>}
                <IconButton size="small" onClick={() => setSelectedUser(user)}><PersonAdd fontSize="small" /></IconButton>
              </TableCell>
            </>
          )}
        />
      </Paper>

      <Dialog open={!!selectedUser} onClose={() => setSelectedUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('portal.users.assign_case', 'Tildel sak')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('fields.case_id', 'Saksnummer')}
            value={newCase}
            onChange={(e) => setNewCase(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedUser(null)}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleAddCase} variant="contained">{t('common.add', 'Legg til')}</Button>
        </DialogActions>
      </Dialog>

      <UndoFab undoAction={undoAction} onUndo={executeUndo} />
    </Box>
  );
}

export default function UsersPage() {
  return (
    <CompanyProvider>
      <PortalLayout>
        <UsersContent />
      </PortalLayout>
    </CompanyProvider>
  );
}
