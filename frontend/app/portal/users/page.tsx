'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Checkbox, Fab, FormControl, InputLabel, Select, MenuItem, Collapse, TableContainer } from '@mui/material';
import { Check, Close, PersonAdd, PeopleAlt, CheckCircle, Download, FilterList, ExpandMore, ExpandLess, CheckCircleOutline } from '@mui/icons-material';
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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('email');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    
    try {
      await Promise.all(
        selectedIds.map(id => 
          fetchWithAuth(`${API_BASE}/api/company/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ approved: true }),
          })
        )
      );
      
      enqueueSnackbar(
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircle sx={{ animation: `${successScale} 0.3s ease-out` }} />
          <span>{`${selectedIds.length} ${t('portal.users.bulk_approved', 'brukere godkjent')}`}</span>
        </Stack> as any,
        { variant: 'success' }
      );
      
      setSelectedIds([]);
      loadUsers();
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      enqueueSnackbar(t('portal.users.bulk_approve_failed', 'Kunne ikke godkjenne brukere'), { variant: 'error' });
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredUsers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleRow = (userId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedRows(newExpanded);
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Role', 'Status', 'Cases Count', 'Approval Date'];
    const rows = filteredUsers.map(user => [
      user.user_email,
      user.role,
      user.approved ? 'Approved' : 'Pending',
      user.cases?.length || 0,
      user.approved_at ? new Date(user.approved_at).toLocaleDateString('nb-NO') : 'N/A'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    enqueueSnackbar(t('portal.users.exported', 'Brukere eksportert til CSV'), { variant: 'success' });
  };

  const filteredUsers = users
    .filter(user => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (statusFilter === 'approved' && !user.approved) return false;
      if (statusFilter === 'pending' && user.approved) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'email':
          return a.user_email.localeCompare(b.user_email);
        case 'role':
          return a.role.localeCompare(b.role);
        case 'status':
          return (a.approved === b.approved) ? 0 : a.approved ? -1 : 1;
        default:
          return 0;
      }
    });

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{t('portal.users.title', 'Brukere')}</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<Download />}
            variant="outlined"
            onClick={exportToCSV}
            disabled={filteredUsers.length === 0}
          >
            {t('portal.users.export_csv', 'Eksporter CSV')}
          </Button>
        </Stack>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('table.role', 'Rolle')}</InputLabel>
            <Select
              value={roleFilter}
              label={t('table.role', 'Rolle')}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <MenuItem value="all">{t('common.all', 'Alle')}</MenuItem>
              <MenuItem value="Member">Member</MenuItem>
              <MenuItem value="Case Manager">Case Manager</MenuItem>
              <MenuItem value="Admin">Admin</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('table.status', 'Status')}</InputLabel>
            <Select
              value={statusFilter}
              label={t('table.status', 'Status')}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">{t('common.all', 'Alle')}</MenuItem>
              <MenuItem value="approved">{t('common.approved', 'Godkjent')}</MenuItem>
              <MenuItem value="pending">{t('common.pending', 'Venter')}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('common.sort_by', 'Sorter etter')}</InputLabel>
            <Select
              value={sortBy}
              label={t('common.sort_by', 'Sorter etter')}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <MenuItem value="email">{t('table.email', 'E-post')}</MenuItem>
              <MenuItem value="role">{t('table.role', 'Rolle')}</MenuItem>
              <MenuItem value="status">{t('table.status', 'Status')}</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {filteredUsers.length} {t('portal.users.users_found', 'brukere')}
          </Typography>
        </Stack>
      </Paper>

      <Paper elevation={3} sx={{ height: 600 }}>
        <TableVirtuoso
          data={filteredUsers}
          components={{
            Table: (props) => <Table {...props} />,
            TableHead: TableHead,
            TableRow: TableRow,
            TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
          }}
          fixedHeaderContent={() => (
            <TableRow>
              <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper' }}>
                <Checkbox
                  checked={selectedIds.length === filteredUsers.length && filteredUsers.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < filteredUsers.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold', width: 50 }}></TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.email', 'E-post')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.role', 'Rolle')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.status', 'Status')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.cases', 'Saker')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.actions', 'Handlinger')}</TableCell>
            </TableRow>
          )}
          itemContent={(index, user) => {
            const isExpanded = expandedRows.has(user.id);
            return (
              <>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.includes(user.id)}
                    onChange={() => {
                      if (selectedIds.includes(user.id)) {
                        setSelectedIds(selectedIds.filter(id => id !== user.id));
                      } else {
                        setSelectedIds([...selectedIds, user.id]);
                      }
                    }}
                  />
                </TableCell>
                <TableCell padding="none">
                  {user.cases && user.cases.length > 0 && (
                    <IconButton size="small" onClick={() => handleToggleRow(user.id)}>
                      {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </IconButton>
                  )}
                </TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">{user.user_email}</Typography>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
                        {user.cases?.map((caseItem: any, idx: number) => (
                          <Box key={idx} sx={{ py: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {caseItem.case_id}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {caseItem.hours_logged || 0}t logged
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                </TableCell>
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
            );
          }}
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

      {/* Bulk Actions FAB */}
      {selectedIds.length > 0 && (
        <Fab
          variant="extended"
          color="primary"
          sx={{ position: 'fixed', bottom: 80, right: 16 }}
          onClick={handleBulkApprove}
        >
          <CheckCircleOutline sx={{ mr: 1 }} />
          {t('portal.users.approve_selected', 'Godkjenn')} ({selectedIds.length})
        </Fab>
      )}

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
