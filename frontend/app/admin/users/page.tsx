'use client';

import { useState, useEffect, forwardRef } from 'react';
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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface User {
  user_id: string;
  user_since: string;
  hourly_rate: number;
  theme_mode: string;
  total_logs: number;
  total_projects: number;
  last_activity_date: string;
}

function UsersContent() {
  const { fetchWithAuth, admin } = useAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string | null }>({
    open: false,
    userId: null,
  });

  useEffect(() => {
    loadUsers();
  }, [search]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const url = new URL(`${API_BASE}/api/admin/users`);
      if (search) url.searchParams.append('search', search);

      const response = await fetchWithAuth(url.toString());
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }

      setUsers(data.users);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog.userId) return;

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/admin/users/${deleteDialog.userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setDeleteDialog({ open: false, userId: null });
      loadUsers(); // Reload the list
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
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
        <Typography variant="h4">User Management</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadUsers}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user ID..."
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
              No users found
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
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>User ID</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Since</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Logs</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Projects</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Hourly Rate</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Last Activity</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Theme</TableCell>
                <TableCell align="center" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Actions</TableCell>
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
                    : 'No activity'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.theme_mode}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => openDeleteDialog(user.user_id)}
                    disabled={admin?.role !== 'super_admin'}
                    title={admin?.role !== 'super_admin' ? 'Super admin only' : 'Delete user'}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </>
            )}
          />
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={closeDeleteDialog}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete user "{deleteDialog.userId}"? This will
            remove all their data including logs, projects, templates, and settings. This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>Cancel</Button>
          <Button onClick={handleDeleteUser} color="error" variant="contained">
            Delete Permanently
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
