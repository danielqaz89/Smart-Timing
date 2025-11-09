'use client';

import { useState, useEffect, forwardRef, useCallback } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';
import { useSnackbar } from 'notistack';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface User {
  user_id: string;
  user_since: string;
  hourly_rate: number;
  theme_mode?: string;
  total_logs: number;
  total_projects: number;
  last_activity_date: string;
  archived?: boolean;
}

function UsersContent() {
  const { fetchWithAuth, admin } = useAdmin();
  const { t } = useTranslations();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);
  const [archivedMode, setArchivedMode] = useState<'false' | 'true' | 'any'>('false');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string | null }>({
    open: false,
    userId: null,
  });

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const url = new URL(`${API_BASE}/api/admin/users`);
      if (search) url.searchParams.append('search', search);
      url.searchParams.append('archived', archivedMode);

      const response = await fetchWithAuth(url.toString());
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('admin.users.load_failed', 'Failed to load users'));
      }

      setUsers(data.users);
      setError('');
    } catch (err: any) {
      const msg = err.message || t('admin.users.load_failed', 'Failed to load users');
      setError(msg);
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, search, archivedMode, t, enqueueSnackbar]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDeleteUser = async () => {
    if (!deleteDialog.userId) return;

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/admin/users/${deleteDialog.userId}/archive`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t('admin.users.archive_failed', 'Failed to archive user'));
      }

      setDeleteDialog({ open: false, userId: null });
      await loadUsers();
      const userId = deleteDialog.userId; // capture
      const key = enqueueSnackbar(t('admin.users.archived', 'User archived'), {
        variant: 'info',
        action: () => (
          <Button color="secondary" size="small" onClick={async () => {
            const resp = await fetchWithAuth(`${API_BASE}/api/admin/users/${userId}/restore`, { method: 'PATCH' });
            if (!resp.ok) {
              const data = await resp.json();
              enqueueSnackbar(`${t('admin.users.restore_failed', 'Failed to restore user')}: ${data.error || ''}`, { variant: 'error' });
              return;
            }
            await loadUsers();
            closeSnackbar(key as any);
            enqueueSnackbar(t('admin.users.restored', 'User restored'), { variant: 'success' });
          }}>
            {t('common.undo', 'Angre')}
          </Button>
        ),
        autoHideDuration: 6000,
      } as any);
    } catch (err: any) {
      setError(err.message || t('admin.users.archive_failed', 'Failed to archive user'));
      enqueueSnackbar(`${t('admin.users.archive_failed', 'Failed to archive user')}: ${err?.message || err}`, { variant: 'error' });
    }
  };

  const openDeleteDialog = (userId: string) => {
    setDeleteDialog({ open: true, userId });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, userId: null });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{t('admin.users.title', 'User Management')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadUsers}
            disabled={loading}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
          <FormControl size="small">
            <InputLabel>{t('admin.users.filter_status', 'Status filter')}</InputLabel>
            <Select
              label={t('admin.users.filter_status', 'Status filter')}
              value={archivedMode}
              onChange={(e) => setArchivedMode(e.target.value as 'false' | 'true' | 'any')}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="false">{t('admin.users.status_active', 'Active')}</MenuItem>
              <MenuItem value="true">{t('admin.users.status_archived', 'Archived')}</MenuItem>
              <MenuItem value="any">{t('admin.users.status_all', 'All')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
          <TextField
            fullWidth
            label={t('admin.users.search_label', 'Search users')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('admin.users.search_placeholder', 'Search by user ID...')}
          />
      </Paper>

      <Paper elevation={3} sx={{ height: 600 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : users.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body1" color="text.secondary">
              {t('admin.users.none', 'No users found')}
            </Typography>
          </Box>
        ) : (
          <TableVirtuoso
            data={users}
            style={{ height: '100%' }}
            components={{
              Table: (props) => <Table {...props} />,
              TableHead: TableHead,
              TableRow: TableRow,
              TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
            }}
            fixedHeaderContent={() => (
              <TableRow>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.user_id', 'User ID')}</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.since', 'Since')}</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.logs', 'Logs')}</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.projects', 'Projects')}</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.hourly_rate', 'Hourly Rate')}</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.last_activity', 'Last Activity')}</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.theme', 'Theme')}</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.status', 'Status')}</TableCell>
                <TableCell align="center" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>{t('table.actions', 'Actions')}</TableCell>
              </TableRow>
            )}
            itemContent={(index, user) => (
              <>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {user.user_id}
                  </Typography>
                </TableCell>
                <TableCell>
                  {new Date(user.user_since).toLocaleDateString()}
                </TableCell>
                <TableCell align="right">
                  <Chip label={user.total_logs} color="primary" size="small" />
                </TableCell>
                <TableCell align="right">
                  <Chip label={user.total_projects} color="secondary" size="small" />
                </TableCell>
                <TableCell align="right">
                  {user.hourly_rate ? `${user.hourly_rate} kr` : '-'}
                </TableCell>
                <TableCell>
                  {user.last_activity_date
                    ? new Date(user.last_activity_date).toLocaleDateString()
                    : t('admin.users.no_activity', 'No activity')}
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.theme_mode}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Chip 
                    label={user.archived ? t('admin.users.status_archived', 'Archived') : t('admin.users.status_active', 'Active')}
                    size="small"
                    color={user.archived ? 'default' : 'success'}
                  />
                </TableCell>
                <TableCell align="center">
                  {user.archived ? (
                    <Button
                      size="small"
                      onClick={async () => {
                        const resp = await fetchWithAuth(`${API_BASE}/api/admin/users/${user.user_id}/restore`, { method: 'PATCH' });
                        if (!resp.ok) {
                          const data = await resp.json();
                          enqueueSnackbar(`${t('admin.users.restore_failed', 'Failed to restore user')}: ${data.error || ''}`, { variant: 'error' });
                        } else {
                          await loadUsers();
                          enqueueSnackbar(t('admin.users.restored', 'User restored'), { variant: 'success' });
                        }
                      }}
                      disabled={admin?.role !== 'super_admin'}
                      title={admin?.role !== 'super_admin' ? t('admin.common.super_admin_only', 'Super admin only') : t('admin.users.restore_user', 'Restore user')}
                    >
                      {t('admin.users.restore_user', 'Restore user')}
                    </Button>
                  ) : (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => openDeleteDialog(user.user_id)}
                      disabled={admin?.role !== 'super_admin'}
                      title={admin?.role !== 'super_admin' ? t('admin.common.super_admin_only', 'Super admin only') : t('admin.users.archive_user', 'Archive user')}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </TableCell>
              </>
            )}
          />
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={closeDeleteDialog}>
        <DialogTitle>{t('admin.users.archive_title', 'Archive User')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('admin.users.archive_confirm', 'Are you sure you want to archive this user? You can undo shortly or restore later.')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleDeleteUser} color="warning" variant="contained">
            {t('common.archive', 'Archive')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <UsersContent />
      </AdminLayout>
    </AdminProvider>
  );
}
