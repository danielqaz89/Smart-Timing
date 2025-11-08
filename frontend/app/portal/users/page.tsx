'use client';

import { useEffect, useState, forwardRef } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { Check, Close, PersonAdd } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { CompanyProvider, useCompany } from '../../../contexts/CompanyContext';
import PortalLayout from '../../../components/PortalLayout';
import { useTranslations } from '../../../contexts/TranslationsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function UsersContent() {
  const { t } = useTranslations();
  const { fetchWithAuth } = useCompany();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newCase, setNewCase] = useState('');

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

  const handleApprove = async (id: number) => {
    try {
      await fetchWithAuth(`${API_BASE}/api/company/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: true }),
      });
      loadUsers();
    } catch (error) {
      console.error('Failed to approve:', error);
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
                  color={user.approved ? 'success' : 'warning'}
                  size="small"
                />
              </TableCell>
              <TableCell>{user.cases?.length || 0}</TableCell>
              <TableCell align="right">
                {!user.approved && <IconButton size="small" color="success" onClick={() => handleApprove(user.id)}><Check fontSize="small" /></IconButton>}
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
