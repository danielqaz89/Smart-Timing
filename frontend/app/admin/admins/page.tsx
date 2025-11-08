'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, Chip, IconButton, type ChipProps } from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { AdminProvider, useAdmin } from '../../../contexts/AdminContext';
import AdminLayout from '../../../components/AdminLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  last_login?: string;
  created_at: string;
}

function AdminsContent() {
  const { fetchWithAuth, admin: currentAdmin } = useAdmin();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'admin' as 'super_admin' | 'admin' | 'moderator',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadAdmins = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/admins`);
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (error) {
      console.error('Failed to load admins:', error);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleCreate = async () => {
    setLoading(true);
    setMessage('');
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/admins`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      await loadAdmins();
      setDialogOpen(false);
      setFormData({ username: '', email: '', password: '', role: 'admin' });
      setMessage('Admin created successfully');
    } catch (error) {
      setMessage('Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAdmin) return;
    setLoading(true);
    setMessage('');
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/admins/${editingAdmin.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: formData.email,
          role: formData.role,
          ...(formData.password ? { password: formData.password } : {}),
        }),
      });
      await loadAdmins();
      setDialogOpen(false);
      setEditingAdmin(null);
      setFormData({ username: '', email: '', password: '', role: 'admin' });
      setMessage('Admin updated successfully');
    } catch (error) {
      setMessage('Failed to update admin');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this admin?')) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/admin/admins/${id}`, {
        method: 'DELETE',
      });
      await loadAdmins();
      setMessage('Admin deleted successfully');
    } catch (error) {
      setMessage('Failed to delete admin');
    }
  };

  const openCreateDialog = () => {
    setEditingAdmin(null);
    setFormData({ username: '', email: '', password: '', role: 'admin' });
    setDialogOpen(true);
  };

  const openEditDialog = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setFormData({
      username: admin.username,
      email: admin.email,
      password: '',
      role: admin.role,
    });
    setDialogOpen(true);
  };

  const getRoleColor = (role: string): ChipProps['color'] => {
    switch (role) {
      case 'super_admin': return 'error';
      case 'admin': return 'primary';
      case 'moderator': return 'warning';
      default: return 'default';
    }
  };

  const VirtuosoTableComponents = {
    Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
      <div {...props} ref={ref} style={{ overflowX: 'auto' }} />
    )),
    Table: (props: any) => <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />,
    TableHead: React.forwardRef<HTMLTableSectionElement>((props, ref) => <thead {...props} ref={ref} />),
    TableRow: (props: any) => <tr {...props} style={{ borderBottom: '1px solid #e0e0e0' }} />,
    TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => <tbody {...props} ref={ref} />),
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Admin Panel Management</Typography>
        {currentAdmin?.role === 'super_admin' && (
          <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
            New Admin
          </Button>
        )}
      </Box>

      {message && <Alert severity={message.includes('Failed') ? 'error' : 'success'} sx={{ mb: 2 }}>{message}</Alert>}

      <Box sx={{ height: 600, border: '1px solid #e0e0e0', borderRadius: 1 }}>
        <TableVirtuoso
          data={admins}
          components={VirtuosoTableComponents}
          fixedHeaderContent={() => (
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Username</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Email</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Last Login</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Created</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Actions</th>
            </tr>
          )}
          itemContent={(index, admin) => (
            <>
              <td style={{ padding: '12px' }}>{admin.username}</td>
              <td style={{ padding: '12px' }}>{admin.email}</td>
              <td style={{ padding: '12px' }}>
                <Chip label={admin.role.replace('_', ' ')} size="small" color={getRoleColor(admin.role)} />
              </td>
              <td style={{ padding: '12px' }}>
                {admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never'}
              </td>
              <td style={{ padding: '12px' }}>{new Date(admin.created_at).toLocaleDateString()}</td>
              <td style={{ padding: '12px' }}>
                {currentAdmin?.role === 'super_admin' && (
                  <>
                    <IconButton size="small" onClick={() => openEditDialog(admin)}>
                      <Edit />
                    </IconButton>
                    {admin.id !== currentAdmin.id && (
                      <IconButton size="small" color="error" onClick={() => handleDelete(admin.id)}>
                        <Delete />
                      </IconButton>
                    )}
                  </>
                )}
              </td>
            </>
          )}
        />
      </Box>

      {/* Create/Edit Admin Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAdmin ? 'Edit Admin' : 'Create New Admin'}</DialogTitle>
        <DialogContent>
          {!editingAdmin && (
            <TextField
              fullWidth
              label="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              sx={{ mt: 2, mb: 2 }}
              required
            />
          )}
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label={editingAdmin ? 'New Password (leave blank to keep current)' : 'Password'}
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            sx={{ mb: 2 }}
            required={!editingAdmin}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              ),
            }}
          />
          <TextField
            fullWidth
            select
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            SelectProps={{ native: true }}
          >
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={editingAdmin ? handleUpdate : handleCreate}
            variant="contained"
            disabled={loading || !formData.email || (!editingAdmin && !formData.username) || (!editingAdmin && !formData.password)}
          >
            {editingAdmin ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function AdminAdminsPage() {
  return (
    <AdminProvider>
      <AdminLayout>
        <AdminsContent />
      </AdminLayout>
    </AdminProvider>
  );
}
